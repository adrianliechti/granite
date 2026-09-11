import { useState } from "react";
import {
  Plus,
  Database,
  Package,
  ChevronRight,
  ChevronDown,
  Star,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Pencil,
  Trash2,
} from "lucide-react";
import { useParams, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useLiveQuery } from "@tanstack/react-db";
import {
  connectionsCollection,
  collectionsQueryClient,
} from "../lib/collections";
import { encodePathSegments } from "../lib/adapters";
import { usePreference } from "../lib/preferences";
import { ConnectionModal } from "./ConnectionModal";
import { CreateContainerModal } from "./CreateContainerModal";
import { DatabaseBrowser } from "./DatabaseBrowser";
import { ObjectStorageBrowser } from "./ObjectStorageBrowser";
import type { Connection } from "../types";
import type { OpenQuery } from "../lib/queries";
import { RowMenu } from "./RowMenu";

interface SidebarProps {
  showAddModal?: boolean;
  onAddModalClose?: () => void;
  collapsed: boolean;
  onCollapse: () => void;
  onOpenQuery: OpenQuery;
}
export function Sidebar({
  showAddModal = false,
  onAddModalClose,
  collapsed,
  onCollapse,
  onOpenQuery,
}: SidebarProps) {
  const params = useParams({ strict: false }),
    navigate = useNavigate(),
    queryClient = useQueryClient();
  const connections = useLiveQuery((q) =>
    q
      .from({ conn: connectionsCollection })
      .orderBy(({ conn }) => conn.createdAt, "desc"),
  );
  const [modal, setModal] = useState<{
    connection?: Connection;
    open: boolean;
  }>({ open: false });
  const [createContainerFor, setCreateContainerFor] =
    useState<Connection | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favorites, setFavorites] = usePreference<string[]>("favorites", []);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [deleteId, setDeleteId] = useState<string | null>(null),
    [deletePending, setDeletePending] = useState(false),
    [error, setError] = useState("");
  const routeKeys = [
    params.connectionId,
    params.database ? `${params.connectionId}:${params.database}` : undefined,
    params.container
      ? `container:${params.connectionId}:${params.container}`
      : undefined,
  ].filter((key): key is string => !!key);
  if (params.container && params["_splat"]) {
    let prefix = "";
    for (const segment of params["_splat"].split("/").filter(Boolean)) {
      prefix += `${segment}/`;
      routeKeys.push(
        `folder:${params.connectionId}:${params.container}:${prefix}`,
      );
    }
  }
  const routeKey = routeKeys.join("|");
  const [previousRoute, setPreviousRoute] = useState(routeKey);
  if (routeKey !== previousRoute) {
    setPreviousRoute(routeKey);
    setOverrides((current) => {
      const next = { ...current };
      for (const key of routeKeys) delete next[key];
      return next;
    });
  }
  const expanded = new Set(routeKeys);
  for (const [key, open] of Object.entries(overrides))
    if (open) expanded.add(key);
    else expanded.delete(key);
  const toggle = (key: string) =>
    setOverrides((current) => ({ ...current, [key]: !expanded.has(key) }));
  const favorite = (path: string) =>
    setFavorites((current) =>
      current.includes(path)
        ? current.filter((p) => p !== path)
        : [...current, path],
    );
  const go = (path: string) => {
    void navigate({ to: path });
    if (window.innerWidth < 720 && !collapsed) onCollapse();
  };
  const saveConnection = async (conn: Connection) => {
    if (modal.connection) connectionsCollection.utils.writeUpdate(conn);
    else {
      connectionsCollection.utils.writeInsert(conn);
      go(`/${conn.id}`);
    }
    void queryClient.invalidateQueries({
      predicate: (query) => query.queryKey[1] === conn.id,
    });
    return conn;
  };
  const remove = async (id: string) => {
    setDeletePending(true);
    setError("");
    try {
      await connectionsCollection.delete(id).isPersisted.promise;
      setFavorites((current) =>
        current.filter((p) => !p.startsWith(`/${id}/`)),
      );
      if (params.connectionId === id) go("/");
      setDeleteId(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not delete connection",
      );
    } finally {
      setDeletePending(false);
    }
  };
  return (
    <>
      {(modal.open || showAddModal) && (
        <ConnectionModal
          connection={modal.connection}
          onSave={saveConnection}
          onClose={() => {
            setModal({ open: false });
            onAddModalClose?.();
          }}
        />
      )}
      {createContainerFor && (
        <CreateContainerModal
          connection={createContainerFor}
          onClose={() => setCreateContainerFor(null)}
        />
      )}
      <aside
        className={`sidebar panel ${collapsed ? "collapsed" : ""}`}
        aria-label="Connections"
      >
        <div className="sidebar-header">
          {!collapsed && (
            <button className="font-semibold mr-auto" onClick={() => go("/")}>
              Granite
            </button>
          )}
          <button
            className="icon-button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title="⌘/Ctrl B"
            onClick={onCollapse}
          >
            {collapsed ? (
              <PanelLeftOpen size={16} />
            ) : (
              <PanelLeftClose size={16} />
            )}
          </button>
          <button
            className="icon-button"
            aria-label="Add connection"
            title="Add connection"
            onClick={() => setModal({ open: true })}
          >
            <Plus size={16} />
          </button>
        </div>
        {!collapsed && (
          <>
            <div className="flex items-center px-3 pb-2 gap-2">
              <button
                className={`text-button text-xs ${favoritesOnly ? "active" : ""}`}
                onClick={() => setFavoritesOnly(!favoritesOnly)}
                aria-pressed={favoritesOnly}
              >
                <Star size={12} />
                Favorites
              </button>
              <button
                className="icon-button ml-auto"
                aria-label="Refresh sidebar"
                onClick={() => {
                  void collectionsQueryClient.invalidateQueries();
                  void queryClient.invalidateQueries({
                    predicate: (query) =>
                      [
                        "databases",
                        "tables",
                        "table-columns",
                        "storage-tree",
                        "storage-containers",
                      ].includes(String(query.queryKey[0])),
                  });
                }}
              >
                <RefreshCw size={13} />
              </button>
            </div>
          </>
        )}
        <nav
          className="sidebar-tree"
          aria-label="Database and storage browser"
          onKeyDown={(e) => {
            if (
              e.target instanceof HTMLInputElement ||
              e.target instanceof HTMLSelectElement
            )
              return;
            if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
              const buttons = [
                ...e.currentTarget.querySelectorAll<HTMLButtonElement>(
                  "button",
                ),
              ].filter(
                (button) => !button.disabled && button.getClientRects().length,
              );
              const index = buttons.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              const next =
                e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? buttons.length - 1
                    : index + (e.key === "ArrowDown" ? 1 : -1);
              if (buttons[next]) {
                e.preventDefault();
                buttons[next].focus();
              }
            }
          }}
        >
          {favoritesOnly && !collapsed ? (
            <>
              {favorites.map((path) => {
                const parts = path.split("/");
                const conn = connections.data?.find((c) => c.id === parts[1]);
                return (
                  conn && (
                    <div className="tree-row" key={path}>
                      <button
                        className="tree-label"
                        onClick={() => go(path)}
                        title={`${conn.name} / ${decodeURIComponent(parts[2])}`}
                      >
                        <Star size={12} />
                        <span>
                          {decodeURIComponent(parts.at(-1) ?? "")}
                          <small className="block muted text-xs">
                            {conn.name} / {decodeURIComponent(parts[2])}
                          </small>
                        </span>
                      </button>
                      <button
                        className="icon-button quiet"
                        aria-label="Remove favorite"
                        onClick={() => favorite(path)}
                      >
                        <Star size={12} fill="currentColor" />
                      </button>
                    </div>
                  )
                );
              })}
              {!favorites.length && (
                <p className="tree-message">Star a table to keep it here.</p>
              )}
            </>
          ) : (
            (connections.data ?? []).map((conn) => {
              const open = expanded.has(conn.id),
                Icon = conn.sql ? Database : Package;
              if (collapsed)
                return (
                  <button
                    key={conn.id}
                    className={`rail-connection icon-button ${params.connectionId === conn.id ? "active" : ""}`}
                    aria-label={conn.name}
                    title={conn.name}
                    onClick={() => go(`/${conn.id}`)}
                  >
                    <Icon size={16} />
                  </button>
                );
              return (
                <div key={conn.id}>
                  <RowMenu
                    label={`Actions for ${conn.name}`}
                    className={`tree-row connection-row ${params.connectionId === conn.id && !params.database && !params.container ? "active" : ""}`}
                    items={[
                      {
                        label: "Edit connection",
                        icon: <Pencil size={14} />,
                        onSelect: () =>
                          setModal({ open: true, connection: conn }),
                      },
                      {
                        label: "Remove connection",
                        icon: <Trash2 size={14} />,
                        danger: true,
                        onSelect: () => {
                          setDeleteId(conn.id);
                          setError("");
                        },
                      },
                    ]}
                  >
                    <button
                      className="tree-toggle"
                      aria-label={`${open ? "Collapse" : "Expand"} ${conn.name}`}
                      aria-expanded={open}
                      onClick={() => toggle(conn.id)}
                    >
                      {open ? (
                        <ChevronDown size={12} />
                      ) : (
                        <ChevronRight size={12} />
                      )}
                    </button>
                    <button
                      className="tree-label"
                      title={`${conn.name} · ${conn.sql?.driver ?? (conn.amazonS3 ? "S3" : "Azure Blob")}`}
                      onClick={() => go(`/${conn.id}`)}
                    >
                      <Icon size={14} />
                      <span>{conn.name}</span>
                    </button>
                  </RowMenu>
                  {deleteId === conn.id && (
                    <div className="inline-confirm">
                      <span>Remove saved connection?</span>
                      <div className="flex gap-2">
                        <button
                          className="text-button danger"
                          disabled={deletePending}
                          onClick={() => void remove(conn.id)}
                        >
                          Remove
                        </button>
                        <button
                          className="text-button"
                          disabled={deletePending}
                          onClick={() => setDeleteId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                      {error && (
                        <p role="alert" className="danger">
                          {error}
                        </p>
                      )}
                    </div>
                  )}
                  {open && (
                    <div className="tree-children">
                      {conn.sql ? (
                        <DatabaseBrowser
                          connection={conn}
                          expanded={expanded}
                          onToggle={toggle}
                          onSelectDatabase={(db) =>
                            go(`/${conn.id}/${encodeURIComponent(db)}`)
                          }
                          onSelectTable={(db, tbl) =>
                            go(
                              `/${conn.id}/${encodeURIComponent(db)}/${encodeURIComponent(tbl)}`,
                            )
                          }
                          favorites={favorites}
                          onFavorite={favorite}
                          onOpenQuery={(database, sql, title) =>
                            onOpenQuery(conn.id, database, sql, title)
                          }
                        />
                      ) : (
                        <ObjectStorageBrowser
                          connection={conn}
                          expanded={expanded}
                          onToggle={toggle}
                          onSelectContainer={(container) =>
                            go(
                              `/${conn.id}/container/${encodeURIComponent(container)}`,
                            )
                          }
                          onSelectPath={(container, path) =>
                            go(
                              `/${conn.id}/container/${encodeURIComponent(container)}/${encodePathSegments(path.replace(/^\/+/, ""))}`,
                            )
                          }
                          onCreateContainer={() => setCreateContainerFor(conn)}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
          {!connections.data?.length && !collapsed && (
            <p className="tree-message">Add a connection to get started.</p>
          )}
        </nav>
      </aside>
    </>
  );
}
