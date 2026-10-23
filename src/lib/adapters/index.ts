import { returnsRows } from "../sql";
import type {
  DatabaseAdapter,
  Driver,
  ColumnInfo,
  QueryResult,
  TableView,
} from "./types";
import { postgresAdapter } from "./postgres";
import { mysqlAdapter } from "./mysql";
import { sqliteAdapter } from "./sqlite";
import { sqlserverAdapter } from "./sqlserver";
import { oracleAdapter } from "./oracle";
import { trinoAdapter } from "./trino";

// Re-export types
export type { DatabaseAdapter, Driver, ColumnInfo, TableView } from "./types";
export type { QueryResult } from "./types";
export { sqlLiteral, tableIdentifier } from "./types";
export { parameterPlaceholder, primaryKeyPredicate } from "./rows";

// Re-export storage utilities
export * from "./storage";

// Adapter registry
const adapters: Record<Driver, DatabaseAdapter> = {
  postgres: postgresAdapter,
  mysql: mysqlAdapter,
  sqlite: sqliteAdapter,
  sqlserver: sqlserverAdapter,
  oracle: oracleAdapter,
  trino: trinoAdapter,
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
export async function executeQuery(
  connectionId: string,
  query: string,
  database?: string,
  params: unknown[] = [],
  signal?: AbortSignal,
  maxRows?: number,
  schema?: string,
  timeoutMs?: number,
): Promise<QueryResult> {
  return requestSQL(
    "query",
    connectionId,
    query,
    database,
    params,
    signal,
    maxRows,
    schema,
    timeoutMs,
  );
}

// Execute a statement via the backend API (for INSERT/UPDATE/DELETE that modify data)
export async function executeStatement(
  connectionId: string,
  query: string,
  database?: string,
  params: unknown[] = [],
  signal?: AbortSignal,
  schema?: string,
): Promise<QueryResult> {
  return requestSQL(
    "execute", connectionId, query, database, params, signal, undefined, schema,
  );
}

async function requestSQL(
  endpoint: "query" | "execute",
  connectionId: string,
  query: string,
  database?: string,
  params: unknown[] = [],
  signal?: AbortSignal,
  maxRows?: number,
  schema?: string,
  timeoutMs?: number,
): Promise<QueryResult> {
  const response = await fetch(
    `/sql/${encodeURIComponent(connectionId)}/${endpoint}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, params, database, maxRows, schema, timeoutMs }),
      signal,
    },
  );

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || `HTTP error: ${response.status}`);
  }

  return response.json();
}

export async function executeSQL(
  connectionId: string,
  query: string,
  database?: string,
  signal?: AbortSignal,
  maxRows?: number,
  driver?: Driver,
  schema?: string,
): Promise<QueryResult> {
  return returnsRows(query, driver)
    ? executeQuery(connectionId, query, database, [], signal, maxRows, schema)
    : executeStatement(connectionId, query, database, [], signal, schema);
}

export async function executeBatch(
  connectionId: string,
  queries: string[],
  database: string | undefined,
  signal: AbortSignal,
  maxRows: number,
  driver?: Driver,
  schema?: string,
): Promise<QueryResult[]> {
  const response = await fetch(
    `/sql/${encodeURIComponent(connectionId)}/batch`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        database,
        schema,
        maxRows,
        statements: queries.map((query) => ({
          query,
          returnsRows: returnsRows(query, driver),
        })),
      }),
    },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Query failed");
  return data;
}

// High-level API functions that use the adapters

export async function listDatabases(
  connectionId: string,
  driver: string,
): Promise<string[]> {
  const adapter = getAdapter(driver);
  const query = adapter.listDatabasesQuery();
  const data = await executeQuery(connectionId, query);
  return adapter.parseDatabaseNames(data.rows || []);
}

export async function listTables(
  connectionId: string,
  driver: string,
  database?: string,
  schema?: string,
): Promise<string[]> {
  const adapter = getAdapter(driver);

  const query = adapter.listTablesQuery(schema);

  const data = await executeQuery(connectionId, query, database);

  return adapter.parseTableNames(data.rows || [], database);
}

export async function listSchemas(
  connectionId: string,
  driver: string,
  database?: string,
): Promise<string[]> {
  const adapter = getAdapter(driver);
  if (!adapter.listSchemasQuery || !adapter.parseSchemaNames) return [];
  const data = await executeQuery(connectionId, adapter.listSchemasQuery(), database);
  return adapter.parseSchemaNames(data.rows || []);
}

// The schema unqualified names resolve in by default, or null when the driver
// has no schema level or the connection has none selected (a Trino catalog).
export async function getDefaultSchema(
  connectionId: string,
  driver: string,
  database?: string,
): Promise<string | null> {
  const adapter = getAdapter(driver);
  if (!adapter.defaultSchemaQuery) return null;
  const data = await executeQuery(connectionId, adapter.defaultSchemaQuery(), database);
  const row = data.rows?.[0];
  const name = row?.name ?? row?.NAME;
  return name == null || name === "" ? null : String(name);
}

export async function listColumns(
  connectionId: string,
  driver: string,
  table: string,
  database?: string,
  schema?: string,
): Promise<ColumnInfo[]> {
  const adapter = getAdapter(driver);
  const query = adapter.listColumnsQuery(table, schema);

  const data = await executeQuery(connectionId, query, database);

  return adapter
    .parseColumns(data.rows || [])
    .map((column) =>
      driver === "oracle" && column.type === "DATE"
        ? { ...column, type: "DATE (date & time)" }
        : column,
    );
}

// Generate a SELECT * query with driver-specific row limiting
export function selectAllQuery(
  table: string,
  driver: string,
  limit = 100,
): string {
  const adapter = getAdapter(driver);
  return adapter.selectAllQuery(table, limit);
}

// Quote an identifier (table/column name) for the given driver
export function quoteIdentifier(driver: string, name: string): string {
  return getAdapter(driver).quoteIdentifier(name);
}

// Cheap connectivity-test query for the given driver
export function pingQuery(driver: string): string {
  return getAdapter(driver).pingQuery();
}

// Create a new database
export async function createDatabase(
  connectionId: string,
  driver: string,
  name: string,
): Promise<void> {
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
  return adapter.createDatabaseQuery("test") !== null;
}

// Get supported table views for a driver
export function getSupportedTableViews(driver: string): TableView[] {
  const adapter = getAdapter(driver);
  return adapter.supportedTableViews();
}

// Generate query for a specific table view
export function getTableViewQuery(
  driver: string,
  table: string,
  view: TableView,
  schema?: string,
): string | null {
  const adapter = getAdapter(driver);

  switch (view) {
    case "records":
      return adapter.selectAllQuery(table, undefined, schema);
    case "columns":
      return adapter.listColumnsQuery(table, schema);
    case "constraints":
      return adapter.listConstraintsQuery?.(table, schema) ?? null;
    case "foreignKeys":
      return adapter.listForeignKeysQuery?.(table, schema) ?? null;
    case "indexes":
      return adapter.listIndexesQuery?.(table, schema) ?? null;
    default:
      return null;
  }
}
