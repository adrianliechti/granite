import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil, Database } from 'lucide-react';
import { useLiveQuery } from '@tanstack/react-db';
import { connectionsCollection } from '../lib/collections';
import { listDatabases, listTables, createDatabase, supportsCreateDatabase } from '../lib/adapters';
import { ConnectionModal } from './ConnectionModal';
import type { Connection } from '../types';

interface SidebarProps {
  activeConnectionId: string | null;
  activeDatabase: string | null;
  activeTable: string | null;
  onSelectConnection: (connectionId: string | null) => void;
  onSelectDatabase: (database: string) => void;
  onSelectTable: (table: string) => void;
}

const driverColors: Record<string, string> = {
  postgres: 'text-blue-600 dark:text-blue-400',
  mysql: 'text-yellow-600 dark:text-yellow-400',
  sqlite: 'text-purple-600 dark:text-purple-400',
  sqlserver: 'text-red-600 dark:text-red-400',
  oracle: 'text-orange-600 dark:text-orange-400',
};

function formatTimestamp(date: string): string {
  const d = new Date(date);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  
  if (isToday) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function getStatusColor(isActive: boolean): string {
  return isActive ? 'bg-blue-500' : 'bg-neutral-500';
}

export function Sidebar({
  activeConnectionId,
  activeDatabase,
  activeTable,
  onSelectConnection,
  onSelectDatabase,
  onSelectTable,
}: SidebarProps) {
  const connections = useLiveQuery((q) =>
    q.from({ conn: connectionsCollection }).orderBy(({ conn }) => conn.createdAt, 'desc')
  );

  const queryClient = useQueryClient();
  const [modalState, setModalState] = useState<{ open: boolean; connection?: Connection | null }>({ open: false });
  const [createDbModal, setCreateDbModal] = useState<{ open: boolean; connectionId: string | null }>({ open: false, connectionId: null });
  const [newDbName, setNewDbName] = useState('');
  const [createDbError, setCreateDbError] = useState<string | null>(null);
  const [isCreatingDb, setIsCreatingDb] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const activeConnection = (connections?.data ?? []).find((c) => c.id === activeConnectionId);

  const { data: databases } = useQuery({
    queryKey: ['databases', activeConnectionId],
    queryFn: () =>
      activeConnection && activeConnectionId
        ? listDatabases(activeConnection.driver, activeConnection.dsn)
        : [],
    enabled: !!activeConnection && !!activeConnectionId,
  });

  const { data: tables } = useQuery({
    queryKey: ['tables', activeConnectionId, activeDatabase],
    queryFn: () =>
      activeConnection && activeDatabase
        ? listTables(activeConnection.driver, activeConnection.dsn, activeDatabase)
        : [],
    enabled: !!activeConnection && !!activeConnectionId && !!activeDatabase,
  });

  // Group connections by name
  const groupedConnections = useMemo(() => {
    const data = connections?.data ?? [];
    const groups = new Map<string, typeof data>();
    
    for (const conn of data) {
      const existing = groups.get(conn.name) || [];
      existing.push(conn);
      groups.set(conn.name, existing);
    }
    
    return Array.from(groups.entries()).map(([name, entries]) => ({
      name,
      entries,
    }));
  }, [connections?.data]);

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const saveConnection = (conn: Omit<Connection, 'id' | 'createdAt'>) => {
    if (modalState.connection) {
      // Edit existing connection
      connectionsCollection.update(modalState.connection.id, (draft) => {
        draft.name = conn.name;
        draft.driver = conn.driver;
        draft.dsn = conn.dsn;
      });
    } else {
      // Add new connection
      const id = crypto.randomUUID();
      connectionsCollection.insert({ ...conn, id, createdAt: new Date().toISOString() });
      onSelectConnection(id);
      setExpanded((prev) => new Set(prev).add(id));
    }
    setModalState({ open: false });
  };

  const deleteConnection = (id: string) => {
    connectionsCollection.delete(id);
    if (activeConnectionId === id) {
      onSelectConnection(null);
    }
  };

  const handleCreateDatabase = async () => {
    if (!activeConnection || !newDbName.trim()) return;
    
    setIsCreatingDb(true);
    setCreateDbError(null);
    
    try {
      await createDatabase(activeConnection.driver, activeConnection.dsn, newDbName.trim());
      // Refresh databases list
      await queryClient.invalidateQueries({ queryKey: ['databases', activeConnectionId] });
      setCreateDbModal({ open: false, connectionId: null });
      setNewDbName('');
    } catch (err) {
      setCreateDbError(err instanceof Error ? err.message : 'Failed to create database');
    } finally {
      setIsCreatingDb(false);
    }
  };

  return (
    <>
      {/* Connection Modal */}
      {modalState.open && (
        <ConnectionModal
          connection={modalState.connection}
          onSave={saveConnection}
          onClose={() => setModalState({ open: false })}
        />
      )}

      {/* Create Database Modal */}
      {createDbModal.open && activeConnection && (
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
                  setCreateDbModal({ open: false, connectionId: null });
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
                  setCreateDbModal({ open: false, connectionId: null });
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

      <aside className="w-64 bg-white dark:bg-[#1a1a1a]/60 dark:backdrop-blur-xl border border-neutral-200 dark:border-white/8 rounded-xl flex flex-col overflow-hidden dark:shadow-2xl">
        {/* Header */}
        <div className="px-3 py-2.5 flex items-center justify-between gap-2">
          <h1 className="text-sm font-semibold text-neutral-700 dark:text-neutral-200 pl-0.5">Granite</h1>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setModalState({ open: true, connection: null })}
              className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors"
              title="Add connection"
            >
              <Plus className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
            </button>
          </div>
        </div>

        {/* Connections List */}
        <div className="flex-1 overflow-y-auto px-2">
          {(connections?.data ?? []).length === 0 ? (
            <div className="px-2 py-8 text-center text-neutral-400 dark:text-neutral-600 text-xs">
              No connections yet
            </div>
          ) : (
            <div className="space-y-3 pb-2">
              {groupedConnections.map((group) => (
                <div key={group.name}>
                  {/* Group Header */}
                  <div className="px-2 py-1 text-[10px] font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider truncate">
                    {group.name}
                  </div>

                  {/* Connection Items */}
                  <div className="space-y-0.5">
                    {group.entries.map((conn) => {
                      const isActive = activeConnectionId === conn.id;
                      const isExpanded = expanded.has(conn.id);

                      return (
                      <div key={conn.id}>
                        <div
                          className="group flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5 cursor-pointer transition-colors"
                          onClick={() => {
                            onSelectConnection(conn.id);
                            toggle(conn.id);
                          }}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${getStatusColor(isActive)}`} />
                          <span className={`text-[10px] font-semibold shrink-0 uppercase ${driverColors[conn.driver] || 'text-neutral-500'}`}>
                            {conn.driver === 'postgres' ? 'PG' : conn.driver === 'mysql' ? 'MY' : conn.driver === 'sqlserver' ? 'MS' : conn.driver === 'oracle' ? 'OR' : 'SQ'}
                          </span>
                          <span className="text-xs text-neutral-500 dark:text-neutral-400 truncate flex-1">
                            {conn.dsn.split('@').pop()?.split('/')[0] || conn.dsn.slice(0, 20)}
                          </span>
                          <div className="flex items-center justify-end text-[10px] text-neutral-400 dark:text-neutral-600 shrink-0 w-16 h-5">
                            <span className="group-hover:hidden">
                              {formatTimestamp(conn.createdAt)}
                            </span>
                            <div className="hidden group-hover:flex items-center gap-0.5">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setModalState({ open: true, connection: conn });
                                }}
                                className="inline-flex items-center justify-center w-5 h-5 hover:bg-neutral-200 dark:hover:bg-white/8 rounded transition-colors"
                                title="Edit"
                              >
                                <Pencil className="w-3 h-3 text-neutral-400 dark:text-neutral-500 hover:text-blue-500 dark:hover:text-blue-400" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteConnection(conn.id);
                                }}
                                className="inline-flex items-center justify-center w-5 h-5 hover:bg-neutral-200 dark:hover:bg-white/8 rounded transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-3 h-3 text-neutral-400 dark:text-neutral-500 hover:text-rose-500 dark:hover:text-rose-400" />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Databases (nested) */}
                        {isExpanded && isActive && databases && (
                          <div className="ml-4 space-y-0.5">
                            {databases.map((db) => {
                              const isDbActive = activeDatabase === db;
                              const isDbExpanded = expanded.has(`${conn.id}:${db}`);

                              return (
                                <div key={db}>
                                  <div
                                    className="group flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5 cursor-pointer transition-colors"
                                    onClick={() => {
                                      toggle(`${conn.id}:${db}`);
                                      onSelectDatabase(db);
                                    }}
                                  >
                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isDbActive ? 'bg-blue-500' : 'bg-neutral-400'}`} />
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
                                          onClick={() => onSelectTable(table)}
                                        >
                                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${activeTable === table ? 'bg-blue-500' : 'bg-neutral-400'}`} />
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
                            {databases.length === 0 && (
                              <div className="px-3 py-1.5 text-xs text-neutral-400 dark:text-neutral-600">
                                No databases
                              </div>
                            )}
                            {/* Create Database Button */}
                            {supportsCreateDatabase(conn.driver) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCreateDbModal({ open: true, connectionId: conn.id });
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
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      </aside>
    </>
  );
}
