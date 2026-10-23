import { useQuery } from "@tanstack/react-query";
import { getAdapter, getDefaultSchema } from "./adapters";
import type { Connection } from "../types";

export interface SchemaScope {
  // The schema the view lists and qualifies tables in.
  schema?: string;
  // The schema unqualified names resolve in without a pick.
  defaultSchema?: string;
  // A pick that differs from the default: part of paths and preference scopes.
  selected?: string;
  // The pick as the session default for SQL typed in the editor, where the
  // driver supports that (SQL Server only qualifies generated SQL).
  session?: string;
  // Whether the default schema is still loading.
  pending: boolean;
}

// The schema scope of a database view, given the schema picked in the route.
export function useSchemaScope(
  connection: Connection,
  database: string | undefined,
  picked: string | undefined,
): SchemaScope {
  const adapter = getAdapter(connection.sql!.driver);
  const hasSchemas = !!adapter.listSchemasQuery && database !== undefined;
  const defaults = useQuery({
    queryKey: ["default-schema", connection.id, database],
    queryFn: () => getDefaultSchema(connection.id, connection.sql!.driver, database),
    enabled: hasSchemas,
    staleTime: Infinity,
  });
  if (!hasSchemas) return { pending: false };
  const defaultSchema = defaults.data ?? undefined;
  const selected = picked && picked !== defaultSchema ? picked : undefined;
  return {
    schema: picked ?? defaultSchema,
    defaultSchema,
    selected,
    session: adapter.sessionSchema ? selected : undefined,
    pending: !picked && defaults.isPending,
  };
}
