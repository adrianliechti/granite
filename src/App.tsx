import { useState, useCallback, useMemo } from 'react';
import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query';
import { RouterProvider, useParams, useNavigate } from '@tanstack/react-router';
import { router } from './router';
import { Sidebar } from './components/Sidebar';
import { QueryEditor, type SchemaInfo } from './components/QueryEditor';
import { ResultsTable } from './components/ResultsTable';
import { ChatPanel } from './components/ChatPanel';
import { useLiveQuery } from '@tanstack/react-db';
import { connectionsCollection } from './lib/collections';
import { listTables, listColumns, selectAllQuery, executeQuery, getSupportedTableViews, getTableViewQuery, type ColumnInfo, type TableView } from './lib/adapters';
import type { SQLResponse } from './types';
import { getConfig } from './config';

const queryClient = new QueryClient();

function AppContent() {
  const params = useParams({ strict: false });
  const navigate = useNavigate();
  
  const connectionId = params.connectionId;
  const database = params.database;
  const table = params.table;
  
  const connections = useLiveQuery((query) =>
    query.from({ connections: connectionsCollection }).orderBy(({ connections }) => connections.createdAt, 'desc')
  );
  
  const activeConnection = (connections?.data ?? []).find((c) => c.id === connectionId);

  // Fetch tables for autocomplete
  const { data: tables } = useQuery({
    queryKey: ['tables', connectionId, database],
    queryFn: () => activeConnection && database 
      ? listTables(activeConnection.driver, activeConnection.dsn, database) 
      : [],
    enabled: !!activeConnection && !!database,
  });

  // Fetch columns for each table for autocomplete
  const { data: columnsMap } = useQuery({
    queryKey: ['columns', connectionId, database, tables],
    queryFn: async () => {
      if (!activeConnection || !database || !tables?.length) return {};
      
      const results: Record<string, ColumnInfo[]> = {};
      // Fetch columns for all tables (limit to avoid too many requests)
      const tablesToFetch = tables.slice(0, 50);
      
      await Promise.all(
        tablesToFetch.map(async (t) => {
          try {
            results[t] = await listColumns(activeConnection.driver, activeConnection.dsn, t);
          } catch {
            results[t] = [];
          }
        })
      );
      
      return results;
    },
    enabled: !!activeConnection && !!database && !!tables?.length,
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
    if (!activeConnection) return ['records', 'columns'] as TableView[];
    return getSupportedTableViews(activeConnection.driver);
  }, [activeConnection]);
  
  // Clear active view when editor is expanded
  const handleExpandEditor = useCallback(() => {
    setActiveView(null);
  }, []);
  
  // AI chat panel state
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const toggleAiPanel = useCallback(() => setAiPanelOpen(prev => !prev), []);

  const [queryResult, setQueryResult] = useState<{
    response: SQLResponse | null;
    duration: number;
  } | null>(null);

  const mutation = useMutation({
    mutationFn: async (sql: string) => {
      if (!activeConnection) throw new Error('No connection selected');
      const start = performance.now();
      
      const response = await executeQuery(
        activeConnection.driver,
        activeConnection.dsn,
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

  const handleExecute = useCallback((sql: string) => {
    mutation.mutate(sql);
  }, [mutation]);

  const handleSelectConnection = useCallback((connId: string | null) => {
    if (!connId) {
      navigate({ to: '/' });
    } else {
      navigate({ to: `/${connId}` });
    }
  }, [navigate]);

  const handleSelectDatabase = useCallback((db: string) => {
    if (!connectionId) return;
    navigate({ to: `/${connectionId}/${db}` });
  }, [navigate, connectionId]);

  const handleSelectTable = useCallback((tbl: string) => {
    if (!connectionId || !database) return;
    navigate({ to: `/${connectionId}/${database}/${tbl}` });
    // Auto-execute query when table is selected
    if (activeConnection) {
      mutation.mutate(selectAllQuery(tbl, activeConnection.driver));
      setActiveView('records');
    }
  }, [navigate, connectionId, database, activeConnection, mutation]);

  // Handle view selection - fill and execute the appropriate query
  const handleViewSelect = useCallback((view: TableView) => {
    if (!activeConnection || !table) return;
    const query = getTableViewQuery(activeConnection.driver, table, view);
    if (query) {
      setSql(query);
      mutation.mutate(query);
      setActiveView(view);
    }
  }, [activeConnection, table, mutation]);

  // Handle cell update - generates and executes UPDATE SQL
  const handleUpdateCell = useCallback(async (
    originalRow: Record<string, unknown>,
    columnId: string,
    newValue: unknown
  ) => {
    if (!activeConnection || !table) return;
    
    // Find the primary key column (assume first column or 'id')
    const pkColumn = queryResult?.response?.columns?.[0] ?? 'id';
    const pkValue = originalRow[pkColumn];
    
    if (pkValue === undefined) {
      console.error('Cannot update: no primary key found');
      return;
    }
    
    // Format value for SQL
    const formatValue = (val: unknown): string => {
      if (val === null) return 'NULL';
      if (typeof val === 'number') return String(val);
      if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
      return `'${String(val).replace(/'/g, "''")}'`;
    };
    
    const sql = `UPDATE ${table} SET ${columnId} = ${formatValue(newValue)} WHERE ${pkColumn} = ${formatValue(pkValue)}`;
    
    try {
      await executeQuery(
        activeConnection.driver,
        activeConnection.dsn,
        sql
      );
    } catch (error) {
      console.error('Update failed:', error);
    }
  }, [activeConnection, table, queryResult?.response?.columns]);

  // Handle row delete - generates and executes DELETE SQL
  const handleDeleteRow = useCallback(async (row: Record<string, unknown>) => {
    if (!activeConnection || !table) return;
    
    // Find the primary key column (assume first column or 'id')
    const pkColumn = queryResult?.response?.columns?.[0] ?? 'id';
    const pkValue = row[pkColumn];
    
    if (pkValue === undefined) {
      console.error('Cannot delete: no primary key found');
      return;
    }
    
    // Format value for SQL
    const formatValue = (val: unknown): string => {
      if (val === null) return 'NULL';
      if (typeof val === 'number') return String(val);
      if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
      return `'${String(val).replace(/'/g, "''")}'`;
    };
    
    const sql = `DELETE FROM ${table} WHERE ${pkColumn} = ${formatValue(pkValue)}`;
    
    try {
      await executeQuery(
        activeConnection.driver,
        activeConnection.dsn,
        sql
      );
      // Refresh the table data
      mutation.mutate(selectAllQuery(table, activeConnection.driver));
    } catch (error) {
      console.error('Delete failed:', error);
    }
  }, [activeConnection, table, queryResult?.response?.columns, mutation]);

  // Query setters for AI integration
  const querySetters = useMemo(() => ({
    setQuery: setSql,
    executeQuery: handleExecute,
  }), [handleExecute]);

  return (
    <div className="h-screen flex bg-neutral-50 dark:bg-[#0d0d0d] py-2 pr-2 pl-1 gap-2">
      {/* Sidebar */}
      <Sidebar
        activeConnectionId={connectionId ?? null}
        activeDatabase={database ?? null}
        activeTable={table ?? null}
        onSelectConnection={handleSelectConnection}
        onSelectDatabase={handleSelectDatabase}
        onSelectTable={handleSelectTable}
      />

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden gap-2 min-w-0">
        {/* Query Editor */}
        <div className="shrink-0">
          <QueryEditor
            connection={activeConnection ?? null}
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
          connection={activeConnection ?? null}
          database={database ?? null}
          table={table ?? null}
          currentQuery={sql}
          queryResult={queryResult?.response ?? null}
          schema={schema}
          setters={querySetters}
        />
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
