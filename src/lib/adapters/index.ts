import type { DatabaseAdapter, Driver, ColumnInfo, QueryResult, TableView } from './types';
import { postgresAdapter } from './postgres';
import { mysqlAdapter } from './mysql';
import { sqliteAdapter } from './sqlite';
import { sqlserverAdapter } from './sqlserver';
import { oracleAdapter } from './oracle';
import { redisAdapter } from './redis';

// Re-export types
export type { DatabaseAdapter, Driver, ColumnInfo, TableView } from './types';
export type { QueryResult } from './types';

// Re-export storage utilities
export * from './storage';

// Adapter registry
const adapters: Record<Driver, DatabaseAdapter> = {
  postgres: postgresAdapter,
  mysql: mysqlAdapter,
  sqlite: sqliteAdapter,
  sqlserver: sqlserverAdapter,
  oracle: oracleAdapter,
  redis: redisAdapter,
};

// Get adapter for a driver
export function getAdapter(driver: string): DatabaseAdapter {
  const adapter = adapters[driver as Driver];
  if (!adapter) {
    throw new Error(`Unsupported driver: ${driver}`);
  }
  return adapter;
}

// Build config for database request based on driver
export function buildDatabaseConfig(driver: string, dsn: string): Record<string, unknown> {
  if (driver === 'redis') {
    // Parse Redis DSN: redis://[:password@]host[:port][/db]
    const url = new URL(dsn);
    return {
      host: url.hostname || 'localhost',
      port: url.port ? parseInt(url.port, 10) : 6379,
      password: url.password || undefined,
      db: url.pathname ? parseInt(url.pathname.slice(1), 10) || 0 : 0,
    };
  }
  // SQL databases just need driver and dsn
  return { dsn };
}

// Execute a query via the backend API (for SELECT-like queries that return rows)
export async function executeQuery(driver: string, dsn: string, query: string): Promise<QueryResult> {
  const response = await fetch('/db/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      provider: driver, 
      config: buildDatabaseConfig(driver, dsn), 
      query, 
      params: [] 
    }),
  });
  
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || `HTTP error: ${response.status}`);
  }
  
  return response.json();
}

// Execute a statement via the backend API (for INSERT/UPDATE/DELETE that modify data)
export async function executeStatement(driver: string, dsn: string, query: string): Promise<QueryResult> {
  const response = await fetch('/db/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      provider: driver, 
      config: buildDatabaseConfig(driver, dsn), 
      query, 
      params: [] 
    }),
  });
  
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || `HTTP error: ${response.status}`);
  }
  
  return response.json();
}

// Determine if a SQL string is a query (returns rows) or a statement (modifies data)
function isSelectQuery(query: string): boolean {
  const q = query.trim().toUpperCase();
  const queryPrefixes = ['SELECT', 'WITH', 'SHOW', 'DESCRIBE', 'EXPLAIN', 'PRAGMA'];
  for (const prefix of queryPrefixes) {
    if (q.startsWith(prefix)) return true;
  }
  return q.includes('RETURNING');
}

// Execute SQL - automatically chooses between query and execute endpoints
export async function executeSQL(driver: string, dsn: string, query: string): Promise<QueryResult> {
  if (isSelectQuery(query)) {
    return executeQuery(driver, dsn, query);
  }
  return executeStatement(driver, dsn, query);
}

// High-level API functions that use the adapters

export async function listDatabases(driver: string, dsn: string): Promise<string[]> {
  const adapter = getAdapter(driver);
  const query = adapter.listDatabasesQuery();
  const data = await executeQuery(driver, dsn, query);
  return adapter.parseDatabaseNames(data.rows || []);
}

export async function listTables(driver: string, dsn: string, database?: string): Promise<string[]> {
  const adapter = getAdapter(driver);
  
  // Modify DSN to connect to specific database if provided
  const modifiedDsn = database ? adapter.modifyDsnForDatabase(dsn, database) : dsn;
  const query = adapter.listTablesQuery();
  
  const data = await executeQuery(driver, modifiedDsn, query);
  
  return adapter.parseTableNames(data.rows || [], database);
}

export async function listColumns(driver: string, dsn: string, table: string): Promise<ColumnInfo[]> {
  const adapter = getAdapter(driver);
  const query = adapter.listColumnsQuery(table);
  
  const data = await executeQuery(driver, dsn, query);
  
  return adapter.parseColumns(data.rows || []);
}

// Generate a SELECT * query with driver-specific row limiting
export function selectAllQuery(table: string, driver: string, limit = 100): string {
  const adapter = getAdapter(driver);
  return adapter.selectAllQuery(table, limit);
}

// Create a new database
export async function createDatabase(driver: string, dsn: string, name: string): Promise<void> {
  const adapter = getAdapter(driver);
  const query = adapter.createDatabaseQuery(name);
  
  if (!query) {
    throw new Error(`Creating databases is not supported for ${driver}`);
  }
  
  await executeStatement(driver, dsn, query);
}

// Check if the driver supports database creation
export function supportsCreateDatabase(driver: string): boolean {
  const adapter = getAdapter(driver);
  return adapter.createDatabaseQuery('test') !== null;
}

// Get supported table views for a driver
export function getSupportedTableViews(driver: string): TableView[] {
  const adapter = getAdapter(driver);
  return adapter.supportedTableViews();
}

// Generate query for a specific table view
export function getTableViewQuery(driver: string, table: string, view: TableView): string | null {
  const adapter = getAdapter(driver);
  
  switch (view) {
    case 'records':
      return adapter.selectAllQuery(table);
    case 'columns':
      return adapter.listColumnsQuery(table);
    case 'constraints':
      return adapter.listConstraintsQuery?.(table) ?? null;
    case 'foreignKeys':
      return adapter.listForeignKeysQuery?.(table) ?? null;
    case 'indexes':
      return adapter.listIndexesQuery?.(table) ?? null;
    default:
      return null;
  }
}
