import type { DatabaseAdapter, ColumnInfo, TableView } from './types';
import { sqlLiteral, tableIdentifier } from './types.ts';

// The schema a metadata query looks in: the given one, or the user's default.
function schemaOf(schema?: string): string {
  return schema ? `N'${sqlLiteral(schema)}'` : 'SCHEMA_NAME()';
}

export const sqlserverAdapter: DatabaseAdapter = {
  driver: 'sqlserver',

  quoteIdentifier(name: string) {
    return `[${name.replace(/]/g, ']]')}]`;
  },

  pingQuery() {
    return 'SELECT 1';
  },

  supportedTableViews(): TableView[] {
    return ['records', 'columns', 'constraints', 'foreignKeys', 'indexes'];
  },

  listDatabasesQuery() {
    // Exclude tempdb and model, include master, msdb, and user databases
    return `SELECT name FROM sys.databases WHERE name NOT IN ('tempdb', 'model') ORDER BY name`;
  },

  // SQL Server cannot change a session's default schema: browsing another schema
  // qualifies generated SQL, while the editor keeps resolving in the default.
  listSchemasQuery() {
    return `SELECT s.name FROM sys.schemas s
      WHERE s.name = SCHEMA_NAME() OR EXISTS (SELECT 1 FROM sys.tables t WHERE t.schema_id = s.schema_id)
      ORDER BY s.name`;
  },

  parseSchemaNames(rows) {
    return rows.map((row) => String(row.name));
  },

  defaultSchemaQuery() {
    return `SELECT SCHEMA_NAME() AS name`;
  },

  sessionSchema: false,

  listTablesQuery(schema?: string) {
    // Without a schema, unqualified table names resolve in the default schema, then dbo.
    const where = schema ? `TABLE_SCHEMA = ${schemaOf(schema)}` : `TABLE_SCHEMA IN (SCHEMA_NAME(), 'dbo')`;
    return `SELECT DISTINCT TABLE_NAME as name FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' AND ${where} ORDER BY name`;
  },

  listColumnsQuery(table: string, schema?: string) {
    const tableSchema = schema
      ? schemaOf(schema)
      : `OBJECT_SCHEMA_NAME(OBJECT_ID(N'${sqlLiteral(this.quoteIdentifier(table))}'))`;
    return `
      SELECT 
        c.COLUMN_NAME as name,
        c.DATA_TYPE as type,
        CASE WHEN c.IS_NULLABLE = 'YES' THEN 1 ELSE 0 END as nullable,
        CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END as primary_key,
        pk.ORDINAL_POSITION as primary_key_ordinal
      FROM INFORMATION_SCHEMA.COLUMNS c
      LEFT JOIN (
        SELECT ku.TABLE_CATALOG, ku.TABLE_SCHEMA, ku.TABLE_NAME, ku.COLUMN_NAME, ku.ORDINAL_POSITION
        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
        JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
          ON tc.CONSTRAINT_CATALOG = ku.CONSTRAINT_CATALOG
          AND tc.CONSTRAINT_SCHEMA = ku.CONSTRAINT_SCHEMA
          AND tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
        WHERE tc.TABLE_NAME = N'${sqlLiteral(table)}' AND tc.TABLE_SCHEMA = ${tableSchema}
          AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
      ) pk ON c.TABLE_CATALOG = pk.TABLE_CATALOG AND c.TABLE_SCHEMA = pk.TABLE_SCHEMA
        AND c.TABLE_NAME = pk.TABLE_NAME AND c.COLUMN_NAME = pk.COLUMN_NAME
      WHERE c.TABLE_NAME = N'${sqlLiteral(table)}' AND c.TABLE_SCHEMA = ${tableSchema}
      ORDER BY c.ORDINAL_POSITION
    `;
  },

  selectAllQuery(table: string, limit = 100, schema?: string) {
    // SQL Server uses TOP instead of LIMIT
    return `SELECT TOP ${limit} * FROM ${tableIdentifier(this, table, schema)}`;
  },

  createDatabaseQuery(name: string) {
    return `CREATE DATABASE ${this.quoteIdentifier(name)}`;
  },

  listConstraintsQuery(table: string, schema?: string) {
    return `
      SELECT 
        tc.CONSTRAINT_NAME AS constraint_name,
        tc.CONSTRAINT_TYPE AS constraint_type,
        kcu.COLUMN_NAME AS column_name
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
      LEFT JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu 
        ON tc.CONSTRAINT_CATALOG = kcu.CONSTRAINT_CATALOG
        AND tc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
        AND tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
      WHERE tc.TABLE_NAME = N'${sqlLiteral(table)}'
        AND tc.TABLE_SCHEMA = OBJECT_SCHEMA_NAME(OBJECT_ID(N'${sqlLiteral(tableIdentifier(this, table, schema))}'))
      ORDER BY tc.CONSTRAINT_NAME, kcu.ORDINAL_POSITION
    `;
  },

  listForeignKeysQuery(table: string, schema?: string) {
    return `
      SELECT 
        fk.name AS constraint_name,
        COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS column_name,
        OBJECT_NAME(fkc.referenced_object_id) AS foreign_table,
        COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) AS foreign_column
      FROM sys.foreign_keys fk
      JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
      WHERE fk.parent_object_id = OBJECT_ID(N'${sqlLiteral(tableIdentifier(this, table, schema))}')
      ORDER BY fk.name, fkc.constraint_column_id
    `;
  },

  listIndexesQuery(table: string, schema?: string) {
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
      WHERE i.object_id = OBJECT_ID(N'${sqlLiteral(tableIdentifier(this, table, schema))}') AND i.name IS NOT NULL
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
      ...(row.primary_key_ordinal != null
        ? { primaryKeyOrdinal: Number(row.primary_key_ordinal) }
        : {}),
    }));
  },
};
