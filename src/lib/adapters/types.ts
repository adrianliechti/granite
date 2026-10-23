// Supported database drivers
export type { DatabaseDriver as Driver } from "../../types";
import type { DatabaseDriver as Driver } from "../../types";

// Column information
export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  primaryKeyOrdinal?: number;
}

// Query result from the backend
export interface QueryResult {
  columns?: string[];
  rows?: Record<string, unknown>[];
  rows_affected?: number;
  truncated?: boolean;
  error?: string;
}

// Table view types for metadata tabs
export type TableView =
  | "records"
  | "columns"
  | "constraints"
  | "foreignKeys"
  | "indexes";

// Escape a string for embedding in a single-quoted SQL literal
export function sqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

export function tableIdentifier(
  adapter: DatabaseAdapter,
  table: string,
  schema?: string,
): string {
  return schema
    ? `${adapter.quoteIdentifier(schema)}.${adapter.quoteIdentifier(table)}`
    : adapter.quoteIdentifier(table);
}

// Database adapter interface - each driver implements this
export interface DatabaseAdapter {
  readonly driver: Driver;

  // Quote an identifier (table/column name) for this dialect
  quoteIdentifier(name: string): string;

  // Cheap connectivity-test query for this dialect
  pingQuery(): string;

  // What the level above schemas is called: "Catalog" in Trino, else "Database".
  readonly databaseLabel?: string;

  // SQL Queries
  listDatabasesQuery(): string;

  // Drivers with a schema level below the database list its schemas and name
  // the one unqualified names resolve in by default (one row, column "name").
  // sessionSchema says whether a picked schema can become that default for SQL
  // typed in the editor; without it (SQL Server) only generated SQL is qualified.
  listSchemasQuery?(): string;
  parseSchemaNames?(rows: Record<string, unknown>[]): string[];
  defaultSchemaQuery?(): string;
  readonly sessionSchema?: boolean;
  listTablesQuery(schema?: string): string;
  listColumnsQuery(table: string, schema?: string): string;
  selectAllQuery(table: string, limit?: number, schema?: string): string;
  createDatabaseQuery(name: string): string | null; // Returns null if not supported

  // Optional metadata queries - not all drivers support these
  listConstraintsQuery?(table: string, schema?: string): string;
  listForeignKeysQuery?(table: string, schema?: string): string;
  listIndexesQuery?(table: string, schema?: string): string;

  // Returns which table views this driver supports
  supportedTableViews(): TableView[];

  // Result parsing - convert raw query results to normalized format
  parseDatabaseNames(rows: Record<string, unknown>[]): string[];
  parseTableNames(rows: Record<string, unknown>[], database?: string): string[];
  parseColumns(rows: Record<string, unknown>[]): ColumnInfo[];
}
