import type { DatabaseAdapter, ColumnInfo, TableView } from './types';

export const postgresAdapter: DatabaseAdapter = {
  driver: 'postgres',

  supportedTableViews(): TableView[] {
    return ['records', 'columns', 'constraints', 'foreignKeys', 'indexes'];
  },

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

  listConstraintsQuery(table: string) {
    return `
      SELECT 
        tc.constraint_name,
        tc.constraint_type,
        kcu.column_name
      FROM information_schema.table_constraints tc
      LEFT JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name 
        AND tc.table_schema = kcu.table_schema
      WHERE tc.table_name = '${table}' 
        AND tc.table_schema = 'public'
      ORDER BY tc.constraint_name, kcu.ordinal_position
    `;
  },

  listForeignKeysQuery(table: string) {
    return `
      SELECT 
        tc.constraint_name,
        kcu.column_name,
        ccu.table_name AS foreign_table,
        ccu.column_name AS foreign_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu 
        ON tc.constraint_name = ccu.constraint_name
      WHERE tc.table_name = '${table}' 
        AND tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
      ORDER BY tc.constraint_name
    `;
  },

  listIndexesQuery(table: string) {
    return `
      SELECT 
        indexname AS index_name,
        indexdef AS definition
      FROM pg_indexes 
      WHERE tablename = '${table}'
        AND schemaname = 'public'
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
