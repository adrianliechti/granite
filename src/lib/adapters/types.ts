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
  rows_affected?: number;
  error?: string;
}

// Table view types for metadata tabs
export type TableView = 'records' | 'columns' | 'constraints' | 'foreignKeys' | 'indexes';

// Escape a string for embedding in a single-quoted SQL literal
export function sqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

// Database adapter interface - each driver implements this
export interface DatabaseAdapter {
  readonly driver: Driver;

  // Quote an identifier (table/column name) for this dialect
  quoteIdentifier(name: string): string;

  // Cheap connectivity-test query for this dialect
  pingQuery(): string;

  // SQL Queries
  listDatabasesQuery(): string;
  listTablesQuery(): string;
  listColumnsQuery(table: string): string;
  selectAllQuery(table: string, limit?: number): string;
  createDatabaseQuery(name: string): string | null; // Returns null if not supported
  
  // Optional metadata queries - not all drivers support these
  listConstraintsQuery?(table: string): string;
  listForeignKeysQuery?(table: string): string;
  listIndexesQuery?(table: string): string;
  
  // Returns which table views this driver supports
  supportedTableViews(): TableView[];
  
  // Result parsing - convert raw query results to normalized format
  parseDatabaseNames(rows: Record<string, unknown>[]): string[];
  parseTableNames(rows: Record<string, unknown>[], database?: string): string[];
  parseColumns(rows: Record<string, unknown>[]): ColumnInfo[];
}
