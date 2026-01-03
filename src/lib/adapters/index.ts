import type { DatabaseAdapter, Driver, ColumnInfo, QueryResult } from './types';
import { postgresAdapter } from './postgres';
import { mysqlAdapter } from './mysql';
import { sqliteAdapter } from './sqlite';
import { sqlserverAdapter } from './sqlserver';
import { oracleAdapter } from './oracle';

// Re-export types
export type { DatabaseAdapter, Driver, ColumnInfo } from './types';
export type { QueryResult } from './types';

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

// Helper to execute a query via the backend API
async function executeQueryRaw(driver: string, dsn: string, query: string): Promise<QueryResult> {
  const response = await fetch('/api/sql/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ driver, dsn, query, params: [] }),
  });
  
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || `HTTP error: ${response.status}`);
  }
  
  return response.json();
}

// Execute a SQL script - uses adapter's executeScript if available (e.g., Oracle multi-statement)
export async function executeScript(driver: string, dsn: string, sql: string): Promise<QueryResult> {
  const adapter = getAdapter(driver);
  const exec = (query: string) => executeQueryRaw(driver, dsn, query);
  
  if (adapter.executeScript) {
    return adapter.executeScript(sql, exec);
  }
  
  // Default: execute as single query
  return exec(sql);
}

// High-level API functions that use the adapters

export async function listDatabases(driver: string, dsn: string): Promise<string[]> {
  const adapter = getAdapter(driver);
  const query = adapter.listDatabasesQuery();
  const data = await executeQueryRaw(driver, dsn, query);
  return adapter.parseDatabaseNames(data.rows || []);
}

export async function listTables(driver: string, dsn: string, database?: string): Promise<string[]> {
  const adapter = getAdapter(driver);
  
  // Modify DSN to connect to specific database if provided
  const modifiedDsn = database ? adapter.modifyDsnForDatabase(dsn, database) : dsn;
  const query = adapter.listTablesQuery();
  
  const data = await executeQueryRaw(driver, modifiedDsn, query);
  
  return adapter.parseTableNames(data.rows || [], database);
}

export async function listColumns(driver: string, dsn: string, table: string): Promise<ColumnInfo[]> {
  const adapter = getAdapter(driver);
  const query = adapter.listColumnsQuery(table);
  
  const data = await executeQueryRaw(driver, dsn, query);
  
  return adapter.parseColumns(data.rows || []);
}

// Generate a SELECT * query with driver-specific row limiting
export function selectAllQuery(table: string, driver: string, limit = 100): string {
  const adapter = getAdapter(driver);
  return adapter.selectAllQuery(table, limit);
}
