import type { DatabaseDriver } from "../types/index.ts";

export interface SQLToken {
  text: string;
  start: number;
  end: number;
  kind: "word" | "identifier" | "string" | "comment" | "symbol";
  depth: number;
}
// Keep offsets intact for statement execution and completion. Quoted identifiers,
// nested comments, dollar strings and semicolons inside literals are not SQL words.
export function sqlTokens(sql: string, driver?: DatabaseDriver): SQLToken[] {
  const tokens: SQLToken[] = [];
  let i = 0,
    depth = 0;
  while (i < sql.length) {
    if (/\s/.test(sql[i])) {
      i++;
      continue;
    }
    const start = i;
    let kind: SQLToken["kind"] = "symbol";
    if (sql.startsWith("--", i) || (driver === "mysql" && sql[i] === "#")) {
      kind = "comment";
      while (i < sql.length && sql[i] !== "\n") i++;
    } else if (sql.startsWith("/*", i)) {
      kind = "comment";
      i += 2;
      let nesting = 1;
      while (i < sql.length && nesting) {
        if (sql.startsWith("/*", i)) {
          nesting++;
          i += 2;
        } else if (sql.startsWith("*/", i)) {
          nesting--;
          i += 2;
        } else i++;
      }
    } else if (
      (sql[i] === "q" || sql[i] === "Q") &&
      sql[i + 1] === "'" &&
      sql[i + 2]
    ) {
      kind = "string";
      const open = sql[i + 2];
      const close =
        ({ "[": "]", "(": ")", "{": "}", "<": ">" } as Record<string, string>)[
          open
        ] ?? open;
      const end = sql.indexOf(`${close}'`, i + 3);
      i = end < 0 ? sql.length : end + 2;
    } else if (sql[i] === "$" && /^\$(?:[a-z_]\w*)?\$/i.test(sql.slice(i))) {
      kind = "string";
      const delimiter = sql.slice(i).match(/^\$(?:[a-z_]\w*)?\$/i)![0];
      const end = sql.indexOf(delimiter, i + delimiter.length);
      i = end < 0 ? sql.length : end + delimiter.length;
    } else if (["'", '"', "`", "["].includes(sql[i])) {
      const open = sql[i++],
        close = open === "[" ? "]" : open;
      kind = open === "'" ? "string" : "identifier";
      while (i < sql.length) {
        if (sql[i] === close) {
          i++;
          if (sql[i] === close) {
            i++;
            continue;
          }
          break;
        }
        if (sql[i] === "\\" && open === "'") i++;
        i++;
      }
    } else if (
      /[\w$]/.test(sql[i]) ||
      (driver === "sqlserver" && sql[i] === "#")
    ) {
      kind = "word";
      const characters = driver === "sqlserver" ? /[\w$#]/ : /[\w$]/;
      while (i < sql.length && characters.test(sql[i])) i++;
    } else {
      if (sql[i] === ")") depth = Math.max(0, depth - 1);
      i++;
    }
    tokens.push({ text: sql.slice(start, i), start, end: i, kind, depth });
    if (sql[start] === "(" && kind === "symbol") depth++;
  }
  return tokens;
}
export interface SQLStatement {
  sql: string;
  start: number;
  end: number;
}
function oracleBlock(tokens: SQLToken[]): boolean {
  const words = tokens
    .filter((t) => t.kind !== "comment")
    .slice(0, 8)
    .map((t) => t.text.toUpperCase());
  if (["DECLARE", "BEGIN"].includes(words[0])) return true;
  if (words[0] !== "CREATE") return false;
  const object = words
    .slice(1)
    .filter(
      (word) =>
        !["OR", "REPLACE", "EDITIONABLE", "NONEDITIONABLE"].includes(word),
    );
  return (
    ["FUNCTION", "PROCEDURE", "PACKAGE", "TRIGGER"].includes(object[0]) ||
    (object[0] === "TYPE" && object[1] === "BODY")
  );
}
export function splitStatements(
  sql: string,
  driver?: DatabaseDriver,
): SQLStatement[] {
  const tokens = sqlTokens(sql, driver);
  const result: SQLStatement[] = [];
  let start = 0;
  let current: SQLToken[] = [];
  const append = (end: number, next: number) => {
    const part = sql.slice(start, end);
    if (sqlTokens(part, driver).some((t) => t.kind !== "comment"))
      result.push({ sql: part.trim(), start, end: next });
    start = next;
    current = [];
  };
  for (const token of tokens) {
    // SQL*Plus uses a slash on its own line to terminate a PL/SQL unit.
    if (
      driver === "oracle" &&
      token.text === "/" &&
      token.kind === "symbol" &&
      sql
        .slice(
          sql.lastIndexOf("\n", token.start - 1) + 1,
          sql.indexOf("\n", token.end) < 0
            ? sql.length
            : sql.indexOf("\n", token.end),
        )
        .trim() === "/"
    ) {
      append(token.start, token.end);
      continue;
    }
    current.push(token);
    if (
      token.text === ";" &&
      token.kind === "symbol" &&
      token.depth === 0 &&
      !(driver === "oracle" && oracleBlock(current))
    )
      append(token.start, token.end);
  }
  append(sql.length, sql.length);
  return result;
}
export function statementAt(
  sql: string,
  offset: number,
  driver?: DatabaseDriver,
): string {
  const parts = splitStatements(sql, driver);
  return (
    (
      parts.find((p) => offset >= p.start && offset < p.end) ??
      parts.find((p) => p.start >= offset) ??
      parts.at(-1)
    )?.sql ?? ""
  );
}
export function returnsRows(sql: string, driver?: DatabaseDriver): boolean {
  const tokens = sqlTokens(sql, driver)
    .filter((t) => t.kind === "word" && t.depth === 0)
    .map((t) => t.text.toUpperCase());
  let first: string | undefined = tokens[0];
  if (first === "WITH")
    first = tokens.find((t) =>
      ["SELECT", "INSERT", "UPDATE", "DELETE", "MERGE"].includes(t),
    );
  return (
    [
      "SELECT",
      "SHOW",
      "DESCRIBE",
      "DESC",
      "EXPLAIN",
      "PRAGMA",
      "VALUES",
      "TABLE",
    ].includes(first ?? "") ||
    tokens.includes("RETURNING") ||
    tokens.includes("OUTPUT")
  );
}
export function identifierText(text: string): string {
  if (text.startsWith('"')) return text.slice(1, -1).replaceAll('""', '"');
  if (text.startsWith("`")) return text.slice(1, -1).replaceAll("``", "`");
  if (text.startsWith("[")) return text.slice(1, -1).replaceAll("]]", "]");
  return text;
}
const reservedAliases = new Set(
  "WHERE SET VALUES ON JOIN LEFT RIGHT FULL INNER OUTER CROSS GROUP ORDER HAVING LIMIT OFFSET FETCH UNION EXCEPT INTERSECT RETURNING USING WINDOW FOR AS".split(
    " ",
  ),
);
export function tableReferences(
  sql: string,
  driver?: DatabaseDriver,
): { name: string; alias?: string }[] {
  const tokens = sqlTokens(sql, driver).filter(
    (t) => t.kind !== "comment" && t.kind !== "string",
  );
  const result: { name: string; alias?: string }[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (
      !["FROM", "JOIN", "UPDATE", "INTO"].includes(tokens[i].text.toUpperCase())
    )
      continue;
    let j = i + 1;
    if (!["word", "identifier"].includes(tokens[j]?.kind ?? "")) continue;
    let name = identifierText(tokens[j++].text);
    while (
      tokens[j]?.text === "." &&
      ["word", "identifier"].includes(tokens[j + 1]?.kind ?? "")
    ) {
      name += `.${identifierText(tokens[j + 1].text)}`;
      j += 2;
    }
    if (tokens[j]?.text.toUpperCase() === "AS") j++;
    const alias =
      tokens[j] &&
      ["word", "identifier"].includes(tokens[j].kind) &&
      !reservedAliases.has(tokens[j].text.toUpperCase())
        ? identifierText(tokens[j].text)
        : undefined;
    result.push({ name, alias });
  }
  return result;
}
// Explicit CTE column lists can be suggested even before a query is valid.
export function cteColumns(
  sql: string,
  driver?: DatabaseDriver,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const tokens = sqlTokens(sql, driver).filter((t) => t.kind !== "comment");
  if (tokens[0]?.text.toUpperCase() !== "WITH") return result;
  for (let i = 1; i < tokens.length; i++) {
    if (
      tokens[i].depth !== 0 ||
      !["word", "identifier"].includes(tokens[i].kind)
    )
      continue;
    let j = i + 1;
    const names: string[] = [];
    if (tokens[j]?.text === "(") {
      j++;
      while (j < tokens.length && tokens[j].depth > 0) {
        if (["word", "identifier"].includes(tokens[j].kind))
          names.push(identifierText(tokens[j].text));
        j++;
      }
      j++;
    }
    if (tokens[j]?.text.toUpperCase() === "AS" && tokens[j + 1]?.text === "(")
      result[identifierText(tokens[i].text)] = names;
  }
  return result;
}
export const commonKeywords =
  "SELECT|FROM|WHERE|AND|OR|NOT|IN|IS NULL|IS NOT NULL|LIKE|BETWEEN|ORDER BY|GROUP BY|HAVING|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|ON|AS|DISTINCT|INSERT INTO|VALUES|UPDATE|SET|DELETE FROM|CREATE TABLE|ALTER TABLE|DROP TABLE|PRIMARY KEY|FOREIGN KEY|REFERENCES|ASC|DESC|UNION ALL|EXISTS|CASE|WHEN|THEN|ELSE|END|WITH".split(
    "|",
  );
export const dialectKeywords: Record<DatabaseDriver, string[]> = {
  postgres: [
    "LIMIT",
    "OFFSET",
    "RETURNING",
    "ILIKE",
    "ON CONFLICT",
    "NULLS FIRST",
    "NULLS LAST",
    "DISTINCT ON",
    "LATERAL",
    "FILTER",
  ],
  mysql: [
    "LIMIT",
    "OFFSET",
    "ON DUPLICATE KEY UPDATE",
    "SHOW TABLES",
    "DESCRIBE",
    "EXPLAIN",
    "AUTO_INCREMENT",
  ],
  sqlite: [
    "LIMIT",
    "OFFSET",
    "RETURNING",
    "ON CONFLICT",
    "PRAGMA",
    "EXPLAIN QUERY PLAN",
  ],
  sqlserver: [
    "TOP",
    "OFFSET",
    "FETCH NEXT",
    "ROWS ONLY",
    "OUTPUT",
    "CROSS APPLY",
    "OUTER APPLY",
    "IDENTITY",
  ],
  oracle: [
    "OFFSET",
    "FETCH NEXT",
    "ROWS ONLY",
    "RETURNING",
    "CONNECT BY",
    "START WITH",
    "NULLS FIRST",
    "NULLS LAST",
    "MERGE INTO",
  ],
  trino: [
    "LIMIT",
    "OFFSET",
    "UNNEST",
    "CROSS JOIN",
    "TRY_CAST",
    "SHOW CATALOGS",
    "SHOW SCHEMAS",
    "SHOW TABLES",
    "DESCRIBE",
  ],
};
export const dialectFunctions: Record<DatabaseDriver, string[]> = {
  postgres: [
    "NOW",
    "DATE_TRUNC",
    "JSONB_BUILD_OBJECT",
    "STRING_AGG",
    "GENERATE_SERIES",
    "TO_CHAR",
  ],
  mysql: [
    "NOW",
    "DATE_FORMAT",
    "JSON_EXTRACT",
    "GROUP_CONCAT",
    "IFNULL",
    "CONCAT",
  ],
  sqlite: [
    "DATE",
    "DATETIME",
    "STRFTIME",
    "JSON_EXTRACT",
    "GROUP_CONCAT",
    "IFNULL",
  ],
  sqlserver: [
    "GETDATE",
    "DATEADD",
    "DATEDIFF",
    "JSON_VALUE",
    "STRING_AGG",
    "ISNULL",
  ],
  oracle: [
    "TO_DATE",
    "TO_TIMESTAMP",
    "TO_CHAR",
    "NVL",
    "LISTAGG",
    "JSON_VALUE",
  ],
  trino: [
    "DATE_TRUNC",
    "DATE_ADD",
    "JSON_EXTRACT_SCALAR",
    "ARRAY_AGG",
    "APPROX_DISTINCT",
    "TRY",
  ],
};
