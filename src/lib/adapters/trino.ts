import type { DatabaseAdapter, ColumnInfo, TableView } from './types';
import { sqlLiteral } from './types';

// Trino organizes tables as catalog.schema.table; Granite's single
// "database" level maps to "catalog.schema" pairs
export const trinoAdapter: DatabaseAdapter = {
  driver: 'trino',

  quoteIdentifier(name: string) {
    return `"${name.replace(/"/g, '""')}"`;
  },

  pingQuery() {
    return 'SELECT 1';
  },

  supportedTableViews(): TableView[] {
    return ['records', 'columns'];
  },

  listDatabasesQuery() {
    return `
      SELECT table_catalog || '.' || table_schem AS name
      FROM system.jdbc.schemas
      WHERE table_schem NOT IN ('information_schema')
      ORDER BY 1
    `;
  },

  listTablesQuery() {
    return `SHOW TABLES`;
  },

  listColumnsQuery(table: string) {
    return `
      SELECT
        column_name AS name,
        data_type AS type,
        is_nullable = 'YES' AS nullable
      FROM information_schema.columns
      WHERE table_name = '${sqlLiteral(table)}' AND table_schema = current_schema
      ORDER BY ordinal_position
    `;
  },

  selectAllQuery(table: string, limit = 100) {
    return `SELECT * FROM ${this.quoteIdentifier(table)} LIMIT ${limit}`;
  },

  createDatabaseQuery() {
    return null;
  },

  parseDatabaseNames(rows) {
    return rows.map((row) => String(row.name));
  },

  parseTableNames(rows) {
    return rows.map((row) => String(row.Table ?? Object.values(row)[0]));
  },

  parseColumns(rows): ColumnInfo[] {
    return rows.map((row) => ({
      name: String(row.name),
      type: String(row.type),
      nullable: Boolean(row.nullable),
      primaryKey: false,
    }));
  },
};
