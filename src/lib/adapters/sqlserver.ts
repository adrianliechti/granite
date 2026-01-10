import type { DatabaseAdapter, ColumnInfo, TableView } from './types';

export const sqlserverAdapter: DatabaseAdapter = {
  driver: 'sqlserver',

  supportedTableViews(): TableView[] {
    return ['records', 'columns', 'constraints', 'foreignKeys', 'indexes'];
  },

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

  createDatabaseQuery(name: string) {
    return `CREATE DATABASE [${name}]`;
  },

  listConstraintsQuery(table: string) {
    return `
      SELECT 
        tc.CONSTRAINT_NAME AS constraint_name,
        tc.CONSTRAINT_TYPE AS constraint_type,
        kcu.COLUMN_NAME AS column_name
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
      LEFT JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu 
        ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
      WHERE tc.TABLE_NAME = '${table}'
      ORDER BY tc.CONSTRAINT_NAME, kcu.ORDINAL_POSITION
    `;
  },

  listForeignKeysQuery(table: string) {
    return `
      SELECT 
        fk.name AS constraint_name,
        COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS column_name,
        OBJECT_NAME(fkc.referenced_object_id) AS foreign_table,
        COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) AS foreign_column
      FROM sys.foreign_keys fk
      JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
      WHERE OBJECT_NAME(fk.parent_object_id) = '${table}'
      ORDER BY fk.name
    `;
  },

  listIndexesQuery(table: string) {
    return `
      SELECT 
        i.name AS index_name,
        i.type_desc AS index_type,
        i.is_unique,
        i.is_primary_key,
        STRING_AGG(c.name, ', ') AS columns
      FROM sys.indexes i
      JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
      JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
      WHERE OBJECT_NAME(i.object_id) = '${table}' AND i.name IS NOT NULL
      GROUP BY i.name, i.type_desc, i.is_unique, i.is_primary_key
      ORDER BY i.name
    `;
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
