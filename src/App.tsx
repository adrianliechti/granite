import { useState, useCallback } from 'react';
import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query';
import { RouterProvider, useParams, useNavigate } from '@tanstack/react-router';
import { router } from './router';
import { Sidebar } from './components/Sidebar';
import { QueryEditor } from './components/QueryEditor';
import { ResultsTable } from './components/ResultsTable';
import { executeQuery } from './lib/api';
import { useLiveQuery } from '@tanstack/react-db';
import { connectionsCollection } from './lib/collections';
import type { SQLResponse } from './types';

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

  const [queryResult, setQueryResult] = useState<{
    response: SQLResponse | null;
    duration: number;
  } | null>(null);

  const mutation = useMutation({
    mutationFn: async (sql: string) => {
      if (!activeConnection) throw new Error('No connection selected');
      const start = performance.now();
      const response = await executeQuery({
        driver: activeConnection.driver,
        dsn: activeConnection.dsn,
        query: sql,
      });
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

  const handleSelectDatabase = useCallback((db: string | null) => {
    // If db is null, don't navigate - just deselect
    if (!db) return;
    if (!connectionId) return;
    navigate({ to: `/${connectionId}/${db}` });
  }, [navigate, connectionId]);

  const handleSelectTable = useCallback((tbl: string | null) => {
    // If tbl is null, don't navigate - just deselect
    if (!tbl) return;
    if (!connectionId || !database) return;
    navigate({ to: `/${connectionId}/${database}/${tbl}` });
    // Auto-execute query when table is selected
    if (activeConnection) {
      mutation.mutate(`SELECT * FROM ${tbl} LIMIT 100`);
    }
  }, [navigate, connectionId, database, activeConnection, mutation]);

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
        <div className="flex-1 min-h-0">
          <QueryEditor
            connection={activeConnection ?? null}
            selectedTable={table ?? null}
            onExecute={handleExecute}
            isLoading={mutation.isPending}
          />
        </div>

        {/* Results / Status */}
        <div className="h-80 min-h-0">
          <ResultsTable
            response={queryResult?.response ?? null}
            duration={queryResult?.duration ?? 0}
            isLoading={mutation.isPending}
          />
        </div>
      </main>
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
