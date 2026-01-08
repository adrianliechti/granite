import type { DatabaseAdapter, Driver, ColumnInfo, QueryResult, TableView } from './types';
import { postgresAdapter } from './postgres';
import { mysqlAdapter } from './mysql';
import { sqliteAdapter } from './sqlite';
import { sqlserverAdapter } from './sqlserver';
import { oracleAdapter } from './oracle';

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
};

// Get adapter for a driver
export function getAdapter(driver: string): DatabaseAdapter {
  const adapter = adapters[driver as Driver];
  if (!adapter) {
    throw new Error(`Unsupported driver: ${driver}`);
  }
  return adapter;
}

// Execute a query via the backend API (for SELECT-like queries that return rows)
export async function executeQuery(connectionId: string, query: string): Promise<QueryResult> {
  const response = await fetch(`/sql/${encodeURIComponent(connectionId)}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, params: [] }),
  });
  
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || `HTTP error: ${response.status}`);
  }
  
  return response.json();
}

// Execute a statement via the backend API (for INSERT/UPDATE/DELETE that modify data)
export async function executeStatement(connectionId: string, query: string): Promise<QueryResult> {
  const response = await fetch(`/sql/${encodeURIComponent(connectionId)}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, params: [] }),
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
export async function executeSQL(connectionId: string, query: string): Promise<QueryResult> {
  if (isSelectQuery(query)) {
    return executeQuery(connectionId, query);
  }
  return executeStatement(connectionId, query);
}

// High-level API functions that use the adapters

export async function listDatabases(connectionId: string, driver: string): Promise<string[]> {
  const adapter = getAdapter(driver);
  const query = adapter.listDatabasesQuery();
  const data = await executeQuery(connectionId, query);
  return adapter.parseDatabaseNames(data.rows || []);
}

export async function listTables(connectionId: string, driver: string, database?: string): Promise<string[]> {
  const adapter = getAdapter(driver);
  
  // Note: For database-specific queries, the connection should already be configured for that database
  // or the adapter should handle it via the query
  const query = adapter.listTablesQuery();
  
  const data = await executeQuery(connectionId, query);
  
  return adapter.parseTableNames(data.rows || [], database);
}

export async function listColumns(connectionId: string, driver: string, table: string): Promise<ColumnInfo[]> {
  const adapter = getAdapter(driver);
  const query = adapter.listColumnsQuery(table);
  
  const data = await executeQuery(connectionId, query);
  
  return adapter.parseColumns(data.rows || []);
}

// Generate a SELECT * query with driver-specific row limiting
export function selectAllQuery(table: string, driver: string, limit = 100): string {
  const adapter = getAdapter(driver);
  return adapter.selectAllQuery(table, limit);
}

// Create a new database
export async function createDatabase(connectionId: string, driver: string, name: string): Promise<void> {
  const adapter = getAdapter(driver);
  const query = adapter.createDatabaseQuery(name);
  
  if (!query) {
    throw new Error(`Creating databases is not supported for ${driver}`);
  }
  
  await executeStatement(connectionId, query);
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
