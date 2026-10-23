// A schema appears in paths and preference scopes only when it was picked
// explicitly; the connection's default schema keeps the plain database paths,
// so links and preferences from before schemas were selectable keep working.
export function databasePath(
  connection: string,
  database?: string,
  table?: string,
  schema?: string,
): string {
  let path = `/${encodeURIComponent(connection)}`;
  if (database !== undefined) path += `/${encodeURIComponent(database)}`;
  if (schema) path += `/schema/${encodeURIComponent(schema)}`;
  if (table !== undefined) path += `/${encodeURIComponent(table)}`;
  return path;
}

export function databaseScope(
  connection: string,
  database?: string,
  schema?: string,
): string {
  const scope = `${connection}:${database ?? ""}`;
  return schema
    ? `schema:v1:${JSON.stringify([connection, database ?? "", schema])}`
    : scope;
}
