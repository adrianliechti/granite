import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import {
  Plus,
  Database,
  Table2,
  ChevronRight,
  ChevronDown,
  Star,
  Code2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import {
  listDatabases,
  listTables,
  createDatabase,
  supportsCreateDatabase,
  getAdapter,
} from "../lib/adapters";
import type { Connection } from "../types";
import { Dialog } from "./Dialog";
import { RowMenu } from "./RowMenu";
import { createTableTemplate } from "../lib/adapters/templates";

interface DatabaseBrowserProps {
  connection: Connection;
  expanded: Set<string>;
  onToggle: (key: string) => void;
  onSelectDatabase: (database: string) => void;
  onSelectTable: (database: string, table: string) => void;
  onOpenQuery: (database: string, sql: string, title: string) => void;
  favorites: string[];
  onFavorite: (path: string) => void;
}
function Tables({
  connection,
  database,
  activeTable,
  favorites,
  onFavorite,
  onSelect,
  onOpenQuery,
}: {
  connection: Connection;
  database: string;
  activeTable?: string;
  favorites: string[];
  onFavorite: (path: string) => void;
  onSelect: (table: string) => void;
  onOpenQuery: DatabaseBrowserProps["onOpenQuery"];
}) {
  const tables = useQuery({
    queryKey: ["tables", connection.id, database],
    queryFn: () => listTables(connection.id, connection.sql!.driver, database),
  });
  const names = tables.data ?? [];
  const adapter = getAdapter(connection.sql!.driver);
  return (
    <div className="tree-children">
      {names.map((table) => {
        const path = `/${connection.id}/${encodeURIComponent(database)}/${encodeURIComponent(table)}`;
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
                  onOpenQuery(database, adapter.selectAllQuery(table), table),
              },
              {
                label: "Create table…",
                icon: <Plus size={14} />,
                onSelect: () =>
                  onOpenQuery(
                    database,
                    createTableTemplate(adapter, names),
                    "Create table",
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
                    `DROP TABLE ${adapter.quoteIdentifier(table)};`,
                    `Delete ${table}`,
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
              className={`tree-row ${active && !params.table ? "active" : ""}`}
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
                      createTableTemplate(
                        getAdapter(connection.sql!.driver),
                        queryClient.getQueryData<string[]>([
                          "tables",
                          connection.id,
                          database,
                        ]),
                      ),
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
              <Tables
                connection={connection}
                database={database}
                activeTable={active ? params.table : undefined}
                favorites={favorites}
                onFavorite={onFavorite}
                onSelect={(table) => onSelectTable(database, table)}
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
