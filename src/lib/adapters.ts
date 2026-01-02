// Database adapter interface
export interface DatabaseAdapter {
  driver: 'postgres' | 'mysql' | 'sqlite';
  
  // List all databases
  listDatabases(): Promise<string[]>;
  
  // List all tables in a database
  listTables(database?: string): Promise<string[]>;
  
  // List columns for a table
  listColumns(table: string, database?: string): Promise<ColumnInfo[]>;
  
  // Execute a query
  execute(query: string, params?: unknown[]): Promise<QueryResult>;
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
}

export interface QueryResult {
  columns?: string[];
  rows?: Record<string, unknown>[];
  rowsAffected?: number;
  error?: string;
}

// SQL queries for each database type
const QUERIES = {
  postgres: {
    listDatabases: `SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname`,
    listTables: `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    listColumns: (table: string) => `
      SELECT 
        column_name as name,
        data_type as type,
        is_nullable = 'YES' as nullable,
        COALESCE(
          (SELECT true FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
           WHERE tc.table_name = c.table_name AND kcu.column_name = c.column_name AND tc.constraint_type = 'PRIMARY KEY'),
          false
        ) as primary_key
      FROM information_schema.columns c
      WHERE table_name = '${table}' AND table_schema = 'public'
      ORDER BY ordinal_position
    `,
  },
  mysql: {
    listDatabases: `SHOW DATABASES`,
    listTables: `SHOW TABLES`,
    listColumns: (table: string) => `DESCRIBE ${table}`,
  },
  sqlite: {
    listDatabases: `SELECT 'main' as name`, // SQLite doesn't have multiple databases in same connection
    listTables: `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    listColumns: (table: string) => `PRAGMA table_info(${table})`,
  },
} as const;

export function getAdapterQueries(driver: 'postgres' | 'mysql' | 'sqlite') {
  return QUERIES[driver];
}

// API calls for database operations
export async function listDatabases(driver: string, dsn: string): Promise<string[]> {
  const queries = QUERIES[driver as keyof typeof QUERIES];
  if (!queries) throw new Error(`Unsupported driver: ${driver}`);
  
  const response = await fetch('/api/sql/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ driver, dsn, query: queries.listDatabases, params: [] }),
  });
  
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  
  // Extract database names from rows
  return (data.rows || []).map((row: Record<string, unknown>) => {
    // Different drivers return different column names
    return String(row.datname || row.Database || row.name || Object.values(row)[0]);
  });
}

export async function listTables(driver: string, dsn: string, database?: string): Promise<string[]> {
  const queries = QUERIES[driver as keyof typeof QUERIES];
  if (!queries) throw new Error(`Unsupported driver: ${driver}`);
  
  // Modify DSN to connect to specific database
  let modifiedDsn = dsn;
  if (database) {
    if (driver === 'postgres') {
      // PostgreSQL DSN format: postgres://user:pass@host:port/dbname?params
      const url = new URL(dsn);
      url.pathname = `/${database}`;
      modifiedDsn = url.toString();
    } else if (driver === 'mysql') {
      // MySQL DSN format: user:pass@tcp(host:port)/dbname
      const dsnParts = dsn.split('/');
      if (dsnParts.length > 1) {
        dsnParts[dsnParts.length - 1] = database;
        modifiedDsn = dsnParts.join('/');
      } else {
        modifiedDsn = `${dsn}/${database}`;
      }
    }
  }
  
  const response = await fetch('/api/sql/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ driver, dsn: modifiedDsn, query: queries.listTables, params: [] }),
  });
  
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  
  // Extract table names from rows
  return (data.rows || []).map((row: Record<string, unknown>) => {
    // Different drivers return different column names:
    // - PostgreSQL: tablename
    // - MySQL: Tables_in_<database_name> (dynamic)
    // - SQLite: name
    // So we check for these known patterns, otherwise take first value
    const value = row.tablename || row.name || row[`Tables_in_${database}`] || Object.values(row)[0];
    return String(value);
  });
}

export async function listColumns(driver: string, dsn: string, table: string): Promise<ColumnInfo[]> {
  const queries = QUERIES[driver as keyof typeof QUERIES];
  if (!queries) throw new Error(`Unsupported driver: ${driver}`);
  
  const response = await fetch('/api/sql/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ driver, dsn, query: queries.listColumns(table), params: [] }),
  });
  
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  
  // Normalize column info across drivers
  return (data.rows || []).map((row: Record<string, unknown>) => {
    if (driver === 'postgres') {
      return {
        name: String(row.name),
        type: String(row.type),
        nullable: Boolean(row.nullable),
        primaryKey: Boolean(row.primary_key),
      };
    } else if (driver === 'mysql') {
      return {
        name: String(row.Field),
        type: String(row.Type),
        nullable: row.Null === 'YES',
        primaryKey: row.Key === 'PRI',
      };
    } else {
      // SQLite
      return {
        name: String(row.name),
        type: String(row.type),
        nullable: row.notnull === 0,
        primaryKey: row.pk === 1,
      };
    }
  });
}
