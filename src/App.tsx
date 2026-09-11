import { useCallback, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, useParams, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "@tanstack/react-db";
import { router } from "./router";
import { Sidebar } from "./components/Sidebar";
import { DatabaseWorkspace } from "./components/DatabaseWorkspace";
import {
  ObjectStorageView,
  StorageLanding,
} from "./components/ObjectStorageView";
import { WelcomePage } from "./components/WelcomePage";
import { connectionsCollection } from "./lib/collections";
import { encodePathSegments } from "./lib/adapters";
import { usePreference } from "./lib/preferences";
import type { OpenQuery, QueryRequest } from "./lib/queries";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
});
function AppContent() {
  const params = useParams({ strict: false }),
    navigate = useNavigate();
  const connections = useLiveQuery((q) =>
    q.from({ conn: connectionsCollection }),
  );
  const connection = connections.data?.find(
    (conn) => conn.id === params.connectionId,
  );
  const [addConnection, setAddConnection] = useState(false);
  const [queryRequest, setQueryRequest] = useState<QueryRequest | null>(null);
  const [sidebarWidth, setSidebarWidth] = usePreference("sidebar-width", 248);
  const [collapsed, setCollapsed] = usePreference(
    "sidebar-collapsed",
    window.innerWidth < 720,
  );
  const openQuery: OpenQuery = (connection, database, sql, title) => {
    setQueryRequest({
      id: crypto.randomUUID(),
      connection,
      database,
      sql,
      title,
    });
    void navigate({ to: `/${connection}/${encodeURIComponent(database)}` });
    if (window.innerWidth < 720) setCollapsed(true);
  };
  const queryOpened = useCallback((id: string) => {
    setQueryRequest((current) => (current?.id === id ? null : current));
  }, []);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        setCollapsed((current) => !current);
      }
      if (event.key === "Escape" && window.innerWidth < 720) setCollapsed(true);
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [setCollapsed]);
  useEffect(() => {
    const dismissMenus = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      document
        .querySelectorAll<HTMLDetailsElement>("details.inline-menu[open]")
        .forEach((menu) => {
          if (
            event instanceof KeyboardEvent ||
            !menu.contains(event.target as Node)
          )
            menu.open = false;
        });
    };
    document.addEventListener("pointerdown", dismissMenus);
    document.addEventListener("keydown", dismissMenus);
    return () => {
      document.removeEventListener("pointerdown", dismissMenus);
      document.removeEventListener("keydown", dismissMenus);
    };
  }, []);
  const storageNavigate = (container: string, path: string) => {
    if (!connection) return;
    const base = `/${connection.id}/container/${encodeURIComponent(container)}`;
    void navigate({
      to: path
        ? `${base}/${encodePathSegments(path.replace(/^\/+/, ""))}`
        : base,
    });
  };
  return (
    <div className="app-shell">
      <div
        className={`sidebar-wrap ${collapsed ? "is-collapsed" : ""}`}
        style={{
          width: collapsed ? 44 : Math.min(420, Math.max(190, sidebarWidth)),
        }}
      >
        <Sidebar
          showAddModal={addConnection}
          onAddModalClose={() => setAddConnection(false)}
          collapsed={collapsed}
          onCollapse={() => setCollapsed(!collapsed)}
          onOpenQuery={openQuery}
        />
        {!collapsed && (
          <div
            className="sidebar-resize"
            role="separator"
            aria-label="Sidebar width"
            aria-orientation="vertical"
            aria-valuenow={sidebarWidth}
            tabIndex={0}
            onKeyDown={(e) => {
              if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
                e.preventDefault();
                setSidebarWidth(
                  Math.max(
                    190,
                    Math.min(
                      420,
                      sidebarWidth + (e.key === "ArrowRight" ? 20 : -20),
                    ),
                  ),
                );
              }
            }}
            onPointerDown={(e) => {
              const target = e.currentTarget,
                start = e.clientX,
                initial = sidebarWidth;
              target.setPointerCapture(e.pointerId);
              const move = (event: PointerEvent) =>
                setSidebarWidth(
                  Math.max(190, Math.min(420, initial + event.clientX - start)),
                );
              const end = () => {
                target.removeEventListener("pointermove", move);
                target.removeEventListener("pointerup", end);
                target.removeEventListener("pointercancel", end);
              };
              target.addEventListener("pointermove", move);
              target.addEventListener("pointerup", end);
              target.addEventListener("pointercancel", end);
            }}
          />
        )}
      </div>
      {!collapsed && (
        <button
          className="sidebar-backdrop"
          aria-label="Close sidebar"
          onClick={() => setCollapsed(true)}
        />
      )}
      {connection?.sql ? (
        <DatabaseWorkspace
          key={`${connection.id}:${connection.sql.driver}:${params.database ?? ""}`}
          connection={connection}
          database={params.database}
          table={params.table}
          requestedQuery={
            queryRequest?.connection === connection.id &&
            queryRequest.database === params.database
              ? queryRequest
              : undefined
          }
          onQueryOpened={queryOpened}
        />
      ) : connection ? (
        params.container ? (
          <ObjectStorageView
            key={`${connection.id}:${params.container}:${params["_splat"] ?? ""}`}
            connection={connection}
            container={params.container}
            path={params["_splat"] ?? ""}
            onNavigate={storageNavigate}
          />
        ) : (
          <StorageLanding
            connection={connection}
            onNavigate={storageNavigate}
          />
        )
      ) : (
        <WelcomePage onAddConnection={() => setAddConnection(true)} />
      )}
    </div>
  );
}
function AppWithProviders() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}
router.options.defaultComponent = AppWithProviders;
export default function App() {
  return <RouterProvider router={router} />;
}
