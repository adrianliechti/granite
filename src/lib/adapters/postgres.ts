import type { DatabaseAdapter, ColumnInfo, TableView } from './types';
import { sqlLiteral, tableIdentifier } from './types.ts';

// The schema a metadata query looks in: the given one, or the session's current one.
function schemaOf(schema?: string): string {
  return schema ? `'${sqlLiteral(schema)}'` : 'current_schema()';
}

export const postgresAdapter: DatabaseAdapter = {
  driver: 'postgres',

  quoteIdentifier(name: string) {
    return `"${name.replace(/"/g, '""')}"`;
  },

  pingQuery() {
    return 'SELECT 1';
  },

  supportedTableViews(): TableView[] {
    return ['records', 'columns', 'constraints', 'foreignKeys', 'indexes'];
  },

  listDatabasesQuery() {
    return `SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname`;
  },

  listSchemasQuery() {
    return `SELECT nspname FROM pg_namespace
      WHERE nspname <> 'information_schema' AND nspname !~ '^pg_'
        AND has_schema_privilege(oid, 'USAGE')
      ORDER BY nspname`;
  },

  parseSchemaNames(rows) {
    return rows.map((row) => String(row.nspname));
  },

  defaultSchemaQuery() {
    return `SELECT current_schema() AS name`;
  },

  sessionSchema: true,

  listTablesQuery(schema?: string) {
    return `SELECT tablename FROM pg_tables WHERE schemaname = ${schemaOf(schema)} ORDER BY tablename`;
  },

  listColumnsQuery(table: string, schema?: string) {
    return `
      SELECT
        column_name as name,
        data_type as type,
        is_nullable = 'YES' as nullable,
        COALESCE(
          (SELECT true FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON tc.constraint_name = kcu.constraint_name
             AND tc.constraint_schema = kcu.constraint_schema
             AND tc.table_name = kcu.table_name
           WHERE tc.table_name = c.table_name AND tc.table_schema = c.table_schema
             AND kcu.column_name = c.column_name AND tc.constraint_type = 'PRIMARY KEY'
           LIMIT 1),
          false
        ) as primary_key
      FROM information_schema.columns c
      WHERE table_name = '${sqlLiteral(table)}' AND table_schema = ${schemaOf(schema)}
      ORDER BY ordinal_position
    `;
  },

  selectAllQuery(table: string, limit = 100, schema?: string) {
    return `SELECT * FROM ${tableIdentifier(this, table, schema)} LIMIT ${limit}`;
  },

  createDatabaseQuery(name: string) {
    return `CREATE DATABASE ${this.quoteIdentifier(name)}`;
  },

  listConstraintsQuery(table: string, schema?: string) {
    return `
      SELECT 
        tc.constraint_name,
        tc.constraint_type,
        kcu.column_name
      FROM information_schema.table_constraints tc
      LEFT JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name 
        AND tc.table_schema = kcu.table_schema
        AND tc.table_name = kcu.table_name
      WHERE tc.table_name = '${sqlLiteral(table)}'
        AND tc.table_schema = ${schemaOf(schema)}
      ORDER BY tc.constraint_name, kcu.ordinal_position
    `;
  },

  listForeignKeysQuery(table: string, schema?: string) {
    return `
      SELECT 
        con.conname AS constraint_name,
        col.attname AS column_name,
        foreign_ns.nspname AS foreign_schema,
        foreign_table.relname AS foreign_table,
        foreign_col.attname AS foreign_column
      FROM pg_constraint con
      JOIN pg_class tbl ON tbl.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
      JOIN pg_class foreign_table ON foreign_table.oid = con.confrelid
      JOIN pg_namespace foreign_ns ON foreign_ns.oid = foreign_table.relnamespace
      CROSS JOIN LATERAL unnest(con.conkey, con.confkey)
        WITH ORDINALITY AS keys(column_id, foreign_column_id, position)
      JOIN pg_attribute col ON col.attrelid = con.conrelid AND col.attnum = keys.column_id
      JOIN pg_attribute foreign_col ON foreign_col.attrelid = con.confrelid AND foreign_col.attnum = keys.foreign_column_id
      WHERE tbl.relname = '${sqlLiteral(table)}' AND ns.nspname = ${schemaOf(schema)} AND con.contype = 'f'
      ORDER BY con.conname, keys.position
    `;
  },

  listIndexesQuery(table: string, schema?: string) {
    return `
      SELECT 
        indexname AS index_name,
        indexdef AS definition
      FROM pg_indexes 
      WHERE tablename = '${sqlLiteral(table)}'
        AND schemaname = ${schemaOf(schema)}
      ORDER BY indexname
    `;
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
