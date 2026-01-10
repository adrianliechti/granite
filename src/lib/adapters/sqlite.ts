import type { DatabaseAdapter, ColumnInfo, TableView } from './types';

export const sqliteAdapter: DatabaseAdapter = {
  driver: 'sqlite',

  supportedTableViews(): TableView[] {
    // SQLite has limited metadata support
    return ['records', 'columns', 'indexes'];
  },

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

  createDatabaseQuery() {
    // SQLite doesn't support creating databases - it's file-based
    return null;
  },

  listIndexesQuery(table: string) {
    return `PRAGMA index_list(${table})`;
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
