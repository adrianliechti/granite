import { useState, useCallback, useMemo, useEffect } from 'react';
import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query';
import { RouterProvider, useParams, useNavigate } from '@tanstack/react-router';
import { router } from './router';
import { Sidebar } from './components/Sidebar';
import { QueryEditor, type SchemaInfo } from './components/QueryEditor';
import { ResultsTable } from './components/ResultsTable';
import { ChatPanel } from './components/ChatPanel';
import { ObjectStorageView } from './components/ObjectStorageView';
import { WelcomePage } from './components/WelcomePage';
import { useLiveQuery } from '@tanstack/react-db';
import { connectionsCollection } from './lib/collections';
import { listTables, listColumns, selectAllQuery, quoteIdentifier, sqlLiteral, encodePathSegments, executeSQL, executeQuery, executeStatement, getSupportedTableViews, getTableViewQuery, type ColumnInfo, type TableView } from './lib/adapters';
import type { SQLResponse } from './types';
import { isSQLConnection, isStorageConnection } from './types';
import { getConfig } from './config';

const queryClient = new QueryClient();

async function executeSQLTimed(connectionId: string, sql: string, database?: string) {
  const start = performance.now();
  const response = await executeSQL(connectionId, sql, database);
  return { response, duration: performance.now() - start };
}

function AppContent() {
  const params = useParams({ strict: false });
  const navigate = useNavigate();

  const connectionId = params.connectionId;
  // Database params
  const database = params.database;
  const table = params.table;
  // Storage params
  const container = params.container;
  const storagePath = params['_splat'] || ''; // Catch-all for path

  const connections = useLiveQuery((query) =>
    query.from({ connections: connectionsCollection }).orderBy(({ connections }) => connections.createdAt, 'desc')
  );

  const activeConnection = (connections?.data ?? []).find((c) => c.id === connectionId);

  // Determine connection type  
  const dbConnection = activeConnection && isSQLConnection(activeConnection) ? activeConnection : undefined;
  const storageConnection = activeConnection && isStorageConnection(activeConnection) ? activeConnection : undefined;

  // Fetch tables for autocomplete (only for database connections)
  const { data: tables } = useQuery({
    queryKey: ['tables', connectionId, database],
    queryFn: () => dbConnection && dbConnection.sql && database
      ? listTables(dbConnection.id, dbConnection.sql.driver, database)
      : [],
    enabled: !!dbConnection && !!dbConnection.sql && !!database,
  });

  // Fetch columns for each table for autocomplete
  const { data: columnsMap } = useQuery({
    queryKey: ['columns', connectionId, database, tables],
    queryFn: async () => {
      if (!dbConnection || !dbConnection.sql || !database || !tables?.length) return {};

      const results: Record<string, ColumnInfo[]> = {};
      // Fetch columns for all tables (limit to avoid too many requests)
      const tablesToFetch = tables.slice(0, 50);

      await Promise.all(
        tablesToFetch.map(async (t) => {
          try {
            results[t] = await listColumns(dbConnection.id, dbConnection.sql!.driver, t, database);
          } catch {
            results[t] = [];
          }
        })
      );

      return results;
    },
    enabled: !!dbConnection && !!dbConnection.sql && !!database && !!tables?.length,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Build schema info for autocomplete
  const schema: SchemaInfo | undefined = useMemo(() => {
    if (!tables) return undefined;
    return {
      tables,
      columns: columnsMap ?? {},
    };
  }, [tables, columnsMap]);

  // SQL query state (lifted for AI integration)
  const [sql, setSql] = useState('');

  // Active table view state
  const [activeView, setActiveView] = useState<TableView | null>('records');

  // Get supported tabs for the current driver
  const supportedTabs: TableView[] = dbConnection?.sql
    ? getSupportedTableViews(dbConnection.sql.driver)
    : ['records', 'columns'];

  // Clear active view when editor is expanded
  const handleExpandEditor = () => {
    setActiveView(null);
  };

  // AI chat panel state
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const toggleAiPanel = useCallback(() => setAiPanelOpen(prev => !prev), []);

  // Add connection modal state
  const [showAddConnection, setShowAddConnection] = useState(false);

  const [queryResult, setQueryResult] = useState<{
    response: SQLResponse | null;
    duration: number;
  } | null>(null);

  const mutation = useMutation({
    mutationFn: async (sql: string) => {
      if (!dbConnection?.sql) throw new Error('No database connection selected');
      return executeSQLTimed(dbConnection.id, sql, database);
    },
    onSuccess: (result) => {
      setQueryResult(result);
    },
    onError: (error) => {
      setQueryResult({
        response: { error: error instanceof Error ? error.message : 'Unknown error' },
        duration: 0,
      });
    },
  });

  // Sync editor state when the routed connection/table changes (adjust during render)
  const routeKey = `${dbConnection?.id ?? ''}|${database ?? ''}|${table ?? ''}|${container ?? ''}`;
  const [prevRouteKey, setPrevRouteKey] = useState<string | null>(null);
  if (routeKey !== prevRouteKey) {
    setPrevRouteKey(routeKey);
    if (dbConnection?.sql && table) {
      setSql(selectAllQuery(table, dbConnection.sql.driver));
      setActiveView('records');
    } else if (!table && !container) {
      // Reset view when navigating to database/connection without table/container
      setSql('');
      setQueryResult(null);
      setActiveView(null);
    }
  }

  // Auto-load table data when table param changes
  useEffect(() => {
    if (dbConnection?.sql && table) {
      mutation.mutate(selectAllQuery(table, dbConnection.sql.driver));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbConnection?.id, database, table]);

  // Execute query and update UI, returns the response
  const handleExecute = async (sql: string): Promise<SQLResponse> => {
    setSql(sql);
    const result = await mutation.mutateAsync(sql);
    return result.response;
  };

  // Storage navigation handlers (used by ObjectStorageView)
  const handleStorageNavigate = useCallback((newContainer: string, newPath: string) => {
    if (!connectionId) return;
    const container = encodeURIComponent(newContainer);
    const normalizedPath = newPath.replace(/^\/+/, '');
    if (normalizedPath) {
      navigate({ to: `/${connectionId}/container/${container}/${encodePathSegments(normalizedPath)}` });
    } else {
      navigate({ to: `/${connectionId}/container/${container}` });
    }
  }, [navigate, connectionId]);

  // Handle view selection - fill and execute the appropriate query
  const handleViewSelect = (view: TableView) => {
    if (!dbConnection?.sql || !table) return;
    const query = getTableViewQuery(dbConnection.sql.driver, table, view);
    if (query) {
      setSql(query);
      mutation.mutate(query);
      setActiveView(view);
    }
  };

  // Format value for SQL
  const formatSqlValue = (val: unknown): string => {
    if (val === null) return 'NULL';
    if (typeof val === 'number') return String(val);
    if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
    return `'${sqlLiteral(String(val))}'`;
  };

  // Resolve the primary key column for the routed table (fall back to first result column)
  const getPrimaryKeyColumn = (): string | undefined => {
    if (!table) return undefined;
    return schema?.columns[table]?.find((c) => c.primaryKey)?.name
      ?? queryResult?.response?.columns?.[0]
      ?? 'id';
  };

  // Handle cell update - generates and executes UPDATE SQL
  const handleUpdateCell = async (
    originalRow: Record<string, unknown>,
    columnId: string,
    newValue: unknown
  ) => {
    if (!dbConnection?.sql || !table) return;

    const pkColumn = getPrimaryKeyColumn();
    const pkValue = pkColumn ? originalRow[pkColumn] : undefined;

    if (pkColumn === undefined || pkValue === undefined || pkValue === null) {
      console.error('Cannot update: no primary key value found');
      return;
    }

    const driver = dbConnection.sql.driver;
    const sql = `UPDATE ${quoteIdentifier(driver, table)} SET ${quoteIdentifier(driver, columnId)} = ${formatSqlValue(newValue)} WHERE ${quoteIdentifier(driver, pkColumn)} = ${formatSqlValue(pkValue)}`;

    try {
      await executeStatement(dbConnection.id, sql, database);
      // Refresh so the grid reflects what the database actually stored
      mutation.mutate(selectAllQuery(table, driver));
    } catch (error) {
      console.error('Update failed:', error);
    }
  };

  // Handle row delete - generates and executes DELETE SQL
  const handleDeleteRow = async (row: Record<string, unknown>) => {
    if (!dbConnection?.sql || !table) return;

    const pkColumn = getPrimaryKeyColumn();
    const pkValue = pkColumn ? row[pkColumn] : undefined;

    if (pkColumn === undefined || pkValue === undefined || pkValue === null) {
      console.error('Cannot delete: no primary key value found');
      return;
    }

    const driver = dbConnection.sql.driver;
    const sql = `DELETE FROM ${quoteIdentifier(driver, table)} WHERE ${quoteIdentifier(driver, pkColumn)} = ${formatSqlValue(pkValue)}`;

    try {
      await executeStatement(dbConnection.id, sql, database);
      // Refresh the table data
      mutation.mutate(selectAllQuery(table, driver));
    } catch (error) {
      console.error('Delete failed:', error);
    }
  };

  // Query setters for AI integration (database mode only)
  const querySetters = {
    setQuery: setSql,
    executeQuery: handleExecute,
    runQuerySilent: async (sql: string) => {
      if (!dbConnection) throw new Error('No database connection selected');
      return executeQuery(dbConnection.id, sql, database);
    },
    runStatementSilent: async (sql: string) => {
      if (!dbConnection) throw new Error('No database connection selected');
      return executeStatement(dbConnection.id, sql, database);
    },
  };

  return (
    <div className="h-screen flex bg-neutral-50 dark:bg-[#0d0d0d] py-2 pr-2 pl-1 gap-2">
      {/* Sidebar */}
      <Sidebar
        showAddModal={showAddConnection}
        onAddModalClose={() => setShowAddConnection(false)}
      />

      {/* Main Content - Database Mode */}
      {dbConnection && (
        <>
          <main className="flex-1 flex flex-col overflow-hidden gap-2 min-w-0">
            {/* Query Editor */}
            <div className="shrink-0">
              <QueryEditor
                connection={dbConnection ?? null}
                selectedTable={table ?? null}
                onExecute={handleExecute}
                isLoading={mutation.isPending}
                schema={schema}
                value={sql}
                onChange={setSql}
                onToggleAI={getConfig().ai?.model ? toggleAiPanel : undefined}
                aiPanelOpen={aiPanelOpen}
                supportedViews={supportedTabs}
                onSelectView={handleViewSelect}
                activeView={activeView}
                onExpandEditor={handleExpandEditor}
              />
            </div>

            {/* Results / Status */}
            <div className="flex-1 min-h-0">
              <ResultsTable
                response={queryResult?.response ?? null}
                duration={queryResult?.duration ?? 0}
                isLoading={mutation.isPending}
                tableName={table}
                onUpdateCell={handleUpdateCell}
                onDeleteRow={handleDeleteRow}
              />
            </div>
          </main>

          {/* AI Chat Panel */}
          {aiPanelOpen && getConfig().ai?.model && (
            <ChatPanel
              isOpen={aiPanelOpen}
              onClose={toggleAiPanel}
              connection={dbConnection ?? null}
              database={database ?? null}
              table={table ?? null}
              currentQuery={sql}
              queryResult={queryResult?.response ?? null}
              schema={schema}
              setters={querySetters}
            />
          )}
        </>
      )}

      {/* Main Content - Storage Mode */}
      {storageConnection && container && (
        <ObjectStorageView
          key={`${storageConnection.id}:${container}`}
          connection={storageConnection}
          container={container}
          path={storagePath}
          onNavigate={handleStorageNavigate}
        />
      )}

      {/* No Connection Selected */}
      {!activeConnection && (
        <WelcomePage onAddConnection={() => setShowAddConnection(true)} />
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

function App() {
  return <RouterProvider router={router} />;
}

export default App;
