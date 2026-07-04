import { useState, useMemo } from 'react';
import { Plus, Trash2, Pencil, Database, Package } from 'lucide-react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from '@tanstack/react-db';
import { connectionsCollection } from '../lib/collections';
import { encodePathSegments } from '../lib/adapters';
import { ConnectionModal } from './ConnectionModal';
import { CreateContainerModal } from './CreateContainerModal';
import { DatabaseBrowser } from './DatabaseBrowser';
import { ObjectStorageBrowser } from './ObjectStorageBrowser';
import type { Connection } from '../types';
import { isSQLConnection, isStorageConnection } from '../types';

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
    navigate({ to: `/${connId}/${encodeURIComponent(db)}` });
  };

  const onSelectTable = (connId: string, db: string, tbl: string) => {
    navigate({ to: `/${connId}/${encodeURIComponent(db)}/${encodeURIComponent(tbl)}` });
  };

  const onSelectContainer = (connId: string, cont: string) => {
    navigate({ to: `/${connId}/container/${encodeURIComponent(cont)}` });
  };

  const onSelectPath = (connId: string, cont: string, path: string) => {
    const normalizedPath = path.replace(/^\/+/, '');
    navigate({ to: `/${connId}/container/${encodeURIComponent(cont)}/${encodePathSegments(normalizedPath)}` });
  };

  const connections = useLiveQuery((q) =>
    q.from({ conn: connectionsCollection }).orderBy(({ conn }) => conn.createdAt, 'desc')
  );

  const [modalState, setModalState] = useState<{ open: boolean; connection?: Connection | null }>({ open: false });
  const [createContainerFor, setCreateContainerFor] = useState<Connection | null>(null);
  // Manual expand/collapse overrides on top of route-driven expansion (true = open, false = closed)
  const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map());
  
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
  
  // When navigation newly expands a key, drop a stale manual collapse for it
  // so the active route is never hidden (adjust during render)
  const [prevRouteExpanded, setPrevRouteExpanded] = useState(routeExpanded);
  if (routeExpanded !== prevRouteExpanded) {
    setPrevRouteExpanded(routeExpanded);
    const stale = [...routeExpanded].filter(
      (key) => !prevRouteExpanded.has(key) && overrides.get(key) === false
    );
    if (stale.length > 0) {
      setOverrides((prev) => {
        const next = new Map(prev);
        stale.forEach((key) => next.delete(key));
        return next;
      });
    }
  }

  // Route-based expansion with manual overrides applied on top
  const expanded = useMemo(() => {
    const keys = new Set(routeExpanded);
    for (const [key, open] of overrides) {
      if (open) {
        keys.add(key);
      } else {
        keys.delete(key);
      }
    }
    return keys;
  }, [routeExpanded, overrides]);

  const toggle = (key: string) => {
    const open = !expanded.has(key);
    setOverrides((prev) => new Map(prev).set(key, open));
  };

  // Sync the local collection after the modal has already persisted the
  // connection on the server (write*, not insert/update, to avoid re-posting)
  const saveConnection = async (conn: Connection): Promise<Connection> => {
    if (modalState.connection) {
      connectionsCollection.utils.writeUpdate(conn);
    } else {
      connectionsCollection.utils.writeInsert(conn);
      onSelectConnection(conn.id);
      setOverrides((prev) => new Map(prev).set(conn.id, true));
    }
    return conn;
  };

  const deleteConnection = async (id: string): Promise<void> => {
    connectionsCollection.delete(id);
    if (params.connectionId === id) {
      onSelectConnection(null);
    }
  };

  // Get connection label based on type
  const getConnectionLabel = (conn: Connection): string => {
    if (isSQLConnection(conn) && conn.sql) {
      switch (conn.sql.driver) {
        case 'postgres': return 'PG';
        case 'mysql': return 'MY';
        case 'sqlserver': return 'MS';
        case 'oracle': return 'OR';
        case 'sqlite': return 'SQ';
        default: return 'DB';
      }
    } else if (conn.amazonS3) {
      return 'S3';
    } else if (conn.azureBlob) {
      return 'AZ';
    }
    return '??';
  };

  // Get color class for connection type
  const getConnectionColor = (conn: Connection): string => {
    if (isSQLConnection(conn) && conn.sql) {
      return driverColors[conn.sql.driver] || 'text-neutral-500';
    } else if (conn.amazonS3) {
      return driverColors['s3'] || 'text-neutral-500';
    } else if (conn.azureBlob) {
      return driverColors['azure-blob'] || 'text-neutral-500';
    }
    return 'text-neutral-500';
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
                      const isDatabase = isSQLConnection(conn);
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
                                connection={conn}
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
                                connection={conn}
                                expanded={expanded}
                                onToggle={toggle}
                                onSelectContainer={(container) => onSelectContainer(conn.id, container)}
                                onSelectPath={(container, path) => onSelectPath(conn.id, container, path)}
                                onCreateContainer={() => setCreateContainerFor(conn)}
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
