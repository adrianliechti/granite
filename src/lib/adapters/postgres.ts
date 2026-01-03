import type { DatabaseAdapter, ColumnInfo } from './types';

export const postgresAdapter: DatabaseAdapter = {
  driver: 'postgres',

  listDatabasesQuery() {
    return `SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname`;
  },

  listTablesQuery() {
    return `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;
  },

  listColumnsQuery(table: string) {
    return `
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
    `;
  },

  selectAllQuery(table: string, limit = 100) {
    return `SELECT * FROM ${table} LIMIT ${limit}`;
  },

  createDatabaseQuery(name: string) {
    return `CREATE DATABASE "${name}"`;
  },

  modifyDsnForDatabase(dsn: string, database: string) {
    // PostgreSQL DSN format: postgres://user:pass@host:port/dbname?params
    const url = new URL(dsn);
    url.pathname = `/${database}`;
    return url.toString();
  },

  parseDatabaseNames(rows) {
    return rows.map((row) => String(row.datname));
  },

  parseTableNames(rows) {
    return rows.map((row) => String(row.tablename));
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
