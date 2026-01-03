// Supported database drivers
export type Driver = 'postgres' | 'mysql' | 'sqlite' | 'sqlserver' | 'oracle';

// Column information
export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
}

// Query result from the backend
export interface QueryResult {
  columns?: string[];
  rows?: Record<string, unknown>[];
  rowsAffected?: number;
  error?: string;
}

// Database adapter interface - each driver implements this
export interface DatabaseAdapter {
  readonly driver: Driver;
  
  // SQL Queries
  listDatabasesQuery(): string;
  listTablesQuery(): string;
  listColumnsQuery(table: string): string;
  selectAllQuery(table: string, limit?: number): string;
  createDatabaseQuery(name: string): string | null; // Returns null if not supported
  
  // DSN manipulation
  modifyDsnForDatabase(dsn: string, database: string): string;
  
  // Result parsing - convert raw query results to normalized format
  parseDatabaseNames(rows: Record<string, unknown>[]): string[];
  parseTableNames(rows: Record<string, unknown>[], database?: string): string[];
  parseColumns(rows: Record<string, unknown>[]): ColumnInfo[];
}
