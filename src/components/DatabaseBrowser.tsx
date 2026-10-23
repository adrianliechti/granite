import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import {
  Plus,
  Database,
  Table2,
  ChevronRight,
  ChevronDown,
  Folder,
  Star,
  Code2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import {
  listDatabases,
  listSchemas,
  listTables,
  createDatabase,
  getDefaultSchema,
  supportsCreateDatabase,
  getAdapter,
  tableIdentifier,
} from "../lib/adapters";
import type { Connection } from "../types";
import { Dialog } from "./Dialog";
import { RowMenu } from "./RowMenu";
import { createTableTemplate } from "../lib/adapters/templates";
import { databasePath } from "../lib/database";

// Schemas passed to these callbacks are explicit picks: undefined stands for the
// connection's default schema, which keeps the plain database paths.
interface DatabaseBrowserProps {
  connection: Connection;
  expanded: Set<string>;
  onToggle: (key: string) => void;
  onSelectDatabase: (database: string, schema?: string) => void;
  onSelectTable: (database: string, table: string, schema?: string) => void;
  onOpenQuery: (database: string, sql: string, title: string, schema?: string) => void;
  favorites: string[];
  onFavorite: (path: string) => void;
}
function Tables({
  connection,
  database,
  schemaName,
  pathSchema,
  activeTable,
  favorites,
  onFavorite,
  onSelect,
  onOpenQuery,
}: {
  connection: Connection;
  database: string;
  // The schema to list and qualify tables in, and its explicit pick (if any).
  schemaName?: string;
  pathSchema?: string;
  activeTable?: string;
  favorites: string[];
  onFavorite: (path: string) => void;
  onSelect: (table: string) => void;
  onOpenQuery: DatabaseBrowserProps["onOpenQuery"];
}) {
  const tables = useQuery({
    queryKey: ["tables", connection.id, database, schemaName],
    queryFn: () => listTables(connection.id, connection.sql!.driver, database, schemaName),
  });
  const names = tables.data ?? [];
  const adapter = getAdapter(connection.sql!.driver);
  return (
    <div className="tree-children">
      {names.map((table) => {
        const path = databasePath(connection.id, database, table, pathSchema);
        return (
          <RowMenu
            key={table}
            label={`Actions for table ${table}`}
            className={`tree-row ${activeTable === table ? "active" : ""}`}
            items={[
              {
                label: "Open in SQL editor",
                icon: <Code2 size={14} />,
                onSelect: () =>
                  onOpenQuery(
                    database,
                    adapter.selectAllQuery(table, undefined, schemaName),
                    table,
                    pathSchema,
                  ),
              },
              {
                label: "Create table…",
                icon: <Plus size={14} />,
                onSelect: () =>
                  onOpenQuery(
                    database,
                    createTableTemplate(adapter, names, schemaName),
                    "Create table",
                    pathSchema,
                  ),
              },
              {
                label: favorites.includes(path)
                  ? "Remove from favorites"
                  : "Add to favorites",
                icon: <Star size={14} />,
                onSelect: () => onFavorite(path),
              },
              null,
              {
                label: "Delete table…",
                icon: <Trash2 size={14} />,
                danger: true,
                onSelect: () =>
                  onOpenQuery(
                    database,
                    `DROP TABLE ${tableIdentifier(adapter, table, schemaName)};`,
                    `Delete ${table}`,
                    pathSchema,
                  ),
              },
            ]}
          >
            <button
              className="tree-label"
              aria-current={activeTable === table ? "page" : undefined}
              onClick={() => onSelect(table)}
              title={table}
            >
              {favorites.includes(path) ? (
                <Star size={13} fill="currentColor" />
              ) : (
                <Table2 size={13} />
              )}
              <span>{table}</span>
            </button>
          </RowMenu>
        );
      })}
      {tables.error ? (
        <p className="tree-message danger" role="alert">
          {tables.error.message}
        </p>
      ) : (
        !names.length && (
          <p className="tree-message">
            {tables.isPending ? "Loading tables…" : "No tables"}
          </p>
        )
      )}
    </div>
  );
}
// A database's schemas as tree nodes. Tables sit directly
// under the database when the driver has no schema level or there is only one.
function Schemas({
  connection,
  database,
  active,
  activeSchema,
  activeTable,
  expanded,
  onToggle,
  favorites,
  onFavorite,
  onSelectDatabase,
  onSelectTable,
  onOpenQuery,
}: Omit<DatabaseBrowserProps, "connection" | "onSelectDatabase" | "onSelectTable"> & {
  connection: Connection;
  database: string;
  active: boolean;
  activeSchema?: string;
  activeTable?: string;
  onSelectDatabase: (schema?: string) => void;
  onSelectTable: (table: string, schema?: string) => void;
}) {
  const driver = connection.sql!.driver,
    adapter = getAdapter(driver),
    hasSchemas = !!adapter.listSchemasQuery,
    queryClient = useQueryClient();
  const schemas = useQuery({
    queryKey: ["schemas", connection.id, database],
    queryFn: () => listSchemas(connection.id, driver, database),
    enabled: hasSchemas,
  });
  const defaults = useQuery({
    queryKey: ["default-schema", connection.id, database],
    queryFn: () => getDefaultSchema(connection.id, driver, database),
    enabled: hasSchemas,
    staleTime: Infinity,
  });
  const tables = (schemaName?: string, pathSchema?: string, current = active) => (
    <Tables
      connection={connection}
      database={database}
      schemaName={schemaName}
      pathSchema={pathSchema}
      activeTable={current ? activeTable : undefined}
      favorites={favorites}
      onFavorite={onFavorite}
      onSelect={(table) => onSelectTable(table, pathSchema)}
      onOpenQuery={onOpenQuery}
    />
  );
  if (!hasSchemas) return tables();
  if (schemas.error || defaults.error)
    return (
      <div className="tree-children">
        <p className="tree-message danger" role="alert">
          {(schemas.error ?? defaults.error)!.message}
        </p>
      </div>
    );
  if (schemas.isPending || defaults.isPending)
    return (
      <div className="tree-children">
        <p className="tree-message">Loading schemas…</p>
      </div>
    );
  const names = schemas.data,
    defaultSchema = defaults.data ?? undefined,
    current = activeSchema ?? defaultSchema;
  if (names.length <= 1) {
    const only = names[0] ?? defaultSchema;
    return tables(only, only === defaultSchema ? undefined : only);
  }
  return (
    <div className="tree-children">
      {names.map((schema) => {
        const isDefault = schema === defaultSchema,
          pathSchema = isDefault ? undefined : schema,
          key = `${connection.id}:${database}:schema:${schema}`,
          selected = active && schema === current,
          // The default and the current schema start open; a toggle flips that.
          open = expanded.has(key) !== (isDefault || selected);
        return (
          <div key={schema}>
            <RowMenu
              label={`Actions for schema ${schema}`}
              className={`tree-row ${selected && !activeTable ? "active" : ""}`}
              items={[
                {
                  label: "New query",
                  icon: <Code2 size={14} />,
                  onSelect: () => onOpenQuery(database, "", "New query", pathSchema),
                },
                {
                  label: "Create table…",
                  icon: <Plus size={14} />,
                  onSelect: () =>
                    onOpenQuery(
                      database,
                      createTableTemplate(
                        adapter,
                        queryClient.getQueryData<string[]>(["tables", connection.id, database, schema]),
                        schema,
                      ),
                      "Create table",
                      pathSchema,
                    ),
                },
                null,
                {
                  label: "Refresh tables",
                  icon: <RefreshCw size={14} />,
                  onSelect: () => {
                    void queryClient.invalidateQueries({
                      queryKey: ["tables", connection.id, database, schema],
                    });
                  },
                },
              ]}
            >
              <button
                className="tree-toggle"
                aria-label={`${open ? "Collapse" : "Expand"} ${schema}`}
                aria-expanded={open}
                onClick={() => onToggle(key)}
              >
                {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
              <button
                className="tree-label"
                aria-current={selected && !activeTable ? "page" : undefined}
                onClick={() => onSelectDatabase(pathSchema)}
                title={isDefault ? `${schema} (default schema)` : schema}
              >
                <Folder size={13} />
                <span>{schema}</span>
              </button>
            </RowMenu>
            {open && tables(schema, pathSchema, selected)}
          </div>
        );
      })}
    </div>
  );
}

export function DatabaseBrowser({
  connection,
  expanded,
  onToggle,
  onSelectDatabase,
  onSelectTable,
  onOpenQuery,
  favorites,
  onFavorite,
}: DatabaseBrowserProps) {
  const params = useParams({ strict: false }),
    queryClient = useQueryClient();
  const activeDatabase =
    params.connectionId === connection.id ? params.database : undefined;
  const databases = useQuery({
    queryKey: ["databases", connection.id],
    queryFn: () => listDatabases(connection.id, connection.sql!.driver),
  });
  const [creating, setCreating] = useState(false),
    [name, setName] = useState(""),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const create = async () => {
    setPending(true);
    setError("");
    try {
      await createDatabase(connection.id, connection.sql!.driver, name.trim());
      await queryClient.invalidateQueries({
        queryKey: ["databases", connection.id],
      });
      setCreating(false);
      setName("");
      onSelectDatabase(name.trim());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create database",
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <>
      {creating && (
        <Dialog
          title="Create database"
          onClose={() => setCreating(false)}
          busy={pending}
        >
          <form
            className="p-4 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <label className="form-field">
              Database name
              <input
                className="field"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                required
                disabled={pending}
              />
            </label>
            {error && (
              <p className="error-banner" role="alert">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="text-button"
                onClick={() => setCreating(false)}
                disabled={pending}
              >
                Cancel
              </button>
              <button className="button" disabled={pending || !name.trim()}>
                {pending ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {databases.data?.map((database) => {
        const open = expanded.has(`${connection.id}:${database}`),
          active = database === activeDatabase;
        return (
          <div key={database}>
            <RowMenu
              label={`Actions for database ${database}`}
              className={`tree-row ${active && !params.table && !params.schema ? "active" : ""}`}
              items={[
                {
                  label: "New query",
                  icon: <Code2 size={14} />,
                  onSelect: () => onOpenQuery(database, "", "New query"),
                },
                {
                  label: "Create table…",
                  icon: <Plus size={14} />,
                  onSelect: () =>
                    onOpenQuery(
                      database,
                      createTableTemplate(getAdapter(connection.sql!.driver)),
                      "Create table",
                    ),
                },
                null,
                {
                  label: "Refresh tables",
                  icon: <RefreshCw size={14} />,
                  onSelect: () => {
                    void queryClient.invalidateQueries({
                      queryKey: ["tables", connection.id, database],
                    });
                  },
                },
              ]}
            >
              <button
                className="tree-toggle"
                aria-label={`${open ? "Collapse" : "Expand"} ${database}`}
                aria-expanded={open}
                onClick={() => onToggle(`${connection.id}:${database}`)}
              >
                {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
              <button
                className="tree-label"
                onClick={() => onSelectDatabase(database)}
                title={database}
              >
                <Database size={13} />
                <span>{database}</span>
              </button>
            </RowMenu>
            {open && (
              <Schemas
                connection={connection}
                database={database}
                active={active}
                activeSchema={active ? params.schema : undefined}
                activeTable={active ? params.table : undefined}
                expanded={expanded}
                onToggle={onToggle}
                favorites={favorites}
                onFavorite={onFavorite}
                onSelectDatabase={(schema) => onSelectDatabase(database, schema)}
                onSelectTable={(table, schema) => onSelectTable(database, table, schema)}
                onOpenQuery={onOpenQuery}
              />
            )}
          </div>
        );
      })}
      {databases.error ? (
        <p role="alert" className="tree-message danger">
          {databases.error.message}
        </p>
      ) : (
        !databases.data?.length && (
          <p className="tree-message">
            {databases.isPending ? "Loading databases…" : "No databases"}
          </p>
        )
      )}
      {supportsCreateDatabase(connection.sql!.driver) && (
        <button className="tree-label muted" onClick={() => setCreating(true)}>
          <Plus size={13} />
          <span>New database</span>
        </button>
      )}
    </>
  );
}
