import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { mysqlAdapter } from '../src/lib/adapters/mysql.ts';
import { oracleAdapter } from '../src/lib/adapters/oracle.ts';
import { postgresAdapter } from '../src/lib/adapters/postgres.ts';
import { sqliteAdapter } from '../src/lib/adapters/sqlite.ts';
import { sqlserverAdapter } from '../src/lib/adapters/sqlserver.ts';
import { trinoAdapter } from '../src/lib/adapters/trino.ts';
import { primaryKeyPredicate } from '../src/lib/adapters/rows.ts';
import { buildDataQuery, emptyFilters } from '../src/lib/data.ts';
import { databasePath, databaseScope } from '../src/lib/database.ts';

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

test('Postgres grid queries distinguish schemas and quote names containing delimiters', () => {
  const db = new DatabaseSync(':memory:');
  const schema = 'tenant "blue", archive.v2';
  const table = 'same.table';
  const q = (name) => postgresAdapter.quoteIdentifier(name);
  try {
    db.exec(`ATTACH DATABASE ':memory:' AS ${q(schema)};
      CREATE TABLE ${q(table)} (id INTEGER PRIMARY KEY, note TEXT);
      CREATE TABLE ${q(schema)}.${q(table)} (id INTEGER PRIMARY KEY, note TEXT);
      INSERT INTO ${q(table)} VALUES (1, 'default');
      INSERT INTO ${q(schema)}.${q(table)} VALUES (1, 'selected');`);
    const columns = [{ name: 'id', type: 'integer', primaryKey: true, nullable: false }];
    const query = buildDataQuery(postgresAdapter, table, columns, emptyFilters, [], 0, 100, schema);
    assert.equal(db.prepare(query.query).get().note, 'selected');
    assert.equal(db.prepare(query.countQuery).get().total, 1);
    assert.equal(db.prepare(postgresAdapter.selectAllQuery(table, 100, schema)).get().note, 'selected');
    assert.equal(db.prepare(postgresAdapter.selectAllQuery(table)).get().note, 'default');
  } finally {
    db.close();
  }
});

test('schema links and preferences keep default-schema links and distinguish explicit schemas', () => {
  // The connection's default schema is no pick: it keeps the plain paths and
  // preference scopes from before schemas were selectable.
  assert.equal(databasePath('c', 'db', 'orders'), '/c/db/orders');
  assert.equal(databaseScope('c', 'db'), 'c:db');
  // An explicit pick, even of public when the default is another schema.
  assert.equal(databasePath('c', 'db', 'orders', 'public'), '/c/db/schema/public/orders');
  const name = 'tenant / "blue"';
  assert.equal(databasePath('c', 'db', 'orders', name), `/c/db/schema/${encodeURIComponent(name)}/orders`);
  assert.notEqual(databaseScope('c', 'db', name), databaseScope('c', 'db'));
  assert.notEqual(databaseScope('c', 'db', 'public'), databaseScope('c', 'db'));
  assert.notEqual(databaseScope('c', 'db', 'a:b'), databaseScope('c', 'db', 'a'));
});

test('schema levels list and qualify per driver, defaulting to the session schema', () => {
  // Trino: catalogs above schemas, both session defaults.
  assert.equal(trinoAdapter.databaseLabel, 'Catalog');
  assert.equal(trinoAdapter.listDatabasesQuery(), 'SHOW CATALOGS');
  assert.deepEqual(trinoAdapter.parseDatabaseNames([{ Catalog: 'hive' }]), ['hive']);
  assert.deepEqual(trinoAdapter.parseSchemaNames([{ Schema: 'information_schema' }, { Schema: 'sales' }]), ['sales']);
  assert.equal(trinoAdapter.listTablesQuery('sales "eu"'), 'SHOW TABLES FROM "sales ""eu"""');
  assert.equal(trinoAdapter.selectAllQuery('orders', 5, 'sales'), 'SELECT * FROM "sales"."orders" LIMIT 5');
  assert.match(trinoAdapter.listColumnsQuery('orders'), /table_schema = current_schema/);
  // SQL Server qualifies only: a picked schema cannot become the session default.
  assert.equal(sqlserverAdapter.sessionSchema, false);
  assert.match(sqlserverAdapter.listTablesQuery('sales'), /TABLE_SCHEMA = N'sales'/);
  assert.match(sqlserverAdapter.listTablesQuery(), /TABLE_SCHEMA IN \(SCHEMA_NAME\(\), 'dbo'\)/);
  assert.match(sqlserverAdapter.listIndexesQuery('orders', 'sales'), /OBJECT_ID\(N'\[sales\]\.\[orders\]'\)/);
  // Oracle: other users' schemas through ALL_ views, the session's by default.
  assert.match(oracleAdapter.listTablesQuery('HR'), /FROM all_tables\s+WHERE owner = 'HR'/);
  assert.match(oracleAdapter.listColumnsQuery('EMP'), /c\.owner = SYS_CONTEXT\('USERENV', 'CURRENT_SCHEMA'\)/);
  // Postgres no longer assumes public: the session's current schema by default.
  assert.match(postgresAdapter.listTablesQuery(), /schemaname = current_schema\(\)/);
  assert.match(postgresAdapter.listTablesQuery("o'brien"), /schemaname = 'o''brien'/);
});

test('MySQL literals escape backslashes as well as quotes', () => {
  // Without NO_BACKSLASH_ESCAPES, a backslash before a quote would end the literal early.
  const query = mysqlAdapter.listConstraintsQuery("x\\' OR 1=1 -- ");
  assert.ok(query.includes("'x\\\\'' OR 1=1 -- '"), query);
});
