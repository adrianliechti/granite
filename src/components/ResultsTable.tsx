import { useMemo, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ChevronUp, ChevronDown, ChevronsUpDown, AlertTriangle } from 'lucide-react';
import type { SQLResponse } from '../types';

interface ResultsTableProps {
  response: SQLResponse | null;
  duration: number;
  isLoading: boolean;
}

export function ResultsTable({ response, duration, isLoading }: ResultsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    if (!response?.columns) return [];
    return response.columns.map((col) => ({
      accessorKey: col,
      header: col,
      cell: (info) => {
        const value = info.getValue();
        if (value === null) return <span className="text-neutral-400 dark:text-neutral-600 italic">NULL</span>;
        if (typeof value === 'boolean') return <span className="text-neutral-500 dark:text-neutral-500">{value ? 'true' : 'false'}</span>;
        if (typeof value === 'object') return <span className="text-neutral-500 dark:text-neutral-500">{JSON.stringify(value)}</span>;
        return <span className="text-neutral-500 dark:text-neutral-500">{String(value)}</span>;
      },
    }));
  }, [response?.columns]);

  const data = useMemo(() => response?.rows ?? [], [response?.rows]);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table returns non-memoizable functions by design
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  // Loading state
  if (isLoading) {
    return (
      <div className="h-48 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-neutral-400 dark:text-neutral-500">
          <div className="w-6 h-6 border-2 border-neutral-200 border-t-neutral-400 dark:border-neutral-700 dark:border-t-neutral-500 rounded-full animate-spin" />
          <span className="text-sm">Running query...</span>
        </div>
      </div>
    );
  }

  // No query run yet
  if (!response) {
    return (
      <div className="h-48 flex items-center justify-center">
        <div className="flex flex-col items-center text-neutral-400 dark:text-neutral-500">
          <svg className="w-8 h-8 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
          <span className="text-sm">Run a query to see results</span>
        </div>
      </div>
    );
  }

  // Error state
  if (response.error) {
    return (
      <div className="h-48 flex items-center justify-center">
        <div className="flex items-center gap-3 text-red-500 dark:text-red-400">
          <AlertTriangle size={18} />
          <span className="text-sm">{response.error}</span>
        </div>
      </div>
    );
  }

  // Rows affected (non-SELECT queries)
  if (response.rows_affected !== undefined && !response.rows) {
    return (
      <div className="h-48 flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30">
              OK
            </span>
            <span className="text-sm text-neutral-600 dark:text-neutral-400">
              <span className="font-medium">{response.rows_affected}</span> row(s) affected
            </span>
          </div>
          <span className="text-xs text-neutral-400 dark:text-neutral-600">{duration.toFixed(0)}ms</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#1a1a1a]/60 dark:backdrop-blur-xl border border-neutral-200 dark:border-white/8 rounded-xl overflow-hidden dark:shadow-2xl">
      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 z-10 bg-neutral-100 dark:bg-neutral-950">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const isSorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className={`text-left px-4 py-2 text-[11px] font-medium whitespace-nowrap cursor-pointer transition-colors select-none group bg-neutral-100 dark:bg-neutral-950 ${
                        isSorted
                          ? 'text-neutral-900 dark:text-neutral-200'
                          : 'text-neutral-500 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-400'
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <span className={`transition-opacity ${isSorted ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'}`}>
                          {isSorted === 'asc' ? (
                            <ChevronUp size={12} />
                          ) : isSorted === 'desc' ? (
                            <ChevronDown size={12} />
                          ) : (
                            <ChevronsUpDown size={12} />
                          )}
                        </span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, rowIndex) => {
              const isOdd = rowIndex % 2 === 1;
              const visibleCells = row.getVisibleCells();
              return (
                <tr
                  key={row.id}
                  className={`transition-colors ${
                    isOdd
                      ? 'bg-neutral-200/40 dark:bg-neutral-800/30 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/50'
                      : 'hover:bg-neutral-200/50 dark:hover:bg-neutral-800/30'
                  }`}
                >
                  {visibleCells.map((cell, idx) => (
                    <td
                      key={cell.id}
                      className={`px-4 py-2 whitespace-nowrap font-mono text-[12px] ${idx === 0 ? 'rounded-l-lg' : ''} ${idx === visibleCells.length - 1 ? 'rounded-r-lg' : ''}`}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Status Bar */}
      <div className="px-3 py-2 flex items-center gap-4 text-xs border-t border-neutral-200 dark:border-white/8 shrink-0">
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30">
          OK
        </span>
        <div className="flex items-center gap-2">
          <span className="text-neutral-400 dark:text-neutral-500">Time:</span>
          <span className="text-neutral-700 dark:text-neutral-200 font-medium">{duration.toFixed(0)}ms</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-neutral-400 dark:text-neutral-500">Rows:</span>
          <span className="text-neutral-700 dark:text-neutral-200 font-medium">{data.length}</span>
        </div>
      </div>
    </div>
  );
}
