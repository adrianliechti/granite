import type { ColumnInfo, DatabaseAdapter } from "./adapters/types";
import { parameterPlaceholder } from "./adapters/rows.ts";

export type ValueKind =
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "datetime"
  | "json";
export type FilterOperator =
  | "eq"
  | "neq"
  | "contains"
  | "notContains"
  | "starts"
  | "ends"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "in"
  | "notIn"
  | "null"
  | "notNull"
  | "empty"
  | "notEmpty";
export interface FilterRule {
  id: string;
  column: string;
  operator: FilterOperator;
  value: string;
  second: string;
}
export interface DataFilters {
  search: string;
  match: "all" | "any";
  caseSensitive: boolean;
  rules: FilterRule[];
}
export interface DataSort {
  id: string;
  desc: boolean;
}
export const emptyFilters: DataFilters = {
  search: "",
  match: "all",
  caseSensitive: false,
  rules: [],
};

export function valueKind(type: string): ValueKind {
  if (/bool|^bit\b/i.test(type)) return "boolean";
  if (
    /^(?:tinyint|smallint|mediumint|bigint|integer|int[248]?|numeric|decimal|number|float[48]?|double|real|smallmoney|money|binary_float|binary_double|serial|bigserial|smallserial)\b/i.test(
      type,
    )
  )
    return "number";
  if (/json/i.test(type)) return "json";
  if (/timestamp|datetime|^date .*time/i.test(type)) return "datetime";
  if (/^date$/i.test(type)) return "date";
  return "text";
}

export const operatorLabels: Record<FilterOperator, string> = {
  eq: "is",
  neq: "is not",
  contains: "contains",
  notContains: "does not contain",
  starts: "starts with",
  ends: "ends with",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  between: "between",
  in: "is one of",
  notIn: "is not one of",
  null: "is null",
  notNull: "is not null",
  empty: "is empty",
  notEmpty: "is not empty",
};

export function editableColumn(column?: ColumnInfo): boolean {
  if (/^binary_(float|double)$/i.test(column?.type ?? "")) return true;
  return !/binary|bytea|raw|blob|image|xml|array|\[\]|struct|map\(|row\(|geometry|geography|^point\b|interval/i.test(
    column?.type ?? "",
  );
}

export function operatorsFor(column?: ColumnInfo): FilterOperator[] {
  const kind = valueKind(column?.type ?? "text");
  if (!editableColumn(column)) return ["null", "notNull"];
  if (kind === "boolean") return ["eq", "neq", "null", "notNull"];
  if (kind === "json") return ["null", "notNull"];
  const common: FilterOperator[] = [
    "eq",
    "neq",
    "in",
    "notIn",
    "null",
    "notNull",
  ];
  return kind === "text"
    ? [
        "contains",
        "notContains",
        "starts",
        "ends",
        ...common,
        "empty",
        "notEmpty",
      ]
    : [
        ...common.slice(0, 2),
        "gt",
        "gte",
        "lt",
        "lte",
        "between",
        ...common.slice(2),
      ];
}

export function parseCellValue(value: string, column?: ColumnInfo): unknown {
  switch (valueKind(column?.type ?? "text")) {
    case "number":
      if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))
        throw new Error("Enter a number.");
      return { type: "number", value: value.trim() };
    case "boolean":
      if (!/^(true|false|0|1)$/i.test(value))
        throw new Error("Choose true or false.");
      return value === "1" || value.toLowerCase() === "true";
    case "json":
      JSON.parse(value);
      return value;
    case "date":
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        Number.isNaN(Date.parse(value)) ||
        new Date(value).toISOString().slice(0, 10) !== value
      )
        throw new Error("Use YYYY-MM-DD.");
      return { type: "date", value };
    case "datetime":
      if (
        !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(
          value,
        ) ||
        Number.isNaN(Date.parse(value)) ||
        new Date(value.slice(0, 10)).toISOString().slice(0, 10) !==
          value.slice(0, 10)
      )
        throw new Error("Use YYYY-MM-DD HH:mm:ss, with an optional timezone.");
      return { type: "datetime", value: value.replace(" ", "T") };
    default:
      return value;
  }
}

export function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "object"
    ? JSON.stringify(value, null, 2)
    : String(value);
}

// SQL drivers attach zones when serializing time.Time even for date-only and
// wall-clock columns. Keep the column's semantics when editing or binding keys.
export function inputValue(value: unknown, column?: ColumnInfo): string {
  const text = displayValue(value),
    kind = valueKind(column?.type ?? "text");
  if (kind === "date" && /^\d{4}-\d{2}-\d{2}T/.test(text))
    return text.slice(0, 10);
  if (
    kind === "datetime" &&
    !/with time zone|with local time zone|timestamptz|datetimeoffset/i.test(
      column?.type ?? "",
    )
  )
    return text.replace(/(?:Z|[+-]\d{2}:\d{2})$/, "");
  return text;
}

// A JSON array also allows commas and empty strings inside individual list values.
export function parseList(value: string): string[] {
  if (value.trim().startsWith("[")) {
    const list: unknown = JSON.parse(value);
    if (
      !Array.isArray(list) ||
      !list.length ||
      list.some((v) => v === null || typeof v === "object")
    )
      throw new Error("Enter a non-empty list of values.");
    return list.map(String);
  }
  const list = value.split(",").map((v) => v.trim());
  if (!list.length || list.some((v) => !v))
    throw new Error("Separate values with commas, or use a JSON array.");
  return list;
}

export function buildDataQuery(
  adapter: DatabaseAdapter,
  table: string,
  columns: ColumnInfo[],
  filters: DataFilters,
  sorting: DataSort[],
  page: number,
  pageSize: number,
) {
  if (
    !Number.isSafeInteger(page) ||
    page < 0 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 1000
  )
    throw new Error("Invalid page.");
  const params: unknown[] = [];
  const bind = (value: unknown, column?: ColumnInfo) => {
    params.push(value);
    return parameterPlaceholder(adapter.driver, params.length, column);
  };
  const q = (name: string) => adapter.quoteIdentifier(name);
  const textColumn = (column: ColumnInfo) => {
    let name = q(column.name);
    if (!/char|text|clob|enum|set|string/i.test(column.type)) {
      name = `CAST(${name} AS ${adapter.driver === "oracle" ? "VARCHAR2(4000)" : adapter.driver === "sqlserver" ? "NVARCHAR(MAX)" : adapter.driver === "mysql" ? "CHAR" : adapter.driver === "trino" ? "VARCHAR" : "TEXT"})`;
    } else if (
      adapter.driver === "sqlserver" &&
      /^(n?text)$/i.test(column.type)
    )
      name = `CAST(${name} AS NVARCHAR(MAX))`;
    if (!filters.caseSensitive) return `LOWER(${name})`;
    if (adapter.driver === "sqlite") return `${name} COLLATE BINARY`;
    if (adapter.driver === "mysql") return `CAST(${name} AS BINARY)`;
    if (adapter.driver === "sqlserver")
      return `${name} COLLATE Latin1_General_100_BIN2`;
    if (adapter.driver === "oracle") return `${name} COLLATE BINARY`;
    return name;
  };
  const like = (name: string, raw: string, operator: FilterOperator) => {
    const leading = ["contains", "notContains", "ends"].includes(operator),
      trailing = ["contains", "notContains", "starts"].includes(operator);
    if (adapter.driver === "sqlite" && filters.caseSensitive) {
      const pattern = `${leading ? "*" : ""}${raw.replace(/[?*[\]]/g, (char) => ({ "?": "[?]", "*": "[*]", "[": "[[]", "]": "[]]" })[char]!)}${trailing ? "*" : ""}`;
      return `${name} ${operator === "notContains" ? "NOT GLOB" : "GLOB"} ${bind(pattern)}`;
    }
    const pattern = `${leading ? "%" : ""}${escapeLike(raw)}${trailing ? "%" : ""}`;
    return `${name} ${operator === "notContains" ? "NOT LIKE" : "LIKE"} ${bind(pattern)} ESCAPE '!'`;
  };
  const escapeLike = (value: string) => {
    const escaped = value.replace(/[!%_]/g, "!$&");
    return adapter.driver === "sqlserver"
      ? escaped.replace(/\[/g, "![")
      : escaped;
  };
  const conditions = filters.rules.map((rule) => {
    const column = columns.find((c) => c.name === rule.column);
    if (!column) throw new Error(`Unknown column: ${rule.column}`);
    if (!operatorsFor(column).includes(rule.operator))
      throw new Error(`Unsupported filter for ${column.name}.`);
    let name = q(column.name);
    const stringValue = (value: string) =>
      filters.caseSensitive ? value : value.toLowerCase();
    if (rule.operator === "null") return `${name} IS NULL`;
    if (rule.operator === "notNull") return `${name} IS NOT NULL`;
    if (rule.operator === "empty")
      return adapter.driver === "oracle"
        ? `${name} IS NULL`
        : `${name} = ${bind("")}`;
    if (rule.operator === "notEmpty")
      return adapter.driver === "oracle"
        ? `${name} IS NOT NULL`
        : `${name} <> ${bind("")}`;
    if (valueKind(column.type) === "text") name = textColumn(column);
    const value = (raw: string) =>
      parseCellValue(
        valueKind(column.type) === "text" ? stringValue(raw) : raw,
        column,
      );
    if (["contains", "notContains", "starts", "ends"].includes(rule.operator)) {
      return like(name, stringValue(rule.value), rule.operator);
    }
    if (rule.operator === "between")
      return `${name} BETWEEN ${bind(value(rule.value), column)} AND ${bind(value(rule.second), column)}`;
    if (rule.operator === "in" || rule.operator === "notIn")
      return `${name} ${rule.operator === "notIn" ? "NOT IN" : "IN"} (${parseList(
        rule.value,
      )
        .map((v) => bind(value(v), column))
        .join(", ")})`;
    const op = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" }[
      rule.operator as "eq"
    ];
    if (!op) throw new Error("Invalid filter operator.");
    return `${name} ${op} ${bind(value(rule.value), column)}`;
  });
  const where: string[] = [];
  if (conditions.length)
    where.push(
      `(${conditions.join(filters.match === "all" ? " AND " : " OR ")})`,
    );
  if (filters.search) {
    const searchable = columns.filter(
      (c) =>
        valueKind(c.type) === "text" && operatorsFor(c).includes("contains"),
    );
    if (!searchable.length)
      throw new Error("This table has no text columns. Use a column filter.");
    const term = filters.caseSensitive
      ? filters.search
      : filters.search.toLowerCase();
    where.push(
      `(${searchable.map((c) => like(textColumn(c), term, "contains")).join(" OR ")})`,
    );
  }
  const from = `FROM ${q(table)}${where.length ? ` WHERE ${where.join(" AND ")}` : ""}`;
  const sort = [...sorting];
  for (const key of columns.filter((c) => c.primaryKey))
    if (!sort.some((s) => s.id === key.name))
      sort.push({ id: key.name, desc: false });
  if (!sort.length) {
    const column = columns.find(
      (c) =>
        valueKind(c.type) !== "json" && !/lob|binary|image|xml/i.test(c.type),
    );
    if (column) sort.push({ id: column.name, desc: false });
  }
  for (const entry of sort)
    if (!columns.some((c) => c.name === entry.id))
      throw new Error(`Unknown sort column: ${entry.id}`);
  const order = sort.length
    ? ` ORDER BY ${sort.map((s) => `${q(s.id)} ${s.desc ? "DESC" : "ASC"}`).join(", ")}`
    : adapter.driver === "sqlserver"
      ? " ORDER BY (SELECT NULL)"
      : "";
  const offset = page * pageSize;
  const limit = pageSize + 1;
  const pagination = ["oracle", "sqlserver"].includes(adapter.driver)
    ? ` OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`
    : adapter.driver === "trino"
      ? ` OFFSET ${offset} LIMIT ${limit}`
      : ` LIMIT ${limit} OFFSET ${offset}`;
  return {
    query: `SELECT * ${from}${order}${pagination}`,
    countQuery: `SELECT COUNT(*) AS total ${from}`,
    params,
  };
}

export function buildInsert(
  adapter: DatabaseAdapter,
  table: string,
  columns: ColumnInfo[],
  values: Record<string, unknown>,
) {
  const names = Object.keys(values);
  if (names.some((name) => !columns.some((c) => c.name === name)))
    throw new Error("Unknown column.");
  if (!names.length) {
    if (adapter.driver === "mysql")
      return {
        query: `INSERT INTO ${adapter.quoteIdentifier(table)} () VALUES ()`,
        params: [],
      };
    if (["oracle", "trino"].includes(adapter.driver))
      throw new Error("Enter at least one column value.");
    return {
      query: `INSERT INTO ${adapter.quoteIdentifier(table)} DEFAULT VALUES`,
      params: [],
    };
  }
  return {
    query: `INSERT INTO ${adapter.quoteIdentifier(table)} (${names.map((n) => adapter.quoteIdentifier(n)).join(", ")}) VALUES (${names
      .map((name, i) =>
        parameterPlaceholder(
          adapter.driver,
          i + 1,
          columns.find((column) => column.name === name),
        ),
      )
      .join(", ")})`,
    params: names.map((n) => values[n]),
  };
}
