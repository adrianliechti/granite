import { useState, useCallback } from 'react';
import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query';
import { RouterProvider, useSearch, useNavigate } from '@tanstack/react-router';
import { router, indexRoute } from './router';
import { Sidebar } from './components/Sidebar';
import { QueryEditor } from './components/QueryEditor';
import { ResultsTable } from './components/ResultsTable';
import { executeQuery } from './lib/api';
import { useLiveQuery } from '@tanstack/react-db';
import { connectionsCollection } from './lib/collections';
import type { SQLResponse } from './types';

const queryClient = new QueryClient();

function AppContent() {
  const search = useSearch({ from: indexRoute.id });
  const navigate = useNavigate();
  
  const connections = useLiveQuery((query) =>
    query.from({ connections: connectionsCollection }).orderBy(({ connections }) => connections.createdAt, 'desc')
  );
  
  const activeConnection = (connections?.data ?? []).find((c) => c.id === search.connectionId);

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

  const handleSelectConnection = useCallback((connectionId: string | null) => {
    navigate({
      to: '/',
      search: { connectionId: connectionId ?? undefined },
    });
  }, [navigate]);

  const handleSelectDatabase = useCallback((database: string | null) => {
    navigate({
      to: '/',
      search: { ...search, database: database ?? undefined, table: undefined },
    });
  }, [navigate, search]);

  const handleSelectTable = useCallback((table: string | null) => {
    navigate({
      to: '/',
      search: { ...search, table: table ?? undefined },
    });
  }, [navigate, search]);

  return (
    <div className="h-screen flex bg-neutral-50 dark:bg-[#0d0d0d] py-2 pr-2 pl-1 gap-2">
      {/* Sidebar */}
      <Sidebar
        activeConnectionId={search.connectionId ?? null}
        activeDatabase={search.database ?? null}
        activeTable={search.table ?? null}
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
            selectedTable={search.table ?? null}
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
