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
import { listTables, listColumns, selectAllQuery, executeSQL, executeQuery, executeStatement, getSupportedTableViews, getTableViewQuery, type ColumnInfo, type TableView } from './lib/adapters';
import type { SQLResponse } from './types';
import { isSQLConnection, isStorageConnection } from './types';
import { getConfig } from './config';

const queryClient = new QueryClient();

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
            results[t] = await listColumns(dbConnection.id, dbConnection.sql!.driver, t);
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
  const supportedTabs = useMemo(() => {
    if (!dbConnection?.sql) return ['records', 'columns'] as TableView[];
    return getSupportedTableViews(dbConnection.sql.driver);
  }, [dbConnection?.sql]);

  // Clear active view when editor is expanded
  const handleExpandEditor = useCallback(() => {
    setActiveView(null);
  }, []);

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
      const start = performance.now();

      const response = await executeSQL(
        dbConnection.id,
        sql
      );

      const duration = performance.now() - start;
      return { response, duration };
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

  // Auto-load table data when table param changes
  useEffect(() => {
    if (dbConnection?.sql && table) {
      const query = selectAllQuery(table, dbConnection.sql.driver);
      setSql(query);
      mutation.mutate(query);
      setActiveView('records');
    } else if (!table && !container) {
      // Reset view when navigating to database/connection without table/container
      setSql('');
      setQueryResult(null);
      setActiveView(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbConnection?.id, dbConnection?.sql, table, container]);

  // Execute query and update UI, returns the response
  const handleExecute = useCallback(async (sql: string): Promise<SQLResponse> => {
    setSql(sql);
    const result = await mutation.mutateAsync(sql);
    return result.response;
  }, [mutation]);

  // Storage navigation handlers (used by ObjectStorageView)
  const handleStorageNavigate = useCallback((newContainer: string, newPath: string) => {
    if (!connectionId) return;
    const normalizedPath = newPath.replace(/^\/+/, '');
    if (normalizedPath) {
      navigate({ to: `/${connectionId}/container/${newContainer}/${normalizedPath}` });
    } else {
      navigate({ to: `/${connectionId}/container/${newContainer}` });
    }
  }, [navigate, connectionId]);

  // Handle view selection - fill and execute the appropriate query
  const handleViewSelect = useCallback((view: TableView) => {
    if (!dbConnection?.sql || !table) return;
    const query = getTableViewQuery(dbConnection.sql.driver, table, view);
    if (query) {
      setSql(query);
      mutation.mutate(query);
      setActiveView(view);
    }
  }, [dbConnection, table, mutation]);

  // Format value for SQL
  const formatSqlValue = (val: unknown): string => {
    if (val === null) return 'NULL';
    if (typeof val === 'number') return String(val);
    if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
    return `'${String(val).replace(/'/g, "''")}'`;
  };

  // Handle cell update - generates and executes UPDATE SQL
  const handleUpdateCell = useCallback(async (
    originalRow: Record<string, unknown>,
    columnId: string,
    newValue: unknown
  ) => {
    if (!dbConnection || !table) return;

    const pkColumn = queryResult?.response?.columns?.[0] ?? 'id';
    const pkValue = originalRow[pkColumn];

    if (pkValue === undefined) {
      console.error('Cannot update: no primary key found');
      return;
    }

    const sql = `UPDATE ${table} SET ${columnId} = ${formatSqlValue(newValue)} WHERE ${pkColumn} = ${formatSqlValue(pkValue)}`;

    try {
      await executeStatement(dbConnection.id, sql);
    } catch (error) {
      console.error('Update failed:', error);
    }
  }, [dbConnection, table, queryResult?.response?.columns]);

  // Handle row delete - generates and executes DELETE SQL
  const handleDeleteRow = useCallback(async (row: Record<string, unknown>) => {
    if (!dbConnection?.sql || !table) return;

    const pkColumn = queryResult?.response?.columns?.[0] ?? 'id';
    const pkValue = row[pkColumn];

    if (pkValue === undefined) {
      console.error('Cannot delete: no primary key found');
      return;
    }

    const sql = `DELETE FROM ${table} WHERE ${pkColumn} = ${formatSqlValue(pkValue)}`;

    try {
      await executeStatement(dbConnection.id, sql);
      // Refresh the table data
      mutation.mutate(selectAllQuery(table, dbConnection.sql.driver));
    } catch (error) {
      console.error('Delete failed:', error);
    }
  }, [dbConnection, table, queryResult?.response?.columns, mutation]);

  // Query setters for AI integration (database mode only)
  const querySetters = useMemo(() => ({
    setQuery: setSql,
    executeQuery: handleExecute,
    runQuerySilent: async (sql: string) => {
      if (!dbConnection) throw new Error('No database connection selected');
      return executeQuery(dbConnection.id, sql);
    },
    runStatementSilent: async (sql: string) => {
      if (!dbConnection) throw new Error('No database connection selected');
      return executeStatement(dbConnection.id, sql);
    },
  }), [handleExecute, dbConnection]);

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
