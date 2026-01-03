import type { DatabaseAdapter, ColumnInfo } from './types';

export const oracleAdapter: DatabaseAdapter = {
  driver: 'oracle',

  listDatabasesQuery() {
    // Oracle uses pluggable databases (PDBs) or we can list schemas
    // For simplicity, list the current container/PDB
    return `SELECT SYS_CONTEXT('USERENV', 'CON_NAME') as name FROM DUAL`;
  },

  listTablesQuery() {
    // List user tables (owned by current user), excluding Oracle internal tables
    return `
      SELECT table_name as name 
      FROM user_tables 
      WHERE table_name NOT LIKE 'LOGMNR%' 
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

  listColumnsQuery(table: string) {
    return `
      SELECT 
        c.column_name as name,
        c.data_type as type,
        CASE WHEN c.nullable = 'Y' THEN 1 ELSE 0 END as nullable,
        CASE WHEN cc.column_name IS NOT NULL THEN 1 ELSE 0 END as primary_key
      FROM user_tab_columns c
      LEFT JOIN (
        SELECT cc.column_name
        FROM user_constraints con
        JOIN user_cons_columns cc ON con.constraint_name = cc.constraint_name
        WHERE con.table_name = UPPER('${table}') AND con.constraint_type = 'P'
      ) cc ON c.column_name = cc.column_name
      WHERE c.table_name = UPPER('${table}')
      ORDER BY c.column_id
    `;
  },

  selectAllQuery(table: string, limit = 100) {
    // Oracle uses FETCH FIRST n ROWS ONLY (12c+) or ROWNUM
    return `SELECT * FROM ${table} FETCH FIRST ${limit} ROWS ONLY`;
  },

  createDatabaseQuery(_name: string) {
    // Oracle database creation requires DBA privileges and is complex
    // Users should create schemas instead
    return null;
  },

  modifyDsnForDatabase(dsn: string, _database: string) {
    // Oracle DSN typically includes the service name, no modification needed
    // Format: oracle://user:pass@host:port/service_name
    return dsn;
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
      nullable: Boolean(row.nullable ?? row.NULLABLE),
      primaryKey: Boolean(row.primary_key ?? row.PRIMARY_KEY),
    }));
  },
};
