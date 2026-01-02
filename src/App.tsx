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

  const handleSelectDatabase = useCallback((db: string) => {
    if (!connectionId) return;
    navigate({ to: `/${connectionId}/${db}` });
  }, [navigate, connectionId]);

  const handleSelectTable = useCallback((tbl: string) => {
    if (!connectionId || !database) return;
    navigate({ to: `/${connectionId}/${database}/${tbl}` });
    // Auto-execute query when table is selected
    if (activeConnection) {
      mutation.mutate(`SELECT * FROM ${tbl} LIMIT 100`);
    }
  }, [navigate, connectionId, database, activeConnection, mutation]);

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
      await executeQuery({
        driver: activeConnection.driver,
        dsn: activeConnection.dsn,
        query: sql,
      });
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
      await executeQuery({
        driver: activeConnection.driver,
        dsn: activeConnection.dsn,
        query: sql,
      });
      // Refresh the table data
      mutation.mutate(`SELECT * FROM ${table} LIMIT 100`);
    } catch (error) {
      console.error('Delete failed:', error);
    }
  }, [activeConnection, table, queryResult?.response?.columns, mutation]);

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
            tableName={table}
            onUpdateCell={handleUpdateCell}
            onDeleteRow={handleDeleteRow}
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
