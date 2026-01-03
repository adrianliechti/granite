import type { DatabaseAdapter, ColumnInfo, TableView } from './types';

export const mysqlAdapter: DatabaseAdapter = {
  driver: 'mysql',

  supportedTableViews(): TableView[] {
    return ['records', 'columns', 'constraints', 'foreignKeys', 'indexes'];
  },

  listDatabasesQuery() {
    return `SHOW DATABASES`;
  },

  listTablesQuery() {
    return `SHOW TABLES`;
  },

  listColumnsQuery(table: string) {
    return `DESCRIBE ${table}`;
  },

  selectAllQuery(table: string, limit = 100) {
    return `SELECT * FROM ${table} LIMIT ${limit}`;
  },

  createDatabaseQuery(name: string) {
    return `CREATE DATABASE \`${name}\``;
  },

  listConstraintsQuery(table: string) {
    return `
      SELECT 
        tc.CONSTRAINT_NAME AS constraint_name,
        tc.CONSTRAINT_TYPE AS constraint_type,
        kcu.COLUMN_NAME AS column_name
      FROM information_schema.TABLE_CONSTRAINTS tc
      LEFT JOIN information_schema.KEY_COLUMN_USAGE kcu 
        ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME 
        AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
        AND tc.TABLE_NAME = kcu.TABLE_NAME
      WHERE tc.TABLE_NAME = '${table}'
        AND tc.TABLE_SCHEMA = DATABASE()
      ORDER BY tc.CONSTRAINT_NAME, kcu.ORDINAL_POSITION
    `;
  },

  listForeignKeysQuery(table: string) {
    return `
      SELECT 
        kcu.CONSTRAINT_NAME AS constraint_name,
        kcu.COLUMN_NAME AS column_name,
        kcu.REFERENCED_TABLE_NAME AS foreign_table,
        kcu.REFERENCED_COLUMN_NAME AS foreign_column
      FROM information_schema.KEY_COLUMN_USAGE kcu
      WHERE kcu.TABLE_NAME = '${table}'
        AND kcu.TABLE_SCHEMA = DATABASE()
        AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY kcu.CONSTRAINT_NAME
    `;
  },

  listIndexesQuery(table: string) {
    return `SHOW INDEX FROM ${table}`;
  },

  modifyDsnForDatabase(dsn: string, database: string) {
    // MySQL DSN format: user:pass@tcp(host:port)/dbname
    const dsnParts = dsn.split('/');
    if (dsnParts.length > 1) {
      dsnParts[dsnParts.length - 1] = database;
      return dsnParts.join('/');
    }
    return `${dsn}/${database}`;
  },

  parseDatabaseNames(rows) {
    return rows.map((row) => String(row.Database || Object.values(row)[0]));
  },

  parseTableNames(rows, database) {
    return rows.map((row) => {
      // MySQL returns Tables_in_<database_name> as column name
      const value = row[`Tables_in_${database}`] || Object.values(row)[0];
      return String(value);
    });
  },

  parseColumns(rows): ColumnInfo[] {
    return rows.map((row) => ({
      name: String(row.Field),
      type: String(row.Type),
      nullable: row.Null === 'YES',
      primaryKey: row.Key === 'PRI',
    }));
  },
};
