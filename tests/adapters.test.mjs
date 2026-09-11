import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { mysqlAdapter } from '../src/lib/adapters/mysql.ts';
import { oracleAdapter } from '../src/lib/adapters/oracle.ts';
import { postgresAdapter } from '../src/lib/adapters/postgres.ts';
import { sqliteAdapter } from '../src/lib/adapters/sqlite.ts';
import { sqlserverAdapter } from '../src/lib/adapters/sqlserver.ts';
import { primaryKeyPredicate } from '../src/lib/adapters/rows.ts';

test('SQLite recognizes every column in a composite primary key', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE "orders""2026" (tenant INTEGER, id INTEGER, note TEXT, PRIMARY KEY (tenant, id)) WITHOUT ROWID');
    const rows = db.prepare(sqliteAdapter.listColumnsQuery('orders"2026')).all();
    const columns = sqliteAdapter.parseColumns(rows);
    assert.deepEqual(columns, [
      { name: 'tenant', type: 'INTEGER', nullable: false, primaryKey: true },
      { name: 'id', type: 'INTEGER', nullable: false, primaryKey: true },
      { name: 'note', type: 'TEXT', nullable: true, primaryKey: false },
    ]);
  } finally {
    db.close();
  }
});

test('Oracle accepts numeric flags returned as numbers or decimal strings', () => {
  for (const [zero, one] of [[0, 1], ['0', '1']]) {
    assert.deepEqual(oracleAdapter.parseColumns([
      { NAME: 'ID', TYPE: 'NUMBER', NULLABLE: zero, PRIMARY_KEY: one },
      { NAME: 'NOTE', TYPE: 'VARCHAR2', NULLABLE: one, PRIMARY_KEY: zero },
    ]), [
      { name: 'ID', type: 'NUMBER', nullable: false, primaryKey: true },
      { name: 'NOTE', type: 'VARCHAR2', nullable: true, primaryKey: false },
    ]);
  }
});

test('database creation keeps delimiters inside the database identifier', () => {
  assert.equal(postgresAdapter.createDatabaseQuery('db"; SELECT 1; --'), 'CREATE DATABASE "db""; SELECT 1; --"');
  assert.equal(mysqlAdapter.createDatabaseQuery('db`; SELECT 1; --'), 'CREATE DATABASE `db``; SELECT 1; --`');
  assert.equal(sqlserverAdapter.createDatabaseQuery('db]; SELECT 1; --'), 'CREATE DATABASE [db]]; SELECT 1; --]');
});

test('row mutations use the whole primary key and bind values', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE records (tenant TEXT, id INTEGER, note TEXT, PRIMARY KEY (tenant, id)) WITHOUT ROWID');
    db.prepare('INSERT INTO records VALUES (?, ?, ?)').run("tenant's", 1, 'keep');
    db.prepare('INSERT INTO records VALUES (?, ?, ?)').run("tenant's", 2, 'remove');
    const columns = sqliteAdapter.parseColumns(db.prepare(sqliteAdapter.listColumnsQuery('records')).all());
    const row = { tenant: "tenant's", id: 2, note: 'remove' };

    const key = primaryKeyPredicate(sqliteAdapter, columns, row);
    assert.ok(key);
    assert.equal(db.prepare(`DELETE FROM records WHERE ${key.clause}`).run(...key.params).changes, 1);
    assert.equal(db.prepare('SELECT note FROM records').get().note, 'keep');
    assert.equal(primaryKeyPredicate(sqliteAdapter, columns, { tenant: "tenant's" }), null);
    assert.equal(primaryKeyPredicate(sqliteAdapter, [], row), null);

    for (const [adapter, expected] of [
      [postgresAdapter, '"tenant" = $2 AND "id" = $3'],
      [oracleAdapter, '"tenant" = :2 AND "id" = :3'],
      [sqlserverAdapter, '[tenant] = @p2 AND [id] = @p3'],
    ]) {
      assert.deepEqual(primaryKeyPredicate(adapter, columns, row, 2), {
        clause: expected, params: ["tenant's", 2],
      });
    }
  } finally {
    db.close();
  }
});
