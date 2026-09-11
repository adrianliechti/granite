import type { ColumnInfo, DatabaseAdapter, Driver } from "./types";

export function parameterPlaceholder(
  driver: Driver,
  position: number,
  column?: ColumnInfo,
): string {
  switch (driver) {
    case "postgres":
      return `$${position}`;
    case "sqlserver":
      return `@p${position}`;
    case "oracle":
      // The official driver binds time.Time with a timezone. Strip that zone
      // for wall-clock columns, so comparisons preserve the entered date/time.
      if (/^date\b/i.test(column?.type ?? ""))
        return `CAST(:${position} AS DATE)`;
      if (
        /^timestamp/i.test(column?.type ?? "") &&
        !/time zone/i.test(column?.type ?? "")
      )
        return `CAST(:${position} AS TIMESTAMP(9))`;
      return `:${position}`;
    default:
      return "?";
  }
}

// Editing requires the entire primary key so a mutation identifies one row.
export function primaryKeyPredicate(
  adapter: DatabaseAdapter,
  columns: ColumnInfo[],
  row: Record<string, unknown>,
  firstParameter = 1,
) {
  const keys = columns.filter((column) => column.primaryKey);
  if (keys.length === 0 || keys.some((column) => row[column.name] == null))
    return null;

  return {
    clause: keys
      .map(
        (column, index) =>
          `${adapter.quoteIdentifier(column.name)} = ${parameterPlaceholder(adapter.driver, firstParameter + index, column)}`,
      )
      .join(" AND "),
    params: keys.map((column) => row[column.name]),
  };
}
