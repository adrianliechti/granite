import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, expect } from "@playwright/test";
import { postgresAdapter } from "../src/lib/adapters/postgres.ts";
import { mysqlAdapter } from "../src/lib/adapters/mysql.ts";
import { sqlserverAdapter } from "../src/lib/adapters/sqlserver.ts";
import { oracleAdapter } from "../src/lib/adapters/oracle.ts";
import { sqliteAdapter } from "../src/lib/adapters/sqlite.ts";
import { trinoAdapter } from "../src/lib/adapters/trino.ts";
import {
  buildDataQuery,
  buildInsert,
  inputValue,
  parseCellValue,
  emptyFilters,
} from "../src/lib/data.ts";
import { parameterPlaceholder } from "../src/lib/adapters/rows.ts";

const baseURL = process.env.GRANITE_TEST_URL;
assert.ok(
  baseURL,
  "Run with npm run test:e2e so Granite uses an isolated data directory.",
);
const password = "Granite_Test_2026";
const cases = [
  {
    adapter: postgresAdapter,
    database: "granite",
    dsn: `postgres://granite:${password}@localhost:5432/postgres?sslmode=disable`,
    alternateDSNs: [
      `host=localhost port=5432 user=granite password=${password} dbname=postgres sslmode=disable`,
    ],
  },
  {
    adapter: mysqlAdapter,
    database: "granite",
    dsn: `root:${password}@tcp(localhost:3306)/mysql?parseTime=true&loc=Europe%2FZurich`,
  },
  {
    adapter: sqlserverAdapter,
    database: "master",
    dsn: `sqlserver://sa:${password}@localhost:1433?database=master&encrypt=true&TrustServerCertificate=true`,
    alternateDSNs: [
      `server=localhost;port=1433;user id=sa;password=${password};database=master;encrypt=true;TrustServerCertificate=true`,
      `server=localhost;port=1433;uid=sa;pwd=${password};initial catalog=master;encrypt=true;trust server certificate=true`,
      `odbc:server=localhost;port=1433;user id=sa;password={${password}};database=master;encrypt=true;TrustServerCertificate=true`,
    ],
  },
  {
    adapter: oracleAdapter,
    database: "FREEPDB1",
    dsn: `granite/${password}@tcp://localhost:1521/FREEPDB1?transport_connect_timeout=5`,
  },
  {
    adapter: sqliteAdapter,
    database: "main",
    dsn: process.env.GRANITE_TEST_SQLITE,
  },
  {
    adapter: trinoAdapter,
    database: "memory.default",
    dsn: "http://granite@localhost:8080?catalog=tpch&schema=tiny",
  },
];
const selected = process.env.GRANITE_E2E_DRIVERS?.split(",");
for (const driver of selected ?? []) {
  assert.ok(
    cases.some(({ adapter }) => adapter.driver === driver),
    `Unknown test driver: ${driver}`,
  );
}

let browser;
before(async () => {
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
});

async function request(path, body, method = "POST") {
  const response = await fetch(`${baseURL}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const data = response.status === 204 ? undefined : await response.json();
  assert.ok(response.ok, `${method} ${path}: ${JSON.stringify(data)}`);
  return data;
}

function sql(id, query, database, params = [], endpoint = "query") {
  return request(`/sql/${id}/${endpoint}`, { query, database, params });
}

function normalizedRows(result) {
  return (result.rows ?? []).map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key.toLowerCase(), value]),
    ),
  );
}

for (const entry of cases) {
  const { adapter, database, dsn } = entry;
  const driver = adapter.driver;
  test(
    `${driver}: real database, metadata, and browser workflow`,
    { timeout: 120_000, skip: selected && !selected.includes(driver) },
    async (t) => {
      const cleanups = [];
      t.after(async () => {
        const errors = [];
        for (const cleanup of cleanups.reverse()) {
          try {
            await cleanup();
          } catch (error) {
            errors.push(error);
          }
        }
        if (errors.length)
          throw new AggregateError(errors, "Database test cleanup failed");
      });
      const suffix = Date.now().toString(36);
      const readinessID = `ready-${driver}-${suffix}`;
      await request("/connections", {
        id: readinessID,
        name: readinessID,
        sql: { driver, dsn },
      });
      cleanups.push(() =>
        request(`/connections/${readinessID}`, undefined, "DELETE"),
      );
      let lastError;
      for (let attempt = 0; attempt < 20; attempt++) {
        try {
          await sql(readinessID, adapter.pingQuery());
          lastError = undefined;
          break;
        } catch (error) {
          lastError = error;
          await delay(1000);
        }
      }
      if (lastError) throw lastError;

      const page = await browser.newPage();
      cleanups.push(() => page.close());
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.goto(baseURL);
      await page
        .locator("main")
        .getByRole("button", { name: "Add Connection", exact: true })
        .click();
      const form = page.locator("form");
      await form.locator("select").selectOption(driver);
      const connectionName = `E2E ${driver} ${suffix}`;
      await form
        .getByRole("textbox", { name: "Name", exact: true })
        .fill(connectionName);
      await form
        .getByLabel(
          driver === "sqlite" ? "Database file" : "Connection string",
          { exact: true },
        )
        .fill(dsn);
      const saved = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/connections",
      );
      await form.getByRole("button", { name: "Save", exact: true }).click();
      const savedResponse = await saved;
      assert.equal(savedResponse.status(), 201);
      const connection = await savedResponse.json();
      const id = connection.id;
      cleanups.push(() => request(`/connections/${id}`, undefined, "DELETE"));
      await expect(form).toHaveCount(0, { timeout: 15_000 });
      await expect(
        page
          .getByRole("complementary", { name: "Connections" })
          .getByText(connectionName, { exact: true }),
      ).toBeVisible();

      const table = `e2e_records_${suffix}`;
      const parent = `e2e_parent_${suffix}`;
      const q = (value) => adapter.quoteIdentifier(value);
      const execute = (query, params = []) =>
        sql(id, query, database, params, "execute");
      const query = (query, params = []) => sql(id, query, database, params);
      const waitForSQL = (endpoint, matches) =>
        page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === `/sql/${id}/${endpoint}` &&
            matches(response.request().postDataJSON().query),
        );
      const fields = `${q("tenant")} INTEGER NOT NULL, ${q("id")} INTEGER NOT NULL`;
      const primaryKey = `PRIMARY KEY (${q("tenant")}, ${q("id")})`;
      if (driver !== "trino") {
        await execute(`CREATE TABLE ${q(parent)} (${fields}, ${primaryKey})`);
        cleanups.push(() => execute(`DROP TABLE ${q(parent)}`));
      }
      const textType = driver === "oracle" ? "VARCHAR2(100)" : "VARCHAR(100)";
      await execute(
        driver === "trino"
          ? `CREATE TABLE ${q(table)} (${q("tenant")} INTEGER, ${q("id")} INTEGER, ${q("note")} ${textType})`
          : `CREATE TABLE ${q(table)} (${fields}, ${q("note")} ${textType}, ${primaryKey}, FOREIGN KEY (${q("tenant")}, ${q("id")}) REFERENCES ${q(parent)} (${q("tenant")}, ${q("id")}))`,
      );
      cleanups.push(() => execute(`DROP TABLE ${q(table)}`));
      const placeholders = (count) =>
        Array.from({ length: count }, (_, index) =>
          parameterPlaceholder(driver, index + 1),
        ).join(", ");
      for (const [rowID, note] of [
        [1, "keep"],
        [2, "before"],
      ]) {
        if (driver !== "trino")
          await execute(
            `INSERT INTO ${q(parent)} VALUES (${placeholders(2)})`,
            [1, rowID],
          );
        await execute(`INSERT INTO ${q(table)} VALUES (${placeholders(3)})`, [
          1,
          rowID,
          note,
        ]);
      }

      const databases = adapter.parseDatabaseNames(
        (await sql(id, adapter.listDatabasesQuery())).rows ?? [],
      );
      assert.ok(
        databases.includes(database),
        `missing database ${database}: ${databases}`,
      );
      const tables = adapter.parseTableNames(
        (await query(adapter.listTablesQuery())).rows ?? [],
        database,
      );
      assert.ok(tables.includes(table), `missing table ${table}: ${tables}`);
      const columns = adapter.parseColumns(
        (await query(adapter.listColumnsQuery(table))).rows ?? [],
      );
      assert.deepEqual(
        columns.map((column) => column.name),
        ["tenant", "id", "note"],
      );
      assert.deepEqual(
        columns
          .filter((column) => column.primaryKey)
          .map((column) => column.name),
        driver === "trino" ? [] : ["tenant", "id"],
      );
      if (adapter.listConstraintsQuery)
        await query(adapter.listConstraintsQuery(table));
      if (adapter.listIndexesQuery)
        await query(adapter.listIndexesQuery(table));
      if (adapter.listForeignKeysQuery) {
        const foreignKeys = normalizedRows(
          await query(adapter.listForeignKeysQuery(table)),
        );
        assert.equal(foreignKeys.length, 2, JSON.stringify(foreignKeys));
        assert.deepEqual(
          foreignKeys.map((row) => [row.column_name, row.foreign_column]),
          [
            ["tenant", "tenant"],
            ["id", "id"],
          ],
        );
      }
      if (driver === "trino") {
        const result = await query("SELECT ? AS decimal_value", [1.25]);
        assert.equal(Number(result.rows[0].decimal_value), 1.25);
      }

      // The grid builder binds filters for each dialect and pages on the server.
      const filtered = async (filters, sorting = [], page = 0, size = 25) => {
        const built = buildDataQuery(
          adapter,
          table,
          columns,
          { ...emptyFilters, ...filters },
          sorting,
          page,
          size,
        );
        return normalizedRows(await query(built.query, built.params));
      };
      const rule = (column, operator, value = "", second = "") => ({
        id: "test",
        column,
        operator,
        value,
        second,
      });
      assert.equal((await filtered({ search: "KEEP" })).length, 1);
      assert.equal(
        (await filtered({ search: "KEEP", caseSensitive: true })).length,
        0,
      );
      assert.equal(
        (
          await filtered({
            rules: [rule("note", "eq", "KEEP")],
            caseSensitive: true,
          })
        ).length,
        0,
      );
      assert.equal(
        (await filtered({ rules: [rule("id", "between", "1", "2")] })).length,
        2,
      );
      assert.equal(
        (await filtered({ rules: [rule("id", "in", "[2]")] }))[0].note,
        "before",
      );
      assert.equal(
        (await filtered({ rules: [rule("note", "null")] })).length,
        0,
      );
      assert.equal(
        (
          await filtered({
            match: "any",
            rules: [rule("id", "eq", "1"), rule("note", "eq", "before")],
          })
        ).length,
        2,
      );
      assert.equal(
        (await filtered({}, [{ id: "id", desc: true }], 1, 1))[0].note,
        "keep",
      );

      const typedTable = `e2e_values_${suffix}`;
      const integerType = driver === "oracle" ? "NUMBER(19)" : "BIGINT";
      const timestampType = driver === "sqlserver" ? "DATETIME2" : "TIMESTAMP";
      const boolType = driver === "sqlserver" ? "BIT" : "BOOLEAN";
      await execute(
        `CREATE TABLE ${q(typedTable)} (${q("large_id")} ${integerType}, ${q("amount")} DECIMAL(24,12), ${q("day")} DATE, ${q("stamp")} ${timestampType}, ${q("enabled")} ${boolType})`,
      );
      cleanups.push(() => execute(`DROP TABLE ${q(typedTable)}`));
      const typedColumns = adapter.parseColumns(
        (await query(adapter.listColumnsQuery(typedTable))).rows ?? [],
      );
      for (const [date, largeID] of [
        ["2026-09-12", "9007199254740993"],
        ["2026-01-12", "9007199254740995"],
      ]) {
        const inserted = buildInsert(adapter, typedTable, typedColumns, {
          large_id: { type: "number", value: largeID },
          amount: { type: "number", value: "123.125" },
          day: { type: "date", value: date },
          stamp: { type: "datetime", value: `${date}T10:30:00.123456` },
          enabled: true,
        });
        await execute(inserted.query, inserted.params);
        const typedQuery = buildDataQuery(
          adapter,
          typedTable,
          typedColumns,
          {
            ...emptyFilters,
            rules: [
              rule("amount", "gte", "123"),
              rule("day", "eq", date),
              rule("stamp", "gte", `${date}T10:00:00`),
              rule("enabled", "eq", driver === "mysql" ? "1" : "true"),
            ],
          },
          [],
          0,
          25,
        );
        const typedResult = normalizedRows(
          await query(typedQuery.query, typedQuery.params),
        );
        assert.equal(typedResult.length, 1, JSON.stringify(typedResult));
        assert.equal(String(typedResult[0].large_id), largeID);
        // Dates returned by drivers must bind again without shifting timezone or losing precision.
        const roundTrip = buildInsert(
          adapter,
          typedTable,
          typedColumns,
          Object.fromEntries(
            typedColumns.map((column) => [
              column.name,
              parseCellValue(
                inputValue(typedResult[0][column.name], column),
                column,
              ),
            ]),
          ),
        );
        await execute(roundTrip.query, roundTrip.params);
        const exactDates = buildDataQuery(
          adapter,
          typedTable,
          typedColumns,
          {
            ...emptyFilters,
            rules: typedColumns
              .filter((column) => ["day", "stamp"].includes(column.name))
              .map((column) =>
                rule(
                  column.name,
                  "eq",
                  inputValue(typedResult[0][column.name], column),
                ),
              ),
          },
          [],
          0,
          25,
        );
        assert.equal(
          normalizedRows(await query(exactDates.query, exactDates.params))
            .length,
          2,
        );
      }

      // Exercise database switching, including driver-specific DSN formats.
      if (adapter.createDatabaseQuery("test")) {
        const other = `e2e ${suffix} " \` ]`;
        await sql(
          id,
          adapter.createDatabaseQuery(other),
          undefined,
          [],
          "execute",
        );
        cleanups.push(() =>
          sql(id, `DROP DATABASE ${q(other)}`, undefined, [], "execute"),
        );
        const currentDatabase =
          driver === "postgres"
            ? "SELECT current_database() AS name"
            : driver === "mysql"
              ? "SELECT DATABASE() AS name"
              : "SELECT DB_NAME() AS name";
        for (const variant of [dsn, ...(entry.alternateDSNs ?? [])]) {
          await request(
            `/connections/${readinessID}`,
            { name: readinessID, sql: { driver, dsn: variant } },
            "PUT",
          );
          assert.equal(
            (await sql(readinessID, currentDatabase, other)).rows[0].name,
            other,
          );
        }
      }

      await page.goto(
        `${baseURL}/${id}/${encodeURIComponent(database)}/${encodeURIComponent(table)}`,
      );
      await expect(
        page.getByRole("cell", { name: "before", exact: true }),
      ).toBeVisible({ timeout: 15_000 });
      await page
        .getByRole("button", { name: "Structure", exact: true })
        .click();
      await expect(
        page.getByRole("cell", { name: "tenant", exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Data", exact: true }).click();
      await expect(
        page.getByRole("cell", { name: "before", exact: true }),
      ).toBeVisible();

      await page.getByRole("button", { name: "Filter", exact: true }).click();
      await page
        .getByLabel("Filter column 1", { exact: true })
        .selectOption("note");
      await page.getByLabel("Filter value 1", { exact: true }).fill("before");
      await page.getByRole("button", { name: "Apply", exact: true }).click();
      await expect(
        page.getByRole("cell", { name: "keep", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("cell", { name: "before", exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Clear", exact: true }).click();
      await expect(
        page.getByRole("cell", { name: "keep", exact: true }),
      ).toBeVisible();

      if (driver !== "trino") {
        await expect(
          page.getByRole("button", { name: "Delete row", exact: true }),
        ).toHaveCount(2, { timeout: 15_000 });
        await page
          .getByRole("cell", { name: "before", exact: true })
          .locator("span")
          .click();
        const editor = page.getByRole("textbox", { name: "Value for note" });
        await expect(editor).toBeVisible();
        await editor.fill("after's \\ value");
        const updated = waitForSQL("execute", (statement) =>
          statement.startsWith("UPDATE "),
        );
        await editor.press("Enter");
        const updateResponse = await updated;
        assert.equal(updateResponse.status(), 200, await updateResponse.text());
        const changedCell = page.getByRole("cell", {
          name: "after's \\ value",
          exact: true,
        });
        await expect(changedCell).toBeVisible();
        let rows = normalizedRows(await query(adapter.selectAllQuery(table)));
        assert.equal(rows.find((row) => Number(row.id) === 1).note, "keep");
        assert.equal(
          rows.find((row) => Number(row.id) === 2).note,
          "after's \\ value",
        );
        const changedRow = page.getByRole("row").filter({ has: changedCell });
        await changedRow
          .getByRole("button", { name: "Delete row", exact: true })
          .click();
        const deleted = waitForSQL("execute", (statement) =>
          statement.startsWith("DELETE "),
        );
        await changedRow
          .getByRole("button", { name: "Confirm delete", exact: true })
          .click();
        const deleteResponse = await deleted;
        assert.equal(deleteResponse.status(), 200, await deleteResponse.text());
        await expect(changedCell).toHaveCount(0);
        rows = normalizedRows(await query(adapter.selectAllQuery(table)));
        assert.equal(rows.length, 1);
        assert.equal(rows[0].note, "keep");
      } else {
        await expect(
          page.getByRole("button", { name: "Delete row", exact: true }),
        ).toHaveCount(0);
        assert.equal(
          normalizedRows(await query(adapter.selectAllQuery(table))).length,
          2,
        );
      }
      // SQL has its own workspace, with a real locally bundled editor.
      await page.getByRole("button", { name: "SQL", exact: true }).click();
      await page.locator(".monaco-editor").waitFor();
      await page.locator(".view-lines").click({ position: { x: 70, y: 10 } });
      const lookup = `SELECT r.${q("note")} FROM ${q(table)} r WHERE r.${q("id")} = 1;`;
      await page.keyboard.insertText(lookup);
      await expect(
        page.getByRole("button", { name: "Run statement", exact: true }),
      ).toBeEnabled();
      await page
        .getByRole("button", { name: "Run statement", exact: true })
        .click();
      await expect(
        page.getByRole("cell", { name: "keep", exact: true }),
      ).toBeVisible();
      const lookupTabID = await page
        .getByRole("tab", { selected: true })
        .getAttribute("id");
      const lookupTab = page.locator(`#${lookupTabID}`);
      await page.getByRole("button", { name: "Data", exact: true }).click();
      await page
        .getByRole("button", { name: "Structure", exact: true })
        .click();
      await page.getByRole("button", { name: "SQL", exact: true }).click();
      await expect(lookupTab).toHaveAttribute("aria-selected", "true");
      await page.reload();
      await page.getByRole("button", { name: "SQL", exact: true }).click();
      await expect(page.locator(".view-lines")).toContainText("SELECT");
      await page
        .getByRole("button", { name: "Run statement", exact: true })
        .click();
      await expect(
        page.getByRole("cell", { name: "keep", exact: true }),
      ).toBeVisible();

      // Sidebar actions open editable SQL drafts without replacing existing work.
      const sidebar = page.getByRole("complementary", { name: "Connections" });
      await sidebar
        .getByRole("button", { name: database, exact: true })
        .click({ button: "right" });
      await page
        .getByRole("menuitem", { name: "Create table…", exact: true })
        .click();
      await expect(page.locator(".view-lines")).toContainText("CREATE TABLE");
      await expect(lookupTab).toBeVisible();
      const createdTable = `e2e_created_${suffix}`;
      const template = (
        await page.locator(".view-lines .view-line").allTextContents()
      )
        .join("\n")
        .replaceAll("\u00a0", " ");
      const suggestedName = template.match(/\bnew_table(?:_\d+)?\b/)?.[0];
      assert.ok(suggestedName, template);
      await page.locator(".view-lines").click({ position: { x: 70, y: 10 } });
      await page.keyboard.press("ControlOrMeta+f");
      const find = page.getByRole("textbox", { name: "Find", exact: true });
      await find.fill(suggestedName);
      await find.press("Escape");
      await page.keyboard.insertText(createdTable);
      const created = waitForSQL("execute", (statement) =>
        statement.startsWith(`CREATE TABLE ${q(createdTable)}`),
      );
      await page
        .getByRole("button", { name: "Run statement", exact: true })
        .click();
      const createResponse = await created;
      assert.equal(createResponse.status(), 200, await createResponse.text());
      let createdTableExists = true;
      cleanups.push(() =>
        createdTableExists
          ? execute(`DROP TABLE ${q(createdTable)}`)
          : undefined,
      );
      const createdColumns = adapter.parseColumns(
        (await query(adapter.listColumnsQuery(createdTable))).rows ?? [],
      );
      assert.deepEqual(
        createdColumns.map((column) => column.name),
        ["id", "name"],
      );
      assert.equal(createdColumns[0].primaryKey, driver !== "trino");
      await execute(
        driver === "trino"
          ? `INSERT INTO ${q(createdTable)} VALUES (1, ?)`
          : `INSERT INTO ${q(createdTable)} (${q("name")}) VALUES (${placeholders(1)})`,
        ["Created in the editor"],
      );
      await sidebar
        .getByRole("button", { name: createdTable, exact: true })
        .click();
      await expect(
        page.getByRole("cell", { name: "Created in the editor", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("cell", { name: "1", exact: true }),
      ).toBeVisible();
      await sidebar
        .getByRole("button", {
          name: `Actions for table ${createdTable}`,
          exact: true,
        })
        .click();
      await page
        .getByRole("menuitem", { name: "Delete table…", exact: true })
        .click();
      await expect(page.locator(".view-lines")).toContainText(
        `DROP TABLE ${q(createdTable)};`,
      );
      // Preparing the DROP never executes it; the table remains until Run.
      assert.equal(
        (
          await query(
            `SELECT COUNT(*) AS ${q("count")} FROM ${q(createdTable)}`,
          )
        ).rows[0].count,
        1,
      );
      const deleted = waitForSQL("execute", (statement) =>
        statement.startsWith(`DROP TABLE ${q(createdTable)}`),
      );
      await page
        .getByRole("button", { name: "Run statement", exact: true })
        .click();
      const deleteResponse = await deleted;
      assert.equal(deleteResponse.status(), 200, await deleteResponse.text());
      createdTableExists = false;
      await expect(
        sidebar.getByRole("button", { name: createdTable, exact: true }),
      ).toHaveCount(0);
      await lookupTab.click();
      await expect(page.locator(".view-lines")).toContainText(lookup);

      if (driver === "sqlite") {
        // Keyboard menus keep focus in the menu and preserve the source draft.
        await sidebar.getByRole("button", { name: table, exact: true }).focus();
        await page.keyboard.press("Shift+F10");
        await expect(page.getByRole("menu")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(
          sidebar.getByRole("button", {
            name: `Actions for table ${table}`,
            exact: true,
          }),
        ).toBeFocused();
        await page.keyboard.press("Shift+F10");
        await page.keyboard.press("Home");
        await page.keyboard.press("Enter");
        await expect(
          page.getByRole("tab", { name: table, exact: true }),
        ).toHaveCount(1);
        await expect(page.locator(".view-lines")).toContainText(
          adapter.selectAllQuery(table),
        );
        await page
          .getByRole("button", { name: `Close ${table}`, exact: true })
          .click();

        // Actions on a different connection must open in that connection's scope.
        await sidebar
          .getByRole("button", { name: `Expand ${readinessID}`, exact: true })
          .click();
        const connectionTree = (name) =>
          sidebar
            .locator(".connection-row")
            .filter({ has: page.getByRole("button", { name, exact: true }) })
            .locator("..");
        const otherDatabase = connectionTree(readinessID).getByRole("button", {
          name: database,
          exact: true,
        });
        await otherDatabase.click({ button: "right" });
        await page
          .getByRole("menuitem", { name: "Create table…", exact: true })
          .click();
        await expect(page).toHaveURL(`${baseURL}/${readinessID}/${database}`);
        await expect(
          page.getByRole("tab", { name: "Create table", exact: true }),
        ).toHaveCount(1);
        await expect(lookupTab).toHaveCount(0);
        await page
          .getByRole("button", { name: "Close Create table", exact: true })
          .click();
        await sidebar
          .getByRole("button", { name: connectionName, exact: true })
          .click();
        await connectionTree(connectionName)
          .getByRole("button", { name: database, exact: true })
          .click();
        await expect(page.locator(".view-lines")).toContainText(lookup);
        await sidebar
          .getByRole("button", { name: readinessID, exact: true })
          .click();
        await otherDatabase.click();
        await expect(
          page.getByRole("tab", { name: "Create table", exact: true }),
        ).toHaveCount(0);
      }

      assert.deepEqual(pageErrors, []);
    },
  );
}

test(
  "SQLite: full browsing, edit recovery, typed insert, query drafts, completion and cancellation",
  { timeout: 120_000, skip: selected && !selected.includes("sqlite") },
  async (t) => {
    const suffix = Date.now().toString(36),
      id = `ui-${suffix}`,
      table = `zz_ui_${suffix}`;
    await request("/connections", {
      id,
      name: "UI regression",
      sql: { driver: "sqlite", dsn: process.env.GRANITE_TEST_SQLITE },
    });
    const execute = (query, params = []) =>
      sql(id, query, "main", params, "execute");
    const query = (query, params = []) => sql(id, query, "main", params);
    await execute(
      `CREATE TABLE "${table}" (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, score DECIMAL, enabled BOOLEAN, joined DATE, metadata JSON, note TEXT)`,
    );
    const extraTables = Array.from(
      { length: 52 },
      (_, index) => `aa_ui_${suffix}_${index}`,
    );
    for (const name of extraTables)
      await execute(`CREATE TABLE "${name}" (id INTEGER PRIMARY KEY)`);
    t.after(async () => {
      for (const name of [table, ...extraTables])
        await execute(`DROP TABLE "${name}"`);
      await request(`/connections/${id}`, undefined, "DELETE");
    });
    await execute(
      `WITH RECURSIVE numbers(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM numbers WHERE n<155) INSERT INTO "${table}" SELECT n, 'Person '||printf('%03d',n), n*2, n%2, '2026-09-12', '{"ok":true}', CASE WHEN n%2=0 THEN NULL ELSE '100%_ready!' END FROM numbers`,
    );
    const page = await browser.newPage({
      viewport: { width: 1280, height: 850 },
    });
    t.after(() => page.close());
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const route = `${baseURL}/${id}/main/${table}`;
    await page.goto(route);
    await expect(
      page.getByRole("button", { name: "Delete row", exact: true }),
    ).toHaveCount(100);
    await expect(
      page.getByRole("button", { name: "Next page" }),
    ).toBeInViewport();
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(
      page.getByRole("cell", { name: "Person 101", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Count rows" }).click();
    await expect(page.getByRole("button", { name: "155 total" })).toBeVisible();
    await page.getByRole("button", { name: "Previous page" }).click();
    const first = page.getByRole("cell", { name: "Person 001", exact: true });
    await first.locator(".cell-value").click();
    await page.getByLabel("Value for name", { exact: true }).fill("Person 002");
    await page.getByLabel("Value for name", { exact: true }).press("Enter");
    await expect(first.locator(".cell-value")).toHaveText("Person 001");
    await expect(page.getByRole("alert")).toContainText("UNIQUE");
    assert.equal(
      (await query(`SELECT name FROM "${table}" WHERE id=1`)).rows[0].name,
      "Person 001",
    );
    await page.getByRole("button", { name: "Dismiss edit error" }).click();
    await page.getByRole("button", { name: "New row", exact: true }).click();
    const insert = page.getByRole("complementary", { name: "New row" });
    for (const [name, value] of [
      ["id", "9007199254740993"],
      ["name", "Inserted exact key"],
      ["score", "123.5"],
      ["enabled", "true"],
      ["joined", "2026-09-13"],
      ["metadata", '{"nested":{"key":"value"}}'],
    ]) {
      await insert
        .getByLabel(`Value mode for ${name}`, { exact: true })
        .selectOption("value");
      const field = insert.getByLabel(`New ${name}`, { exact: true });
      if (name === "enabled") await field.selectOption(value);
      else await field.fill(value);
    }
    await insert.getByRole("button", { name: "Insert row" }).click();
    await expect(insert).toHaveCount(0);
    assert.equal(
      (await query(`SELECT id FROM "${table}" WHERE name='Inserted exact key'`))
        .rows[0].id,
      "9007199254740993",
    );
    await page
      .getByRole("textbox", { name: "Search text columns", exact: true })
      .fill("Inserted exact key");
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    const added = page.getByRole("cell", {
      name: "Inserted exact key",
      exact: true,
    });
    await expect(added).toBeVisible();
    await added.locator(".cell-value").click();
    await page
      .getByLabel("Value for name", { exact: true })
      .fill("Inserted exact key updated");
    await page.getByLabel("Value for name", { exact: true }).press("Enter");
    await expect(
      page.getByRole("cell", {
        name: "Inserted exact key updated",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Inspect row", exact: true })
      .click();
    await expect(
      page.getByRole("complementary", { name: "Row inspector" }),
    ).toContainText("nested");
    await page.getByRole("button", { name: "Close row inspector" }).click();
    await page.getByRole("button", { name: "Delete row", exact: true }).click();
    await page
      .getByRole("button", { name: "Confirm delete", exact: true })
      .click();
    await expect(
      page.getByRole("cell", {
        name: "Inserted exact key updated",
        exact: true,
      }),
    ).toHaveCount(0);
    assert.equal(
      (
        await query(
          `SELECT COUNT(*) AS count FROM "${table}" WHERE id=9007199254740993`,
        )
      ).rows[0].count,
      0,
    );
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await page.getByRole("button", { name: "Pin name", exact: true }).click();
    await expect(page.getByRole("columnheader").first()).toContainText("name");
    await page
      .getByRole("button", { name: `Actions for table ${table}`, exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Add to favorites", exact: true })
      .click();
    await page.getByRole("button", { name: "Favorites", exact: true }).click();
    await expect(
      page.getByRole("navigation", { name: "Database and storage browser" }),
    ).toContainText(table);
    await page.getByRole("button", { name: "Favorites", exact: true }).click();

    await page.getByRole("button", { name: "SQL", exact: true }).click();
    await page.locator(".monaco-editor").waitFor();
    const replaceSQL = async (text) => {
      await page.locator(".view-lines").click({ position: { x: 70, y: 10 } });
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.insertText(text);
      await expect(
        page.getByRole("button", { name: /Run (statement|selection)/ }),
      ).toBeEnabled();
    };
    await replaceSQL(`SELECT r. FROM "${table}" r;`);
    // Place the cursor immediately after r. without depending on platform Home shortcuts.
    await page.keyboard.press("ArrowLeft");
    for (let index = 0; index < ` FROM "${table}" r`.length; index++)
      await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Control+Space");
    await expect(page.locator(".suggest-widget.visible")).toContainText("name");
    await expect(page.locator(".suggest-widget.visible")).toContainText(
      "score",
    );
    await page.keyboard.press("Escape");
    await replaceSQL(`select name from "${table}" where id = 1;`);
    await page.getByRole("button", { name: "Format", exact: true }).click();
    await expect(page.locator(".view-lines")).toContainText("SELECT");
    await page
      .getByRole("button", { name: "Run statement", exact: true })
      .click();
    await expect(
      page.getByRole("cell", { name: "Person 001", exact: true }),
    ).toBeVisible();
    const lookupTabID = await page
      .getByRole("tab", { selected: true })
      .getAttribute("id");
    const lookupTab = page.locator(`#${lookupTabID}`);
    await page.getByRole("button", { name: "New query", exact: true }).click();
    await replaceSQL(
      "SELECT 22 AS selection_result; SELECT 33 AS other_result;",
    );
    // Run only selected SQL.
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("ArrowLeft");
    for (
      let index = 0;
      index < "SELECT 22 AS selection_result;".length;
      index++
    )
      await page.keyboard.press("Shift+ArrowRight");
    await page
      .getByRole("button", { name: "Run selection", exact: true })
      .click();
    await expect(
      page.getByRole("columnheader", { name: /selection_result/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: /other_result/ }),
    ).toHaveCount(0);
    await replaceSQL(
      "CREATE TEMP TABLE batch_values (n INTEGER); INSERT INTO batch_values VALUES (8); SELECT n FROM batch_values;",
    );
    await page.getByLabel("More run options", { exact: true }).click();
    await page.getByRole("button", { name: /Run all ·/ }).click();
    await expect(
      page.getByRole("cell", { name: "8", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Result 3", exact: true }),
    ).toBeVisible();
    await replaceSQL(
      "WITH RECURSIVE loop(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM loop) SELECT SUM(n) AS value FROM loop;",
    );
    await page
      .getByRole("button", { name: "Run statement", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Cancel query", exact: true })
      .click();
    await expect(page.locator(".error-banner[role=alert]")).toContainText(
      "cancelled",
    );
    await lookupTab.click();
    await expect(lookupTab).toHaveAttribute("aria-selected", "true");
    await page.reload();
    await page.getByRole("button", { name: "SQL", exact: true }).click();
    await page
      .getByRole("button", { name: "Run statement", exact: true })
      .click();
    await expect(
      page.getByRole("cell", { name: "Person 001", exact: true }),
    ).toBeVisible();
    // Closed drafts remain recoverable after reload, without a saved-query library.
    await lookupTab
      .locator("..")
      .getByRole("button", { name: /^Close / })
      .click();
    await page.reload();
    await page.getByRole("button", { name: "SQL", exact: true }).click();
    await page
      .getByRole("button", { name: "Query history", exact: true })
      .click();
    const history = page.getByRole("region", { name: "Query history" });
    await expect(history.locator(".history-entry").first()).toContainText(
      table,
    );
    await history.locator(".history-entry").first().click();
    await expect(history).toHaveCount(0);
    await expect(page.getByRole("tab")).toHaveCount(2);
    await expect(
      page.getByRole("cell", { name: "Person 001", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Run statement", exact: true })
      .click();
    await expect(
      page.getByRole("cell", { name: "Person 001", exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 760, height: 700 });
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await page.getByRole("button", { name: "Data", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Next page" }),
    ).toBeInViewport();
    assert.deepEqual(errors, []);
  },
);
