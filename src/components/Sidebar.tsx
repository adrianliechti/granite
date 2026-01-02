import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useLiveQuery } from '@tanstack/react-db';
import { connectionsCollection } from '../lib/collections';
import { listDatabases, listTables } from '../lib/adapters';
import type { Connection } from '../types';

interface SidebarProps {
  activeConnectionId: string | null;
  activeDatabase: string | null;
  activeTable: string | null;
  onSelectConnection: (connectionId: string | null) => void;
  onSelectDatabase: (database: string | null) => void;
  onSelectTable: (table: string | null) => void;
}

const driverColors: Record<string, string> = {
  postgres: 'text-blue-600 dark:text-blue-400',
  mysql: 'text-yellow-600 dark:text-yellow-400',
  sqlite: 'text-purple-600 dark:text-purple-400',
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
  return isActive ? 'bg-green-500' : 'bg-neutral-500';
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

  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const activeConnection = (connections?.data ?? []).find((c) => c.id === activeConnectionId);

  const { data: databases } = useQuery({
    queryKey: ['databases', activeConnectionId],
    queryFn: () => activeConnection ? listDatabases(activeConnection.driver, activeConnection.dsn) : [],
    enabled: !!activeConnection,
  });

  const { data: tables } = useQuery({
    queryKey: ['tables', activeConnectionId, activeDatabase],
    queryFn: () => activeConnection ? listTables(activeConnection.driver, activeConnection.dsn) : [],
    enabled: !!activeConnection && !!activeDatabase,
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

  const addConnection = (conn: Omit<Connection, 'id' | 'createdAt'>) => {
    const id = crypto.randomUUID();
    connectionsCollection.insert({ ...conn, id, createdAt: new Date().toISOString() });
    onSelectConnection(id);
    setExpanded((prev) => new Set(prev).add(id));
    setShowForm(false);
  };

  const deleteConnection = (id: string) => {
    connectionsCollection.delete(id);
    if (activeConnectionId === id) {
      onSelectConnection(null);
      onSelectDatabase(null);
      onSelectTable(null);
    }
  };

  return (
    <aside className="w-64 bg-white dark:bg-[#1a1a1a]/60 dark:backdrop-blur-xl border border-neutral-200 dark:border-white/8 rounded-xl flex flex-col overflow-hidden dark:shadow-2xl">
      {/* Header */}
      <div className="px-3 py-2.5 flex items-center justify-between gap-2">
        <h1 className="text-sm font-semibold text-neutral-700 dark:text-neutral-200 pl-0.5">Base</h1>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowForm(true)}
            className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors"
            title="Add connection"
          >
            <Plus className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
          </button>
        </div>
      </div>

      {/* Connection Form */}
      {showForm && (
        <div className="px-2 pb-2">
          <ConnectionForm onSave={addConnection} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {/* Connections List */}
      <div className="flex-1 overflow-y-auto px-2">
        {(connections?.data ?? []).length === 0 && !showForm ? (
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
                            onSelectDatabase(null);
                            onSelectTable(null);
                          }}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${getStatusColor(isActive)}`} />
                          <span className={`text-[10px] font-semibold shrink-0 uppercase ${driverColors[conn.driver] || 'text-neutral-500'}`}>
                            {conn.driver === 'postgres' ? 'PG' : conn.driver === 'mysql' ? 'MY' : 'SQ'}
                          </span>
                          <span className="text-xs text-neutral-500 dark:text-neutral-400 truncate flex-1">
                            {conn.dsn.split('@').pop()?.split('/')[0] || conn.dsn.slice(0, 20)}
                          </span>
                          <div className="flex items-center justify-end text-[10px] text-neutral-400 dark:text-neutral-600 shrink-0 w-12 h-5">
                            <span className="group-hover:hidden">
                              {formatTimestamp(conn.createdAt)}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteConnection(conn.id);
                              }}
                              className="hidden group-hover:inline-flex items-center justify-center w-5 h-5 hover:bg-neutral-200 dark:hover:bg-white/8 rounded transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-3 h-3 text-neutral-400 dark:text-neutral-500 hover:text-rose-500 dark:hover:text-rose-400" />
                            </button>
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
                                      onSelectDatabase(db);
                                      toggle(`${conn.id}:${db}`);
                                      onSelectTable(null);
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
                                              ? 'bg-green-500/10 dark:bg-green-500/20'
                                              : 'hover:bg-neutral-100 dark:hover:bg-white/5'
                                          }`}
                                          onClick={() => onSelectTable(table)}
                                        >
                                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${activeTable === table ? 'bg-green-500' : 'bg-neutral-400'}`} />
                                          <span className={`text-xs truncate flex-1 ${activeTable === table ? 'text-green-600 dark:text-green-400' : 'text-neutral-500 dark:text-neutral-400'}`}>
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
  );
}

function ConnectionForm({ onSave, onCancel }: {
  onSave: (conn: Omit<Connection, 'id' | 'createdAt'>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [driver, setDriver] = useState<Connection['driver']>('postgres');
  const [dsn, setDsn] = useState('');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name && dsn) onSave({ name, driver, dsn });
      }}
      className="p-2 space-y-2 bg-neutral-100 dark:bg-white/5 rounded-lg"
    >
      <input
        type="text"
        placeholder="Connection name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-green-500"
        autoFocus
      />
      <select
        value={driver}
        onChange={(e) => setDriver(e.target.value as Connection['driver'])}
        className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-green-500"
      >
        <option value="postgres">PostgreSQL</option>
        <option value="mysql">MySQL</option>
        <option value="sqlite">SQLite</option>
      </select>
      <input
        type="text"
        placeholder="Connection string"
        value={dsn}
        onChange={(e) => setDsn(e.target.value)}
        className="w-full px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-green-500"
      />
      <div className="flex gap-1.5">
        <button
          type="submit"
          disabled={!name || !dsn}
          className="flex-1 px-3 py-1.5 text-xs font-medium bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 transition-colors"
        >
          Add
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-white/5 rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
