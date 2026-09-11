import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  buildDataQuery,
  emptyFilters,
  parseCellValue,
  buildInsert,
  inputValue,
} from "../src/lib/data.ts";
import { sqliteAdapter } from "../src/lib/adapters/sqlite.ts";
import { sqlserverAdapter } from "../src/lib/adapters/sqlserver.ts";
import { oracleAdapter } from "../src/lib/adapters/oracle.ts";
import { trinoAdapter } from "../src/lib/adapters/trino.ts";
import {
  splitStatements,
  statementAt,
  returnsRows,
  tableReferences,
  cteColumns,
} from "../src/lib/sql.ts";
import { buildDSN } from "../src/lib/connection.ts";

const columns = [
  { name: "id", type: "INTEGER", nullable: false, primaryKey: true },
  { name: "name", type: "TEXT", nullable: true, primaryKey: false },
  { name: "score", type: "DECIMAL", nullable: true, primaryKey: false },
];
const rule = (column, operator, value = "", second = "") => ({
  id: "test",
  column,
  operator,
  value,
  second,
});
const unwrap = (params) =>
  params.map((p) =>
    typeof p === "object" && p !== null && p.type === "number"
      ? Number(p.value)
      : p,
  );
test("filters search the full dataset, escape wildcards, compose all/any, sort, and page", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE records(id INTEGER PRIMARY KEY, name TEXT, score DECIMAL)",
  );
  const insert = db.prepare("INSERT INTO records VALUES (?, ?, ?)");
  for (const row of [
    [1, "100%_done!", 5],
    [2, "ALPHA", 20],
    [3, "alpha", 30],
    [4, null, 40],
    [5, "", 50],
  ])
    insert.run(...row);
  const run = (filters, sorting = [], page = 0, size = 25) => {
    const built = buildDataQuery(
      sqliteAdapter,
      "records",
      columns,
      { ...emptyFilters, ...filters },
      sorting,
      page,
      size,
    );
    return db
      .prepare(built.query)
      .all(...unwrap(built.params))
      .map((r) => r.id);
  };
  assert.deepEqual(run({ search: "%_done!" }), [1]);
  assert.deepEqual(run({ rules: [rule("name", "eq", "alpha")] }), [2, 3]);
  assert.deepEqual(
    run({
      rules: [rule("score", "between", "20", "40"), rule("name", "notNull")],
    }),
    [2, 3],
  );
  assert.deepEqual(
    run({ match: "any", rules: [rule("name", "null"), rule("name", "empty")] }),
    [4, 5],
  );
  assert.deepEqual(
    run(
      { rules: [rule("id", "in", "[1, 3, 5]")] },
      [{ id: "score", desc: true }],
      1,
      1,
    ),
    [3, 1],
  ); // lookahead row
  assert.deepEqual(run({ rules: [rule("id", "notIn", "1,2,3")] }), [4, 5]);
  assert.throws(() => run({ rules: [rule("id", "eq", "1 OR 1=1")] }), /number/);
  assert.throws(
    () => run({ rules: [rule("unknown", "eq", "1")] }),
    /Unknown column/,
  );
  db.close();
});
test("dialect paging includes a lookahead row and stable primary key ordering", () => {
  for (const adapter of [sqlserverAdapter, oracleAdapter, trinoAdapter]) {
    const built = buildDataQuery(
      adapter,
      "records",
      columns,
      emptyFilters,
      [],
      2,
      50,
    );
    assert.match(built.query, /ORDER BY .*id.* ASC/);
    assert.match(
      built.query,
      adapter.driver === "trino"
        ? /OFFSET 100 LIMIT 51$/
        : /OFFSET 100 ROWS FETCH NEXT 51 ROWS ONLY$/,
    );
  }
});
test("typed values and inserts keep null, empty, defaults and exact numbers distinct", () => {
  assert.deepEqual(parseCellValue("9007199254740993", columns[0]), {
    type: "number",
    value: "9007199254740993",
  });
  assert.deepEqual(parseCellValue("0.1234567890123456789", columns[2]), {
    type: "number",
    value: "0.1234567890123456789",
  });
  assert.equal(parseCellValue("", columns[1]), "");
  const insert = buildInsert(sqliteAdapter, "records", columns, { name: null });
  assert.equal(insert.query, 'INSERT INTO "records" ("name") VALUES (?)');
  assert.deepEqual(insert.params, [null]);
  assert.throws(() => parseCellValue("{broken}", { type: "json" }));
  assert.throws(() => parseCellValue("2026-02-30", { type: "DATE" }));
  assert.throws(() =>
    parseCellValue("2026-02-30T10:30:00", { type: "TIMESTAMP" }),
  );
  assert.equal(
    inputValue("2026-01-12T10:30:00+01:00", { type: "TIMESTAMP" }),
    "2026-01-12T10:30:00",
  );
  assert.equal(
    inputValue("2026-01-12T10:30:00+01:00", {
      type: "TIMESTAMP WITH TIME ZONE",
    }),
    "2026-01-12T10:30:00+01:00",
  );
  assert.equal(
    inputValue("2026-01-12T00:00:00Z", { type: "DATE" }),
    "2026-01-12",
  );
});
test("SQL execution respects literals, comments, CTE writes and procedural blocks", () => {
  const sql = `-- heading\nSELECT ';'; /* nested /* ; */ ok */ WITH v AS (SELECT 1) UPDATE t SET name = 'RETURNING'; SELECT $$one;two$$;`;
  const parts = splitStatements(sql, "postgres");
  assert.equal(parts.length, 3);
  assert.ok(returnsRows(parts[0].sql));
  assert.equal(returnsRows(parts[1].sql), false);
  assert.ok(returnsRows(parts[2].sql));
  assert.equal(
    returnsRows("WITH x AS (SELECT 1) DELETE FROM t RETURNING id"),
    true,
  );
  assert.equal(returnsRows("/* SELECT */ INSERT INTO t VALUES (1)"), false);
  assert.equal(
    splitStatements("BEGIN x := q'[semi;colon]'; NULL; END;\n/", "oracle")
      .length,
    1,
  );
  assert.equal(
    splitStatements("SELECT [semi;column]; SELECT `semi;column`;").length,
    2,
  );
  assert.equal(statementAt("SELECT 1;\nSELECT 2;", 13), "SELECT 2");
  assert.equal(
    splitStatements(
      "CREATE TABLE #temp (id INT); INSERT INTO #temp VALUES (1); SELECT * FROM #temp;",
      "sqlserver",
    ).length,
    3,
  );
  assert.equal(returnsRows("# a MySQL comment\nSELECT 1;", "mysql"), true);
  assert.equal(
    splitStatements(
      "CREATE OR REPLACE PROCEDURE hello AS BEGIN NULL; END;\n/\nSELECT 1 FROM dual;",
      "oracle",
    ).length,
    2,
  );
});
test("completion resolves quoted table aliases and explicit CTE columns", () => {
  assert.deepEqual(
    tableReferences(
      'SELECT a.id FROM "some table" AS a LEFT JOIN public.orders o ON a.id=o.id',
    ),
    [
      { name: "some table", alias: "a" },
      { name: "public.orders", alias: "o" },
    ],
  );
  assert.deepEqual(
    cteColumns(
      "WITH totals(id, amount) AS (SELECT id, SUM(amount) FROM orders GROUP BY id) SELECT * FROM totals",
    ),
    { totals: ["id", "amount"] },
  );
});
test("connection fields escape URL credentials and database names", () => {
  const fields = {
    host: "localhost",
    port: "",
    user: "some@user",
    password: "p@ss:word/#?",
    database: "db with / space",
    catalog: "",
    tls: true,
  };
  const dsn = new URL(buildDSN("postgres", fields));
  assert.equal(decodeURIComponent(dsn.username), fields.user);
  assert.equal(decodeURIComponent(dsn.password), fields.password);
  assert.equal(decodeURIComponent(dsn.pathname.slice(1)), fields.database);
  assert.throws(() => buildDSN("oracle", fields), /special delimiters/);
  assert.throws(() => buildDSN("trino", { ...fields, tls: false }), /TLS/);
});
