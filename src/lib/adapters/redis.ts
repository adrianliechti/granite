import type { DatabaseAdapter, ColumnInfo, TableView } from './types';

export const redisAdapter: DatabaseAdapter = {
  driver: 'redis',

  supportedTableViews(): TableView[] {
    // Redis doesn't have traditional table views
    return ['records'];
  },

  listDatabasesQuery() {
    // Redis uses numbered databases (0-15 by default)
    // This is a no-op since we can't query database list in Redis
    return 'KEYS *';
  },

  listTablesQuery() {
    // Redis doesn't have tables, but we can list keys
    return 'KEYS *';
  },

  listColumnsQuery() {
    // Redis doesn't have columns
    return 'KEYS *';
  },

  selectAllQuery(pattern: string) {
    // For Redis, "table" is actually a key pattern
    if (pattern === '*' || !pattern) {
      return 'KEYS *';
    }
    // Try to get the value of a specific key
    return `GET ${pattern}`;
  },

  createDatabaseQuery() {
    // Redis doesn't support creating databases dynamically
    return null;
  },

  // DSN format: redis://[:password@]host[:port][/db]
  modifyDsnForDatabase(dsn: string, database: string): string {
    const url = new URL(dsn);
    url.pathname = `/${database}`;
    return url.toString();
  },

  parseDatabaseNames(): string[] {
    // Redis has databases 0-15 by default
    return Array.from({ length: 16 }, (_, i) => String(i));
  },

  parseTableNames(rows: Record<string, unknown>[]): string[] {
    // In Redis, "tables" are keys
    return rows.map(row => String(row.key || '')).filter(Boolean);
  },

  parseColumns(): ColumnInfo[] {
    // Redis doesn't have traditional columns
    // Return a generic structure for key-value display
    return [
      { name: 'key', type: 'string', nullable: false, primaryKey: true },
      { name: 'value', type: 'string', nullable: true, primaryKey: false },
    ];
  },
};
