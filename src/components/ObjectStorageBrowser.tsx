import { useQuery } from '@tanstack/react-query';
import { Folder, ChevronRight, ChevronDown, Box, Plus } from 'lucide-react';
import { listContainers, listObjects, getDisplayName } from '../lib/adapters/storage';
import type { StorageConnection } from '../types';

interface ObjectStorageBrowserProps {
  connection: StorageConnection;
  activeContainer: string | null;
  activePath: string;
  expanded: Set<string>;
  onToggle: (key: string) => void;
  onSelectContainer: (container: string) => void;
  onSelectPath: (container: string, path: string) => void;
  onCreateContainer: () => void;
}

export function ObjectStorageBrowser({
  connection,
  activeContainer,
  activePath,
  expanded,
  onToggle,
  onSelectContainer,
  onSelectPath,
  onCreateContainer,
}: ObjectStorageBrowserProps) {
  // Fetch containers
  const { data: containers, isLoading: containersLoading } = useQuery({
    queryKey: ['storage-containers', connection.id],
    queryFn: () => listContainers(connection),
    enabled: !!connection,
  });

  // Fetch objects for expanded folders
  const activeContainerExpanded = activeContainer ? expanded.has(`container:${activeContainer}`) : false;
  const { data: rootObjects } = useQuery({
    queryKey: ['storage-objects', connection.id, activeContainer, ''],
    queryFn: () => listObjects(connection, activeContainer!, { prefix: '', delimiter: '/' }),
    enabled: !!connection && !!activeContainer && activeContainerExpanded,
  });

  const containerLabel = 'Containers';
  const containerSingular = 'Container';

  return (
    <div className="space-y-0.5">
      {containersLoading ? (
        <div className="px-3 py-1.5 text-xs text-neutral-400 dark:text-neutral-600">
          Loading {containerLabel.toLowerCase()}...
        </div>
      ) : containers && containers.length > 0 ? (
        containers.map((container) => {
          const isContainerActive = activeContainer === container.name;
          const isContainerExpanded = expanded.has(`container:${container.name}`);

          return (
            <div key={container.name}>
              {/* Container */}
              <div
                className={`group flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
                  isContainerActive
                    ? 'bg-blue-500/10 dark:bg-blue-500/20'
                    : 'hover:bg-neutral-100 dark:hover:bg-white/5'
                }`}
                onClick={() => {
                  onToggle(`container:${container.name}`);
                  onSelectContainer(container.name);
                }}
              >
                {isContainerExpanded ? (
                  <ChevronDown className="w-3 h-3 text-neutral-400 shrink-0" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-neutral-400 shrink-0" />
                )}
                <Box className={`w-3.5 h-3.5 shrink-0 ${
                  isContainerActive ? 'text-blue-500' : 'text-neutral-400'
                }`} />
                <span className={`text-xs truncate flex-1 ${
                  isContainerActive ? 'text-blue-600 dark:text-blue-400' : 'text-neutral-500 dark:text-neutral-400'
                }`}>
                  {container.name}
                </span>
              </div>

              {/* Folder tree inside container */}
              {isContainerExpanded && isContainerActive && rootObjects && (
                <div className="ml-4">
                  <FolderTree
                    connection={connection}
                    container={container.name}
                    prefixes={rootObjects.prefixes}
                    activePath={activePath}
                    expanded={expanded}
                    onToggle={onToggle}
                    onSelectPath={onSelectPath}
                    depth={0}
                  />
                </div>
              )}
            </div>
          );
        })
      ) : (
        <div className="px-3 py-1.5 text-xs text-neutral-400 dark:text-neutral-600">
          No {containerLabel.toLowerCase()} found
        </div>
      )}

      {/* Create Container Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onCreateContainer();
        }}
        className="flex items-center gap-2 px-3 py-1.5 w-full rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5 cursor-pointer transition-colors text-left"
      >
        <Plus className="w-3 h-3 text-neutral-400 dark:text-neutral-500" />
        <span className="text-xs text-neutral-400 dark:text-neutral-500">
          New {containerSingular.toLowerCase()}
        </span>
      </button>
    </div>
  );
}

// Recursive folder tree component
interface FolderTreeProps {
  connection: StorageConnection;
  container: string;
  prefixes: string[];
  activePath: string;
  expanded: Set<string>;
  onToggle: (key: string) => void;
  onSelectPath: (container: string, path: string) => void;
  depth: number;
}

function FolderTree({
  connection,
  container,
  prefixes,
  activePath,
  expanded,
  onToggle,
  onSelectPath,
  depth,
}: FolderTreeProps) {
  if (prefixes.length === 0) {
    return null;
  }

  return (
    <div className="space-y-0.5">
      {prefixes.map((prefix) => (
        <FolderItem
          key={prefix}
          connection={connection}
          container={container}
          prefix={prefix}
          activePath={activePath}
          expanded={expanded}
          onToggle={onToggle}
          onSelectPath={onSelectPath}
          depth={depth}
        />
      ))}
    </div>
  );
}

interface FolderItemProps {
  connection: StorageConnection;
  container: string;
  prefix: string;
  activePath: string;
  expanded: Set<string>;
  onToggle: (key: string) => void;
  onSelectPath: (container: string, path: string) => void;
  depth: number;
}

function FolderItem({
  connection,
  container,
  prefix,
  activePath,
  expanded,
  onToggle,
  onSelectPath,
  depth,
}: FolderItemProps) {
  const folderKey = `folder:${container}:${prefix}`;
  const isExpanded = expanded.has(folderKey);
  // Normalize both paths for comparison (remove leading slashes)
  const normalizedPrefix = prefix.replace(/^\/+/, '');
  const normalizedActivePath = activePath.replace(/^\/+/, '');
  const isActive = normalizedActivePath === normalizedPrefix;

  // Fetch subfolders when expanded
  const { data: subObjects } = useQuery({
    queryKey: ['storage-objects', connection.id, container, prefix],
    queryFn: () => listObjects(connection, container, { prefix, delimiter: '/' }),
    enabled: isExpanded,
  });

  const displayName = getDisplayName(prefix);

  return (
    <div>
      <div
        className={`group flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
          isActive
            ? 'bg-blue-500/10 dark:bg-blue-500/20'
            : 'hover:bg-neutral-100 dark:hover:bg-white/5'
        }`}
        onClick={() => {
          onToggle(folderKey);
          onSelectPath(container, prefix);
        }}
      >
        {isExpanded ? (
          <ChevronDown className="w-3 h-3 text-neutral-400 shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-neutral-400 shrink-0" />
        )}
        <Folder className={`w-3.5 h-3.5 shrink-0 ${
          isActive ? 'text-blue-500' : 'text-neutral-400'
        }`} />
        <span className={`text-xs truncate flex-1 ${
          isActive ? 'text-blue-600 dark:text-blue-400' : 'text-neutral-500 dark:text-neutral-400'
        }`}>
          {displayName}
        </span>
      </div>

      {/* Nested folders */}
      {isExpanded && subObjects && subObjects.prefixes.length > 0 && (
        <div className="ml-4">
          <FolderTree
            connection={connection}
            container={container}
            prefixes={subObjects.prefixes}
            activePath={activePath}
            expanded={expanded}
            onToggle={onToggle}
            onSelectPath={onSelectPath}
            depth={depth + 1}
          />
        </div>
      )}
    </div>
  );
}
