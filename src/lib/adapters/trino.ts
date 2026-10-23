import type { DatabaseAdapter, ColumnInfo, TableView } from './types';
import { sqlLiteral, tableIdentifier } from './types.ts';

// Trino organizes tables as catalog.schema.table: Granite's database level is the
// catalog, and both catalog and schema become the session's defaults, so SQL in
// the editor resolves in the selected ones.
export const trinoAdapter: DatabaseAdapter = {
  driver: 'trino',

  databaseLabel: 'Catalog',

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
    return `SHOW CATALOGS`;
  },

  // Schemas of the session catalog (the selected database).
  listSchemasQuery() {
    return `SHOW SCHEMAS`;
  },

  parseSchemaNames(rows) {
    return rows
      .map((row) => String(row.Schema ?? Object.values(row)[0]))
      .filter((name) => name !== 'information_schema');
  },

  defaultSchemaQuery() {
    return `SELECT current_schema AS name`;
  },

  sessionSchema: true,

  listTablesQuery(schema?: string) {
    return schema ? `SHOW TABLES FROM ${this.quoteIdentifier(schema)}` : `SHOW TABLES`;
  },

  listColumnsQuery(table: string, schema?: string) {
    return `
      SELECT
        column_name AS name,
        data_type AS type,
        is_nullable = 'YES' AS nullable
      FROM information_schema.columns
      WHERE table_name = '${sqlLiteral(table)}'
        AND table_schema = ${schema ? `'${sqlLiteral(schema)}'` : 'current_schema'}
      ORDER BY ordinal_position
    `;
  },

  selectAllQuery(table: string, limit = 100, schema?: string) {
    return `SELECT * FROM ${tableIdentifier(this, table, schema)} LIMIT ${limit}`;
  },

  createDatabaseQuery() {
    return null;
  },

  parseDatabaseNames(rows) {
    return rows.map((row) => String(row.Catalog ?? Object.values(row)[0]));
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
