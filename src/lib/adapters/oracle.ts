import type { DatabaseAdapter, ColumnInfo, TableView } from './types';
import { sqlLiteral, tableIdentifier } from './types.ts';

// The schema (owner) a metadata query looks in: the given one, or the session's.
function ownerOf(schema?: string): string {
  return schema ? `'${sqlLiteral(schema)}'` : `SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA')`;
}

export const oracleAdapter: DatabaseAdapter = {
  driver: 'oracle',

  quoteIdentifier(name: string) {
    return `"${name.replace(/"/g, '""')}"`;
  },

  pingQuery() {
    return 'SELECT 1 FROM DUAL';
  },

  supportedTableViews(): TableView[] {
    return ['records', 'columns', 'constraints', 'foreignKeys', 'indexes'];
  },

  listDatabasesQuery() {
    // Oracle uses pluggable databases (PDBs) or we can list schemas
    // For simplicity, list the current container/PDB
    return `SELECT SYS_CONTEXT('USERENV', 'CON_NAME') as name FROM DUAL`;
  },

  // A connection reaches one database (the service's PDB); its schemas are the
  // users that own tables, and the session's current schema can be changed.
  listSchemasQuery() {
    return `
      SELECT username AS name FROM all_users u
      WHERE username = SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA')
        OR (oracle_maintained = 'N' AND EXISTS (SELECT 1 FROM all_tables t WHERE t.owner = u.username))
      ORDER BY username
    `;
  },

  parseSchemaNames(rows) {
    return rows.map((row) => String(row.name ?? row.NAME));
  },

  defaultSchemaQuery() {
    return `SELECT SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA') AS name FROM DUAL`;
  },

  sessionSchema: true,

  listTablesQuery(schema?: string) {
    // Tables of the schema, excluding Oracle internal tables
    return `
      SELECT table_name as name 
      FROM all_tables 
      WHERE owner = ${ownerOf(schema)}
        AND table_name NOT LIKE 'LOGMNR%' 
        AND table_name NOT LIKE 'AQ$%'
        AND table_name NOT LIKE 'MVIEW$%'
        AND table_name NOT LIKE 'LOGSTDBY$%'
        AND table_name NOT LIKE 'ROLLING$%'
        AND table_name NOT LIKE 'SCHEDULER_%'
        AND table_name NOT IN ('OL$', 'OL$HINTS', 'OL$NODES', 'REDO_DB', 'REDO_LOG', 'HELP', 
                                'REPL_SUPPORT_MATRIX', 'REPL_VALID_COMPAT', 'SQLPLUS_PRODUCT_PROFILE')
      ORDER BY table_name
    `;
  },

  listColumnsQuery(table: string, schema?: string) {
    const owner = ownerOf(schema);
    return `
      SELECT 
        c.column_name as name,
        c.data_type as type,
        CASE WHEN c.nullable = 'Y' THEN 1 ELSE 0 END as nullable,
        CASE WHEN cc.column_name IS NOT NULL THEN 1 ELSE 0 END as primary_key
      FROM all_tab_columns c
      LEFT JOIN (
        SELECT cc.column_name
        FROM all_constraints con
        JOIN all_cons_columns cc ON con.owner = cc.owner AND con.constraint_name = cc.constraint_name
        WHERE con.owner = ${owner} AND con.table_name = '${sqlLiteral(table)}' AND con.constraint_type = 'P'
      ) cc ON c.column_name = cc.column_name
      WHERE c.owner = ${owner} AND c.table_name = '${sqlLiteral(table)}'
      ORDER BY c.column_id
    `;
  },

  selectAllQuery(table: string, limit = 100, schema?: string) {
    // Oracle uses FETCH FIRST n ROWS ONLY (12c+) or ROWNUM
    return `SELECT * FROM ${tableIdentifier(this, table, schema)} FETCH FIRST ${limit} ROWS ONLY`;
  },

  createDatabaseQuery() {
    // Oracle database creation requires DBA privileges and is complex
    // Users should create schemas instead
    return null;
  },

  listConstraintsQuery(table: string, schema?: string) {
    return `
      SELECT 
        con.constraint_name,
        con.constraint_type,
        col.column_name
      FROM all_constraints con
      LEFT JOIN all_cons_columns col 
        ON con.owner = col.owner AND con.constraint_name = col.constraint_name
      WHERE con.owner = ${ownerOf(schema)} AND con.table_name = '${sqlLiteral(table)}'
      ORDER BY con.constraint_name, col.position
    `;
  },

  listForeignKeysQuery(table: string, schema?: string) {
    return `
      SELECT 
        a.constraint_name,
        a.column_name,
        c_pk.owner AS foreign_schema,
        c_pk.table_name AS foreign_table,
        b.column_name AS foreign_column
      FROM all_cons_columns a
      JOIN all_constraints c ON a.owner = c.owner AND a.constraint_name = c.constraint_name
      JOIN all_constraints c_pk ON c.r_owner = c_pk.owner AND c.r_constraint_name = c_pk.constraint_name
      JOIN all_cons_columns b ON c_pk.owner = b.owner AND c_pk.constraint_name = b.constraint_name AND a.position = b.position
      WHERE c.owner = ${ownerOf(schema)} AND c.constraint_type = 'R'
        AND c.table_name = '${sqlLiteral(table)}'
      ORDER BY a.constraint_name, a.position
    `;
  },

  listIndexesQuery(table: string, schema?: string) {
    return `
      SELECT 
        index_name,
        uniqueness,
        index_type
      FROM all_indexes
      WHERE table_owner = ${ownerOf(schema)} AND table_name = '${sqlLiteral(table)}'
      ORDER BY index_name
    `;
  },

  parseDatabaseNames(rows) {
    return rows.map((row) => {
      const val = row.name ?? row.NAME;
      return String(val ?? Object.values(row)[0]);
    });
  },

  parseTableNames(rows) {
    return rows.map((row) => {
      const val = row.name ?? row.NAME ?? row.TABLE_NAME;
      return String(val ?? Object.values(row)[0]);
    });
  },

  parseColumns(rows): ColumnInfo[] {
    return rows.map((row) => ({
      name: String(row.name ?? row.NAME),
      type: String(row.type ?? row.TYPE ?? row.DATA_TYPE),
      nullable: Number(row.nullable ?? row.NULLABLE) === 1,
      primaryKey: Number(row.primary_key ?? row.PRIMARY_KEY) === 1,
    }));
  },
};
