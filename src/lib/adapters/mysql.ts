import type { DatabaseAdapter, ColumnInfo } from './types';

export const mysqlAdapter: DatabaseAdapter = {
  driver: 'mysql',

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
