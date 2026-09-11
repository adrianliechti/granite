import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  ChevronRight,
  Code2,
  History,
  Plus,
  Sparkles,
  Table2,
  X,
  RefreshCw,
} from "lucide-react";
import { DataView } from "./DataView";
import { ResultsTable } from "./ResultsTable";
import type { SchemaInfo } from "./QueryEditor";
import {
  executeBatch,
  executeQuery,
  executeSQL,
  executeStatement,
  getAdapter,
  getTableViewQuery,
  listColumns,
  listTables,
  type ColumnInfo,
  type TableView,
} from "../lib/adapters";
import { splitStatements } from "../lib/sql";
import type { QueryDraft } from "../lib/queries";
import { usePreference } from "../lib/preferences";
import { getConfig } from "../config";
import type { Connection, SQLResponse } from "../types";

const ChatPanel = lazy(() =>
  import("./ChatPanel").then((module) => ({ default: module.ChatPanel })),
);
const QueryEditor = lazy(() =>
  import("./QueryEditor").then((module) => ({ default: module.QueryEditor })),
);
interface HistoryEntry {
  id: string;
  sql: string;
  time: string;
  duration: number;
  error?: string;
}
interface RunResult {
  responses: SQLResponse[];
  statements: string[];
  duration: number;
  selected: number;
}
const viewLabels: Partial<Record<TableView, string>> = {
  columns: "Columns",
  constraints: "Constraints",
  foreignKeys: "Foreign keys",
  indexes: "Indexes",
};
function StructureView({
  connection,
  database,
  table,
  onOpenSQL,
}: {
  connection: Connection;
  database?: string;
  table: string;
  onOpenSQL: (sql: string) => void;
}) {
  const [view, setView] = useState<TableView>("columns");
  const driver = connection.sql!.driver,
    query = getTableViewQuery(driver, table, view);
  const result = useQuery({
    queryKey: ["structure", connection.id, database, table, view],
    queryFn: () => executeQuery(connection.id, query!, database),
    enabled: !!query,
  });
  return (
    <div className="panel flex-1 min-h-0 flex flex-col">
      <div className="toolbar">
        {getAdapter(driver)
          .supportedTableViews()
          .filter((v) => v !== "records")
          .map((v) => (
            <button
              key={v}
              className={`text-button ${v === view ? "active" : ""}`}
              aria-pressed={v === view}
              onClick={() => setView(v)}
            >
              {viewLabels[v]}
            </button>
          ))}
        <button
          className="icon-button ml-auto"
          aria-label="Refresh structure"
          onClick={() => void result.refetch()}
        >
          <RefreshCw size={14} />
        </button>
        <button
          className="icon-button"
          aria-label="Open structure SQL"
          disabled={!query}
          onClick={() => onOpenSQL(query!)}
        >
          <Code2 size={15} />
        </button>
      </div>
      <ResultsTable
        key={view}
        response={
          result.error ? { error: result.error.message } : (result.data ?? null)
        }
        isLoading={result.isFetching}
        preferenceKey={`structure:${driver}:${view}`}
      />
    </div>
  );
}
export function DatabaseWorkspace({
  connection,
  database,
  table,
  requestedQuery,
  onQueryOpened,
}: {
  connection: Connection;
  database?: string;
  table?: string;
  requestedQuery?: QueryDraft;
  onQueryOpened: (id: string) => void;
}) {
  const driver = connection.sql!.driver,
    scope = `${connection.id}:${database ?? ""}`,
    navigate = useNavigate(),
    queryClient = useQueryClient();
  const [tabs, setTabs] = usePreference<QueryDraft[]>(
    `query-tabs:v1:${scope}`,
    [{ id: crypto.randomUUID(), title: "Query 1", sql: "" }],
  );
  const [activeId, setActiveId] = usePreference(
    `active-query:${scope}`,
    tabs[0]?.id ?? "",
  );
  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0];
  const [history, setHistory] = usePreference<HistoryEntry[]>(
    `query-history:${scope}`,
    [],
  );
  const [maxRows, setMaxRows] = usePreference("query-result-limit", 1000);
  const [mode, setMode] = useState<"data" | "structure" | "sql">(
    table ? "data" : "sql",
  );
  const [sqlMounted, setSqlMounted] = useState(!table),
    [historyOpen, setHistoryOpen] = useState(false);
  const [previousTable, setPreviousTable] = useState(table);
  if (table !== previousTable) {
    setPreviousTable(table);
    setMode(table ? "data" : "sql");
    if (!table) setSqlMounted(true);
  }
  const [acceptedQuery, setAcceptedQuery] = useState<string | null>(null);
  if (requestedQuery && requestedQuery.id !== acceptedQuery) {
    const { id, title, sql } = requestedQuery;
    setAcceptedQuery(id);
    setTabs((current) =>
      current.some((tab) => tab.id === id)
        ? current
        : [...current, { id, title, sql }],
    );
    setActiveId(id);
    setSqlMounted(true);
    setMode("sql");
  }
  useEffect(() => {
    if (acceptedQuery) onQueryOpened(acceptedQuery);
  }, [acceptedQuery, onQueryOpened]);
  const [results, setResults] = useState<Record<string, RunResult>>({}),
    [runningId, setRunningId] = useState<string | null>(null);
  const [columns, setColumns] = useState<Record<string, ColumnInfo[]>>({}),
    [aiOpen, setAiOpen] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const tables = useQuery({
    queryKey: ["tables", connection.id, database],
    queryFn: () => listTables(connection.id, driver, database),
  });
  const schema: SchemaInfo = { tables: tables.data ?? [], columns };
  const result = activeTab ? results[activeTab.id] : undefined;
  const response = result?.responses[result.selected] ?? null;
  const showSQL = () => {
    setSqlMounted(true);
    setMode("sql");
  };
  const updateTab = (patch: Partial<QueryDraft>) => {
    if (activeTab)
      setTabs((current) =>
        current.map((t) => (t.id === activeTab.id ? { ...t, ...patch } : t)),
      );
  };
  const newTab = (sql = "", title?: string) => {
    const tab = {
      id: crypto.randomUUID(),
      title: title ?? `Query ${tabs.length + 1}`,
      sql,
    };
    setTabs((current) => [...current, tab]);
    setActiveId(tab.id);
    showSQL();
  };
  const closeTab = (tab: QueryDraft) => {
    if (tab.id === runningId) return;
    // Closed drafts are recoverable from history, including drafts never executed.
    if (tab.sql.trim())
      setHistory((current) =>
        [
          {
            id: crypto.randomUUID(),
            sql: tab.sql,
            time: new Date().toISOString(),
            duration: 0,
          },
          ...current.filter((h) => h.sql !== tab.sql),
        ].slice(0, 100),
      );
    const remaining = tabs.filter((t) => t.id !== tab.id);
    if (!remaining.length)
      remaining.push({ id: crypto.randomUUID(), title: "Query 1", sql: "" });
    setTabs(remaining);
    if (tab.id === activeTab?.id) setActiveId(remaining[0].id);
    setResults((current) => {
      const next = { ...current };
      delete next[tab.id];
      return next;
    });
  };
  const loadColumns = async (name: string) => {
    const result = await queryClient.fetchQuery({
      queryKey: ["table-columns", connection.id, database, name],
      queryFn: () => listColumns(connection.id, driver, name, database),
      staleTime: 300_000,
    });
    setColumns((current) => ({ ...current, [name]: result }));
    return result;
  };
  const run = async (sql: string): Promise<SQLResponse> => {
    if (!activeTab || controller.current)
      return { error: "A query is already running." };
    const statements = splitStatements(sql, driver).map((s) => s.sql);
    if (!statements.length) return { error: "Enter SQL to run." };
    const id = activeTab.id,
      start = performance.now(),
      abort = new AbortController();
    controller.current = abort;
    setRunningId(id);
    showSQL();
    let responses: SQLResponse[];
    try {
      responses =
        statements.length === 1
          ? [
              await executeSQL(
                connection.id,
                statements[0],
                database,
                abort.signal,
                maxRows,
                driver,
              ),
            ]
          : await executeBatch(
              connection.id,
              statements,
              database,
              abort.signal,
              maxRows,
              driver,
            );
    } catch (err) {
      responses = [
        {
          error: abort.signal.aborted
            ? "Query cancelled. Completed changes may already have been applied."
            : err instanceof Error
              ? err.message
              : "Query failed",
        },
      ];
    }
    const duration = performance.now() - start;
    const last = responses.at(-1)!;
    setResults((current) => ({
      ...current,
      [id]: { responses, statements, duration, selected: responses.length - 1 },
    }));
    setHistory((current) =>
      [
        {
          id: crypto.randomUUID(),
          sql,
          time: new Date().toISOString(),
          duration,
          error: last.error,
        },
        ...current.filter((h) => h.sql !== sql),
      ].slice(0, 100),
    );
    controller.current = null;
    setRunningId(null);
    void queryClient.invalidateQueries({
      queryKey: ["records", connection.id, database],
    });
    void queryClient.invalidateQueries({
      queryKey: ["tables", connection.id],
    });
    void queryClient.invalidateQueries({
      queryKey: ["table-columns", connection.id, database],
    });
    setColumns({});
    return last;
  };
  return (
    <>
      <main className="workspace database-workspace panel min-w-0 flex-1 flex flex-col">
        <header className="database-header">
          <nav aria-label="Breadcrumb" className="breadcrumbs">
            <button onClick={() => navigate({ to: `/${connection.id}` })}>
              {connection.name}
            </button>
            {database && (
              <>
                <ChevronRight size={12} />
                <button
                  onClick={() =>
                    navigate({
                      to: `/${connection.id}/${encodeURIComponent(database)}`,
                    })
                  }
                >
                  {database}
                </button>
              </>
            )}
            {table && (
              <>
                <ChevronRight size={12} />
                <span title={table}>{table}</span>
              </>
            )}
          </nav>
          <nav className="view-tabs" aria-label="Workspace views">
            {table && (
              <>
                <button
                  aria-pressed={mode === "data"}
                  className={mode === "data" ? "active" : ""}
                  onClick={() => setMode("data")}
                >
                  <Table2 size={14} />
                  Data
                </button>
                <button
                  aria-pressed={mode === "structure"}
                  className={mode === "structure" ? "active" : ""}
                  onClick={() => setMode("structure")}
                >
                  Structure
                </button>
              </>
            )}
            <button
              aria-pressed={mode === "sql"}
              className={mode === "sql" ? "active" : ""}
              onClick={showSQL}
            >
              <Code2 size={14} />
              SQL{runningId && <span className="count">Running</span>}
            </button>
          </nav>
          <span className="database-driver muted text-xs">{driver}</span>
          {getConfig().ai?.model && (
            <button
              className={`icon-button ${aiOpen ? "active" : ""}`}
              aria-label="Toggle AI assistant"
              aria-expanded={aiOpen}
              onClick={() => setAiOpen(!aiOpen)}
            >
              <Sparkles size={15} />
            </button>
          )}
        </header>
        {mode === "data" && table && (
          <DataView
            key={table}
            connection={connection}
            database={database}
            table={table}
            onOpenSQL={(sql) => newTab(sql, table)}
          />
        )}
        {mode === "structure" && table && (
          <StructureView
            key={table}
            connection={connection}
            database={database}
            table={table}
            onOpenSQL={(sql) => newTab(sql, `${table} structure`)}
          />
        )}
        {sqlMounted && (
          <div
            className={`panel flex-1 min-h-0 flex-col ${mode === "sql" ? "flex" : "hidden"}`}
          >
            <div className="query-tabs">
              <div
                className="flex flex-1 min-w-0 overflow-auto"
                role="tablist"
                aria-label="Queries"
              >
                {tabs.map((tab) => (
                  <div
                    key={tab.id}
                    className={`query-tab ${tab.id === activeTab?.id ? "active" : ""}`}
                  >
                    <button
                      role="tab"
                      id={`query-tab-${tab.id}`}
                      tabIndex={tab.id === activeTab?.id ? 0 : -1}
                      onKeyDown={(e) => {
                        if (
                          ["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                            e.key,
                          )
                        ) {
                          e.preventDefault();
                          const index = tabs.findIndex((t) => t.id === tab.id);
                          const next =
                            e.key === "Home"
                              ? 0
                              : e.key === "End"
                                ? tabs.length - 1
                                : (index +
                                    (e.key === "ArrowRight" ? 1 : -1) +
                                    tabs.length) %
                                  tabs.length;
                          setActiveId(tabs[next].id);
                          document
                            .getElementById(`query-tab-${tabs[next].id}`)
                            ?.focus();
                        }
                      }}
                      aria-selected={tab.id === activeTab?.id}
                      aria-controls="query-workspace"
                      title={
                        tab.sql || "Query draft · autosaved in this browser"
                      }
                      onClick={() => setActiveId(tab.id)}
                    >
                      {tab.title || "Untitled"}
                      {runningId === tab.id ? " · running" : ""}
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Close ${tab.title}`}
                      disabled={runningId === tab.id}
                      onClick={() => closeTab(tab)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                className="icon-button"
                aria-label="New query"
                title="New query"
                onClick={() => newTab()}
              >
                <Plus size={15} />
              </button>
              <button
                className={`icon-button ${historyOpen ? "active" : ""}`}
                aria-label="Query history"
                title="Query history"
                aria-expanded={historyOpen}
                aria-controls="query-history"
                onClick={() => setHistoryOpen(!historyOpen)}
              >
                <History size={15} />
              </button>
            </div>
            {historyOpen && (
              <section
                id="query-history"
                className="query-history"
                aria-label="Query history"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="muted text-xs">
                    Recent queries and closed drafts
                  </span>
                  <button
                    className="text-button"
                    onClick={() => setHistory([])}
                    disabled={!history.length}
                  >
                    Clear history
                  </button>
                </div>
                {history.map((entry) => (
                  <button
                    key={entry.id}
                    className="history-entry"
                    onClick={() => {
                      newTab(entry.sql);
                      setHistoryOpen(false);
                    }}
                  >
                    <span className="truncate font-mono">{entry.sql}</span>
                    <span className="muted text-xs shrink-0">
                      {entry.error ? "Failed · " : ""}
                      {new Date(entry.time).toLocaleString()}
                    </span>
                  </button>
                ))}
                {!history.length && (
                  <p className="muted text-xs py-2">
                    Executed queries and closed drafts will appear here.
                  </p>
                )}
              </section>
            )}
            <div
              id="query-workspace"
              role="tabpanel"
              aria-labelledby={`query-tab-${activeTab?.id}`}
              className="flex flex-1 min-h-0 flex-col"
            >
              {activeTab && (
                <Suspense
                  fallback={<div className="empty-state">Loading editor…</div>}
                >
                  <QueryEditor
                    driver={driver}
                    path={`granite://query/${encodeURIComponent(scope)}/${activeTab.id}.sql`}
                    value={activeTab.sql}
                    onChange={(sql) => updateTab({ sql })}
                    onExecute={(sql) => {
                      void run(sql);
                    }}
                    onCancel={() => controller.current?.abort()}
                    isLoading={!!runningId}
                    schema={schema}
                    loadColumns={loadColumns}
                    maxRows={maxRows}
                    onMaxRowsChange={setMaxRows}
                    error={response?.error}
                  />
                </Suspense>
              )}
              {result && result.statements.length > 1 && (
                <div className="toolbar overflow-auto">
                  {result.responses.map((r, index) => (
                    <button
                      key={index}
                      className={`text-button whitespace-nowrap ${result.selected === index ? "active" : ""}`}
                      title={result.statements[index]}
                      onClick={() =>
                        setResults((current) => ({
                          ...current,
                          [activeTab.id]: { ...result, selected: index },
                        }))
                      }
                    >
                      Result {index + 1}
                      {r.error ? " · failed" : ""}
                    </button>
                  ))}
                  {result.responses.length < result.statements.length && (
                    <span className="muted text-xs whitespace-nowrap">
                      Stopped ·{" "}
                      {result.statements.length - result.responses.length} not
                      run
                    </span>
                  )}
                </div>
              )}
              <ResultsTable
                key={activeTab?.id}
                response={response}
                duration={result?.duration}
                isLoading={runningId === activeTab?.id}
                preferenceKey={`query:${scope}`}
              />
            </div>
          </div>
        )}
      </main>
      {aiOpen && getConfig().ai?.model && (
        <Suspense
          fallback={
            <div className="ai-panel p-4 muted">Loading assistant…</div>
          }
        >
          <ChatPanel
            isOpen
            onClose={() => setAiOpen(false)}
            connection={connection}
            database={database ?? null}
            table={table ?? null}
            currentQuery={activeTab?.sql ?? ""}
            queryResult={response}
            schema={schema}
            setters={{
              setQuery: (sql) => {
                updateTab({ sql });
                showSQL();
              },
              executeQuery: run,
              runQuerySilent: (sql) =>
                executeQuery(connection.id, sql, database),
              runStatementSilent: (sql) =>
                executeStatement(connection.id, sql, database),
            }}
          />
        </Suspense>
      )}
    </>
  );
}
