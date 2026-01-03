import type { DatabaseAdapter, ColumnInfo } from './types';

export const sqlserverAdapter: DatabaseAdapter = {
  driver: 'sqlserver',

  listDatabasesQuery() {
    // Exclude tempdb and model, include master, msdb, and user databases
    return `SELECT name FROM sys.databases WHERE name NOT IN ('tempdb', 'model') ORDER BY name`;
  },

  listTablesQuery() {
    return `SELECT TABLE_NAME as name FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`;
  },

  listColumnsQuery(table: string) {
    return `
      SELECT 
        c.COLUMN_NAME as name,
        c.DATA_TYPE as type,
        CASE WHEN c.IS_NULLABLE = 'YES' THEN 1 ELSE 0 END as nullable,
        CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END as primary_key
      FROM INFORMATION_SCHEMA.COLUMNS c
      LEFT JOIN (
        SELECT ku.COLUMN_NAME
        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
        JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
        WHERE tc.TABLE_NAME = '${table}' AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
      ) pk ON c.COLUMN_NAME = pk.COLUMN_NAME
      WHERE c.TABLE_NAME = '${table}'
      ORDER BY c.ORDINAL_POSITION
    `;
  },

  selectAllQuery(table: string, limit = 100) {
    // SQL Server uses TOP instead of LIMIT
    return `SELECT TOP ${limit} * FROM ${table}`;
  },

  modifyDsnForDatabase(dsn: string, database: string) {
    // MSSQL DSN format: sqlserver://user:pass@host:port?database=dbname
    const url = new URL(dsn);
    url.searchParams.set('database', database);
    return url.toString();
  },

  parseDatabaseNames(rows) {
    return rows.map((row) => String(row.name));
  },

  parseTableNames(rows) {
    return rows.map((row) => String(row.name));
  },

  parseColumns(rows): ColumnInfo[] {
    return rows.map((row) => ({
      name: String(row.name),
      type: String(row.type),
      nullable: Boolean(row.nullable),
      primaryKey: Boolean(row.primary_key),
    }));
  },
};
