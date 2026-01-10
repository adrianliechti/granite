import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { Plus, Database, Table } from 'lucide-react';
import { listDatabases, listTables, createDatabase, supportsCreateDatabase } from '../lib/adapters';
import type { Connection } from '../types';

interface DatabaseBrowserProps {
  connection: Connection;
  expanded: Set<string>;
  onToggle: (key: string) => void;
  onSelectDatabase: (database: string) => void;
  onSelectTable: (database: string, table: string) => void;
}

export function DatabaseBrowser({
  connection,
  expanded,
  onToggle,
  onSelectDatabase,
  onSelectTable,
}: DatabaseBrowserProps) {
  // Get active database/table from URL
  const params = useParams({ strict: false });
  const isActiveConnection = params.connectionId === connection.id;
  const activeDatabase = isActiveConnection ? (params.database ?? null) : null;
  const activeTable = isActiveConnection ? (params.table ?? null) : null;

  const queryClient = useQueryClient();
  const [createDbModal, setCreateDbModal] = useState<{ open: boolean }>({ open: false });
  const [newDbName, setNewDbName] = useState('');
  const [createDbError, setCreateDbError] = useState<string | null>(null);
  const [isCreatingDb, setIsCreatingDb] = useState(false);

  const { data: databases } = useQuery({
    queryKey: ['databases', connection.id],
    queryFn: () => listDatabases(connection.id, connection.sql!.driver),
    enabled: !!connection && !!connection.sql,
  });

  const { data: tables } = useQuery({
    queryKey: ['tables', connection.id, activeDatabase],
    queryFn: () =>
      activeDatabase
        ? listTables(connection.id, connection.sql!.driver, activeDatabase)
        : [],
    enabled: !!connection && !!connection.sql && !!activeDatabase,
  });

  const handleCreateDatabase = async () => {
    if (!newDbName.trim()) return;

    setIsCreatingDb(true);
    setCreateDbError(null);

    try {
      await createDatabase(connection.id, connection.sql!.driver, newDbName.trim());
      await queryClient.invalidateQueries({ queryKey: ['databases', connection.id] });
      setCreateDbModal({ open: false });
      setNewDbName('');
    } catch (err) {
      setCreateDbError(err instanceof Error ? err.message : 'Failed to create database');
    } finally {
      setIsCreatingDb(false);
    }
  };

  return (
    <>
      {/* Create Database Modal */}
      {createDbModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-neutral-200 dark:border-white/10 p-4 w-80 shadow-xl">
            <div className="flex items-center gap-2 mb-4">
              <Database className="w-5 h-5 text-blue-500" />
              <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">Create Database</h2>
            </div>
            <input
              type="text"
              value={newDbName}
              onChange={(e) => setNewDbName(e.target.value)}
              placeholder="Database name"
              className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-white/5 text-neutral-700 dark:text-neutral-200 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newDbName.trim()) {
                  handleCreateDatabase();
                } else if (e.key === 'Escape') {
                  setCreateDbModal({ open: false });
                  setNewDbName('');
                  setCreateDbError(null);
                }
              }}
            />
            {createDbError && (
              <p className="mt-2 text-xs text-red-500">{createDbError}</p>
            )}
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                onClick={() => {
                  setCreateDbModal({ open: false });
                  setNewDbName('');
                  setCreateDbError(null);
                }}
                className="px-3 py-1.5 text-xs rounded-lg text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateDatabase}
                disabled={isCreatingDb || !newDbName.trim()}
                className="px-3 py-1.5 text-xs rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isCreatingDb ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Database List */}
      <div className="space-y-0.5">
        {databases?.map((db) => {
          const isDbActive = activeDatabase === db;
          const isDbExpanded = expanded.has(`${connection.id}:${db}`);

          return (
            <div key={db}>
              <div
                className="group flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5 cursor-pointer transition-colors"
                onClick={() => {
                  onToggle(`${connection.id}:${db}`);
                  onSelectDatabase(db);
                }}
              >
                <Database className={`w-3.5 h-3.5 shrink-0 ${isDbActive ? 'text-blue-500' : 'text-neutral-400 dark:text-neutral-500'}`} />
                <span className="text-xs text-neutral-500 dark:text-neutral-400 truncate flex-1">
                  {db}
                </span>
              </div>

              {/* Tables (nested) */}
              {isDbExpanded && isDbActive && tables && (
                <div className="ml-4 space-y-0.5">
                  {tables.map((table) => (
                    <div
                      key={table}
                      className={`group flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
                        activeTable === table
                          ? 'bg-blue-500/10 dark:bg-blue-500/20'
                          : 'hover:bg-neutral-100 dark:hover:bg-white/5'
                      }`}
                      onClick={() => onSelectTable(db, table)}
                    >
                      <Table className={`w-3.5 h-3.5 shrink-0 ${activeTable === table ? 'text-blue-500' : 'text-neutral-400 dark:text-neutral-500'}`} />
                      <span className={`text-xs truncate flex-1 ${activeTable === table ? 'text-blue-600 dark:text-blue-400' : 'text-neutral-500 dark:text-neutral-400'}`}>
                        {table}
                      </span>
                    </div>
                  ))}
                  {tables.length === 0 && (
                    <div className="px-3 py-1.5 text-xs text-neutral-400 dark:text-neutral-600">
                      No tables
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {(!databases || databases.length === 0) && (
          <div className="px-3 py-1.5 text-xs text-neutral-400 dark:text-neutral-600">
            No databases
          </div>
        )}
        {/* Create Database Button */}
        {connection.sql && supportsCreateDatabase(connection.sql.driver) && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setCreateDbModal({ open: true });
            }}
            className="flex items-center gap-2 px-3 py-1.5 w-full rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5 cursor-pointer transition-colors text-left"
          >
            <Plus className="w-3 h-3 text-neutral-400 dark:text-neutral-500" />
            <span className="text-xs text-neutral-400 dark:text-neutral-500">
              New database
            </span>
          </button>
        )}
      </div>
    </>
  );
}
