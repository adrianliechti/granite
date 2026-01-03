import type { DatabaseAdapter, ColumnInfo } from './types';

export const sqliteAdapter: DatabaseAdapter = {
  driver: 'sqlite',

  listDatabasesQuery() {
    // SQLite doesn't have multiple databases in same connection
    return `SELECT 'main' as name`;
  },

  listTablesQuery() {
    return `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`;
  },

  listColumnsQuery(table: string) {
    return `PRAGMA table_info(${table})`;
  },

  selectAllQuery(table: string, limit = 100) {
    return `SELECT * FROM ${table} LIMIT ${limit}`;
  },

  createDatabaseQuery(_name: string) {
    // SQLite doesn't support creating databases - it's file-based
    return null;
  },

  modifyDsnForDatabase(dsn: string, _database: string) {
    // SQLite doesn't need DSN modification - it's file-based
    return dsn;
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
      type: String(row.type || 'TEXT'),
      nullable: row.notnull === 0,
      primaryKey: row.pk === 1,
    }));
  },
};
