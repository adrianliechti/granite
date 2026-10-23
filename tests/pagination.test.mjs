import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { buildDataQuery, emptyFilters } from "../src/lib/data.ts";
import { sqliteAdapter } from "../src/lib/adapters/sqlite.ts";
import { sqlserverAdapter } from "../src/lib/adapters/sqlserver.ts";

const columns = [
  { name: "id", type: "INTEGER", nullable: false, primaryKey: true, primaryKeyOrdinal: 2 },
  { name: "tenant", type: "TEXT", nullable: false, primaryKey: true, primaryKeyOrdinal: 1 },
  { name: "name", type: "TEXT", nullable: true, primaryKey: false },
];
const unwrap = (params) => params.map((value) =>
  value?.type === "number" ? Number(value.value) : value,
);

test("keyset paging traverses composite keys in both directions without skipping ties", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE records (id INTEGER NOT NULL, tenant TEXT NOT NULL, name TEXT, PRIMARY KEY (tenant, id))");
    const insert = db.prepare("INSERT INTO records VALUES (?, ?, ?)");
    for (const [id, tenant] of [[1, "a"], [2, "a"], [3, "a"], [1, "b"], [2, "b"], [1, "c"]])
      insert.run(id, tenant, "match");
    for (const sorting of [[], [{ id: "tenant", desc: true }], [{ id: "id", desc: true }, { id: "tenant", desc: true }]]) {
      let after;
      const actual = [];
      for (let page = 0; page < 10; page++) {
        const built = buildDataQuery(sqliteAdapter, "records", columns, emptyFilters, sorting, page, 2, undefined, after);
        assert.ok(built.keyset);
        assert.match(built.query, /LIMIT 3 OFFSET 0$/);
        const fetched = db.prepare(built.query).all(...unwrap(built.params));
        const visible = fetched.slice(0, 2);
        actual.push(...visible.map((row) => `${row.tenant}:${row.id}`));
        if (fetched.length <= 2) break;
        after = visible.at(-1);
      }
      const first = buildDataQuery(sqliteAdapter, "records", columns, emptyFilters, sorting, 0, 100);
      const expected = db.prepare(first.query).all().map((row) => `${row.tenant}:${row.id}`);
      assert.deepEqual(actual, expected);
      assert.equal(new Set(actual).size, 6);
    }
  } finally {
    db.close();
  }
});

test("SQL Server seeks by its primary key order and binds exact cursor values", () => {
  const wide = [
    { name: "POSITION_KEY", type: "bigint", nullable: false, primaryKey: true },
    ...Array.from({ length: 155 }, (_, index) => ({ name: `value_${index}`, type: "nvarchar", nullable: true, primaryKey: false })),
  ];
  const built = buildDataQuery(sqlserverAdapter, "f_contract", wide, emptyFilters, [], 10_000, 100, "dbo", { POSITION_KEY: "9007199254740993" });
  assert.equal(built.query, "SELECT TOP (101) * FROM [dbo].[f_contract] WHERE (([POSITION_KEY] > @p1)) ORDER BY [POSITION_KEY] ASC");
  assert.deepEqual(built.params, [{ type: "number", value: "9007199254740993" }]);
  assert.equal(built.countQuery, "SELECT COUNT(*) AS total FROM [dbo].[f_contract]");
  assert.deepEqual(built.countParams, []);

  const composite = buildDataQuery(sqlserverAdapter, "records", columns, emptyFilters, [], 1, 2, undefined, { tenant: "a'; DROP TABLE records; --", id: 2 });
  assert.match(composite.query, /WHERE \(\(\[tenant\] > @p1\) OR \(\[tenant\] = @p2 AND \[id\] > @p3\)\) ORDER BY \[tenant\] ASC, \[id\] ASC$/);
  assert.equal(composite.params[0], "a'; DROP TABLE records; --");
  assert.equal(composite.params[1], composite.params[0]);
});

test("filters and counts remain independent of the current page cursor", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE records (id INTEGER NOT NULL, tenant TEXT NOT NULL, name TEXT, PRIMARY KEY (tenant, id)); INSERT INTO records VALUES (1, 'a', 'yes'), (2, 'a', 'no'), (3, 'a', 'yes'), (1, 'b', 'yes')");
    const filters = { ...emptyFilters, search: "yes" };
    const built = buildDataQuery(sqliteAdapter, "records", columns, filters, [], 1, 1, undefined, { id: 1, tenant: "a" });
    assert.deepEqual(db.prepare(built.query).all(...unwrap(built.params)).map((row) => `${row.tenant}:${row.id}`), ["a:3", "b:1"]);
    assert.equal(db.prepare(built.countQuery).get(...unwrap(built.countParams)).total, 3);
    assert.equal(built.countParams.length, 2);
  } finally {
    db.close();
  }
});

test("custom sorts and tables without a usable key keep their existing paging semantics", () => {
  const custom = buildDataQuery(sqlserverAdapter, "records", columns, emptyFilters, [{ id: "name", desc: true }, { id: "id", desc: false }], 2, 100);
  assert.equal(custom.keyset, false);
  assert.match(custom.query, /ORDER BY \[name\] DESC, \[id\] ASC, \[tenant\] ASC OFFSET 200 ROWS FETCH NEXT 101 ROWS ONLY$/);
  for (const metadata of [
    columns.map((column) => ({ ...column, primaryKey: false })),
    columns.map((column) => ({ ...column, nullable: true })),
    [{ name: "id", type: "varbinary", nullable: false, primaryKey: true }],
    [{ name: "id", type: "timestamp", nullable: false, primaryKey: true }],
    [{ name: "id", type: "rowversion", nullable: false, primaryKey: true }],
  ]) {
    assert.equal(buildDataQuery(sqlserverAdapter, "records", metadata, emptyFilters, [], 0, 100).keyset, false);
  }
  assert.throws(() => buildDataQuery(sqlserverAdapter, "records", columns, emptyFilters, [], 1, 100, undefined, { tenant: "a" }), /missing a primary key/);
});

test("SQL Server metadata exposes the composite key ordinal", () => {
  const parsed = sqlserverAdapter.parseColumns([
    { name: "id", type: "int", nullable: 0, primary_key: 1, primary_key_ordinal: 2 },
    { name: "tenant", type: "varchar", nullable: 0, primary_key: 1, primary_key_ordinal: 1 },
    { name: "name", type: "varchar", nullable: 1, primary_key: 0, primary_key_ordinal: null },
  ]);
  const built = buildDataQuery(sqlserverAdapter, "records", parsed, emptyFilters, [], 0, 100);
  assert.match(built.query, /ORDER BY \[tenant\] ASC, \[id\] ASC$/);
});
