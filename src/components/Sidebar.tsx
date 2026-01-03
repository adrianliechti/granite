import { useState, useMemo } from 'react';
import { Plus, Trash2, Pencil, Database, Package } from 'lucide-react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from '@tanstack/react-db';
import { connectionsCollection } from '../lib/collections';
import { ConnectionModal } from './ConnectionModal';
import { CreateContainerModal } from './CreateContainerModal';
import { DatabaseBrowser } from './DatabaseBrowser';
import { ObjectStorageBrowser } from './ObjectStorageBrowser';
import type { Connection, DatabaseConnection, StorageConnection } from '../types';
import { isDatabaseConnection, isStorageConnection } from '../types';

interface SidebarProps {
  showAddModal?: boolean;
  onAddModalClose?: () => void;
}

const driverColors: Record<string, string> = {
  postgres: 'text-blue-600 dark:text-blue-400',
  mysql: 'text-yellow-600 dark:text-yellow-400',
  sqlite: 'text-purple-600 dark:text-purple-400',
  sqlserver: 'text-red-600 dark:text-red-400',
  oracle: 'text-orange-600 dark:text-orange-400',
  // Storage providers
  's3': 'text-orange-600 dark:text-orange-400',
  'azure-blob': 'text-blue-600 dark:text-blue-400',
};

export function Sidebar({
  showAddModal = false,
  onAddModalClose,
}: SidebarProps) {
  // Get route params from URL
  const params = useParams({ strict: false });
  const navigate = useNavigate();

  // Navigation handlers
  const onSelectConnection = (connId: string | null) => {
    if (!connId) {
      navigate({ to: '/' });
    } else {
      navigate({ to: `/${connId}` });
    }
  };

  const onSelectDatabase = (connId: string, db: string) => {
    navigate({ to: `/${connId}/${db}` });
  };

  const onSelectTable = (connId: string, db: string, tbl: string) => {
    navigate({ to: `/${connId}/${db}/${tbl}` });
  };

  const onSelectContainer = (connId: string, cont: string) => {
    navigate({ to: `/${connId}/container/${cont}` });
  };

  const onSelectPath = (connId: string, cont: string, path: string) => {
    const normalizedPath = path.replace(/^\/+/, '');
    navigate({ to: `/${connId}/container/${cont}/${normalizedPath}` });
  };

  const connections = useLiveQuery((q) =>
    q.from({ conn: connectionsCollection }).orderBy(({ conn }) => conn.createdAt, 'desc')
  );

  const [modalState, setModalState] = useState<{ open: boolean; connection?: Connection | null }>({ open: false });
  const [createContainerFor, setCreateContainerFor] = useState<StorageConnection | null>(null);
  const [manualExpanded, setManualExpanded] = useState<Set<string>>(new Set());
  
  // Compute items that should be auto-expanded based on route params
  const routeExpanded = useMemo(() => {
    const keys = new Set<string>();
    const connId = params.connectionId;
    const database = params.database;
    const container = params.container;
    const path = params['_splat'] || '';
    
    if (!connId) return keys;
    
    // Always expand the active connection
    keys.add(connId);
    
    // For database connections: expand active database
    if (database) {
      keys.add(`${connId}:${database}`);
    }
    
    // For storage connections: expand active container
    if (container) {
      keys.add(`container:${connId}:${container}`);
    }
    
    // For storage: expand path segments if there's a path
    if (container && path) {
      const segments = path.split('/').filter(Boolean);
      let currentPath = '';
      for (const segment of segments) {
        currentPath = currentPath ? `${currentPath}/${segment}` : segment;
        // Don't expand the last segment if it's a file (no trailing /)
        if (currentPath !== path.replace(/\/$/, '')) {
          keys.add(`folder:${connId}:${container}:${currentPath}/`);
        }
      }
    }
    
    return keys;
  }, [params]);
  
  // Combine route-based expansion with manual toggles
  const expanded = useMemo(() => {
    return new Set([...routeExpanded, ...manualExpanded]);
  }, [routeExpanded, manualExpanded]);

  const toggle = (key: string) => {
    setManualExpanded((prev) => {
      const next = new Set(prev);
      // If it's in route-expanded and we're toggling, we need to remove it
      // If it's in manual-expanded, toggle it
      if (next.has(key)) {
        next.delete(key);
      } else if (routeExpanded.has(key)) {
        // If it's auto-expanded by route, we can't collapse it via manual toggle
        // unless we track "collapsed" items separately - for now, just keep it expanded
        return prev;
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const saveConnection = (conn: Omit<Connection, 'id' | 'createdAt'>) => {
    if (modalState.connection) {
      // Edit existing connection - update all fields
      connectionsCollection.update(modalState.connection.id, (draft: Connection) => {
        Object.assign(draft, conn);
      });
    } else {
      // Add new connection
      const id = crypto.randomUUID();
      const newConn = { ...conn, id, createdAt: new Date().toISOString() } as Connection;
      connectionsCollection.insert(newConn);
      onSelectConnection(id);
      setManualExpanded((prev) => new Set(prev).add(id));
    }
    setModalState({ open: false });
  };

  const deleteConnection = (id: string) => {
    connectionsCollection.delete(id);
    if (params.connectionId === id) {
      onSelectConnection(null);
    }
  };

  // Get connection label based on type
  const getConnectionLabel = (conn: Connection): string => {
    if (isDatabaseConnection(conn)) {
      const dbConn = conn as DatabaseConnection;
      switch (dbConn.driver) {
        case 'postgres': return 'PG';
        case 'mysql': return 'MY';
        case 'sqlserver': return 'MS';
        case 'oracle': return 'OR';
        case 'sqlite': return 'SQ';
        default: return 'DB';
      }
    } else {
      const storageConn = conn as StorageConnection;
      return storageConn.provider === 's3' ? 'S3' : 'AZ';
    }
  };

  // Get color class for connection type
  const getConnectionColor = (conn: Connection): string => {
    if (isDatabaseConnection(conn)) {
      const dbConn = conn as DatabaseConnection;
      return driverColors[dbConn.driver] || 'text-neutral-500';
    } else {
      const storageConn = conn as StorageConnection;
      return driverColors[storageConn.provider] || 'text-neutral-500';
    }
  };

  return (
    <>
      {/* Connection Modal */}
      {(modalState.open || showAddModal) && (
        <ConnectionModal
          connection={modalState.connection}
          onSave={saveConnection}
          onClose={() => {
            setModalState({ open: false });
            onAddModalClose?.();
          }}
        />
      )}

      {/* Create Container Modal */}
      {createContainerFor && (
        <CreateContainerModal
          connection={createContainerFor}
          onClose={() => setCreateContainerFor(null)}
        />
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
            <div className="space-y-0.5 pb-2">
              {(connections?.data ?? []).map((conn) => {
                      const isExpanded = expanded.has(conn.id);
                      const isDatabase = isDatabaseConnection(conn);
                      const isStorage = isStorageConnection(conn);

                      return (
                        <div key={conn.id}>
                          {/* Connection Row */}
                          <div
                            className="group flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5 cursor-pointer transition-colors"
                            onClick={() => {
                              onSelectConnection(conn.id);
                              toggle(conn.id);
                            }}
                          >
                            {isDatabase ? (
                              <Database className={`w-3 h-3 shrink-0 ${getConnectionColor(conn)}`} />
                            ) : (
                              <Package className={`w-3 h-3 shrink-0 ${getConnectionColor(conn)}`} />
                            )}
                            <span className={`text-[10px] font-semibold shrink-0 uppercase ${getConnectionColor(conn)}`}>
                              {getConnectionLabel(conn)}
                            </span>
                            <span className="text-xs text-neutral-500 dark:text-neutral-400 truncate flex-1">
                              {conn.name}
                            </span>
                            <div className="flex items-center gap-0.5">
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

                          {/* Nested Browser - Database */}
                          {isExpanded && isDatabase && (
                            <div className="ml-4">
                              <DatabaseBrowser
                                connection={conn as DatabaseConnection}
                                expanded={expanded}
                                onToggle={toggle}
                                onSelectDatabase={(db) => onSelectDatabase(conn.id, db)}
                                onSelectTable={(db, tbl) => onSelectTable(conn.id, db, tbl)}
                              />
                            </div>
                          )}

                          {/* Nested Browser - Storage */}
                          {isExpanded && isStorage && (
                            <div className="ml-4">
                              <ObjectStorageBrowser
                                connection={conn as StorageConnection}
                                expanded={expanded}
                                onToggle={toggle}
                                onSelectContainer={(container) => onSelectContainer(conn.id, container)}
                                onSelectPath={(container, path) => onSelectPath(conn.id, container, path)}
                                onCreateContainer={() => setCreateContainerFor(conn as StorageConnection)}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
