import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { 
  File, 
  Folder, 
  Image, 
  FileText, 
  FileCode, 
  Archive,
  ChevronRight,
  ArrowUp,
  Loader2,
  Upload,
  Trash2,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown
} from 'lucide-react';
import { 
  listObjects, 
  deleteObjects,
  deletePrefix,
  formatFileSize, 
  getFileIconType, 
  getDisplayName,
  getParentPath
} from '../lib/adapters/storage';
import { ObjectDetail } from './ObjectDetail';
import { UploadModal } from './UploadModal';
import type { StorageConnection } from '../types';

interface ObjectStorageViewProps {
  connection: StorageConnection;
  container: string;
  path: string;
  onNavigate: (container: string, path: string) => void;
}

const iconMap = {
  folder: Folder,
  image: Image,
  document: FileText,
  code: FileCode,
  archive: Archive,
  file: File,
};

export function ObjectStorageView({ connection, container, path, onNavigate }: ObjectStorageViewProps) {
  const queryClient = useQueryClient();
  const [selectedObject, setSelectedObject] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Normalize path: ensure it ends with '/' when non-empty (for folder prefix listing)
  const normalizedPath = path && !path.endsWith('/') ? path + '/' : path;

  // Fetch objects for current path
  const { data: objects, isLoading, error } = useQuery({
    queryKey: ['storage-objects', connection.id, container, normalizedPath],
    queryFn: () => listObjects(connection, container, { prefix: normalizedPath, delimiter: '/' }),
    enabled: !!connection && !!container,
  });

  // Delete mutation for files
  const deleteFileMutation = useMutation({
    mutationFn: (key: string) => deleteObjects(connection, container, [key]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storage-objects', connection.id, container] });
      setSelectedObject(null);
    },
  });

  // Delete mutation for folders (prefixes)
  const deleteFolderMutation = useMutation({
    mutationFn: (prefix: string) => deletePrefix(connection, container, prefix),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storage-objects', connection.id, container] });
    },
  });

  const handleDeleteItem = (item: DisplayItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const name = item.name.replace(/\/$/, '') || '/';
    const message = item.isFolder
      ? `Delete folder "${name}" and all its contents?`
      : `Delete "${name}"?`;
    
    if (confirm(message)) {
      if (item.isFolder) {
        // For folders, we need to delete all objects with this prefix
        // Special case: if prefix is just "/", it might be a folder marker object
        const key = item.key;
        if (key === '/' || key === '') {
          // This is likely a folder marker object, delete it directly
          deleteFileMutation.mutate(key || '/');
        } else {
          deleteFolderMutation.mutate(key);
        }
      } else {
        deleteFileMutation.mutate(item.key);
      }
    }
  };

  const isDeleting = deleteFileMutation.isPending || deleteFolderMutation.isPending;

  // Combine prefixes (folders) and objects for display
  const items = useMemo(() => {
    if (!objects) return [];

    const folders: DisplayItem[] = objects.prefixes.map((prefix) => ({
      key: prefix,
      name: getDisplayName(prefix),
      isFolder: true,
      size: 0,
      lastModified: '',
    }));

    const files: DisplayItem[] = objects.objects
      .filter((obj) => !obj.isFolder) // Filter out folder markers
      .map((obj) => ({
        key: obj.key,
        name: obj.name,
        isFolder: false,
        size: obj.size,
        lastModified: obj.lastModified,
        contentType: obj.contentType,
      }));

    return [...folders, ...files];
  }, [objects]);

  const handleItemClick = (item: DisplayItem) => {
    if (item.isFolder) {
      onNavigate(container, item.key);
      setSelectedObject(null);
    } else {
      setSelectedObject(item.key);
    }
  };

  const handleNavigateUp = () => {
    const parentPath = getParentPath(path);
    onNavigate(container, parentPath ? parentPath + '/' : '');
    setSelectedObject(null);
  };

  // Build breadcrumb path segments
  const pathSegments = useMemo(() => {
    const segments: { label: string; path: string }[] = [
      { label: container, path: '' }
    ];
    
    if (path) {
      const parts = path.split('/').filter(Boolean);
      let currentPath = '';
      for (const part of parts) {
        currentPath += part + '/';
        segments.push({ label: part, path: currentPath });
      }
    }
    
    return segments;
  }, [container, path]);

  const providerLabel = connection.provider === 's3' ? 'S3' : 'Azure Blob';

  return (
    <div className="flex-1 flex gap-2 min-h-0">
      {/* Objects List/Grid */}
      <div className="flex-1 bg-white dark:bg-[#1a1a1a]/60 border border-neutral-200 dark:border-white/8 rounded-xl overflow-hidden flex flex-col min-w-0">
        {/* Header */}
        <div className="px-4 py-3 border-b border-neutral-200 dark:border-white/8">
          <div className="flex items-center justify-between">
            {/* Breadcrumb */}
            <div className="flex items-center gap-1 text-sm overflow-x-auto">
              <span className="text-neutral-400 dark:text-neutral-500 shrink-0">{providerLabel}:</span>
              {pathSegments.map((segment, i) => (
                <span key={segment.path} className="flex items-center shrink-0">
                  {i > 0 && <ChevronRight className="w-4 h-4 text-neutral-400 mx-1" />}
                  <button
                    onClick={() => onNavigate(container, segment.path)}
                    className={`hover:text-blue-500 transition-colors ${
                      i === pathSegments.length - 1
                        ? 'text-neutral-700 dark:text-neutral-200 font-medium'
                        : 'text-neutral-500 dark:text-neutral-400'
                    }`}
                  >
                    {segment.label}
                  </button>
                </span>
              ))}
            </div>

            {/* Upload Button */}
            <div className="ml-4 shrink-0">
              <button
                onClick={() => setShowUploadModal(true)}
                className="px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium flex items-center gap-2 transition-colors"
                title="Upload file"
              >
                <Upload className="w-3.5 h-3.5" />
                Upload
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto" onClick={() => setSelectedObject(null)}>
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 text-neutral-400 animate-spin" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full text-red-500 text-sm">
              Failed to load objects
            </div>
          ) : items.length === 0 ? (
            <div className="flex items-center justify-center h-full text-neutral-400 dark:text-neutral-600 text-sm">
              This folder is empty
            </div>
          ) : (
            <ObjectListView
              items={items}
              selectedKey={selectedObject}
              path={path}
              onItemClick={handleItemClick}
              onNavigateUp={handleNavigateUp}
              onDeleteItem={handleDeleteItem}
              isDeleting={isDeleting}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-neutral-200 dark:border-white/8 text-xs text-neutral-400 dark:text-neutral-500">
          {items.length} {items.length === 1 ? 'item' : 'items'}
          {objects?.isTruncated && ' (truncated)'}
        </div>
      </div>

      {/* Object Detail Panel - only show when a file is selected */}
      {selectedObject && (
        <div className="w-80 shrink-0">
          <ObjectDetail
            connection={connection}
            container={container}
            objectKey={selectedObject}
            onClose={() => setSelectedObject(null)}
          />
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <UploadModal
          connection={connection}
          container={container}
          currentPath={normalizedPath}
          onClose={() => setShowUploadModal(false)}
        />
      )}
    </div>
  );
}

// Types
interface DisplayItem {
  key: string;
  name: string;
  isFolder: boolean;
  size: number;
  lastModified: string;
  contentType?: string;
}

// List View
interface ObjectListViewProps {
  items: DisplayItem[];
  selectedKey: string | null;
  path: string;
  onItemClick: (item: DisplayItem) => void;
  onNavigateUp: () => void;
  onDeleteItem: (item: DisplayItem, e: React.MouseEvent) => void;
  isDeleting: boolean;
}

function ObjectListView({ items, selectedKey, path, onItemClick, onNavigateUp, onDeleteItem, isDeleting }: ObjectListViewProps) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo<ColumnDef<DisplayItem>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => {
          return (
            <button
              className="flex items-center gap-1 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            >
              Name
              {column.getIsSorted() === 'asc' ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : column.getIsSorted() === 'desc' ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronsUpDown className="w-3.5 h-3.5 opacity-50" />
              )}
            </button>
          );
        },
        cell: ({ row }) => {
          const item = row.original;
          const iconType = item.isFolder ? 'folder' : getFileIconType(item.key);
          const Icon = iconMap[iconType];
          const isSelected = selectedKey === item.key;

          return (
            <div className="flex items-center gap-2">
              <Icon className={`w-4 h-4 ${item.isFolder ? 'text-yellow-500' : 'text-neutral-400'}`} />
              <span className={`truncate ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-neutral-700 dark:text-neutral-200'}`}>
                {item.name}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: 'size',
        header: ({ column }) => {
          return (
            <button
              className="flex items-center gap-1 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors ml-auto"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            >
              Size
              {column.getIsSorted() === 'asc' ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : column.getIsSorted() === 'desc' ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronsUpDown className="w-3.5 h-3.5 opacity-50" />
              )}
            </button>
          );
        },
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="text-right text-neutral-500 dark:text-neutral-400">
              {item.isFolder ? '-' : formatFileSize(item.size)}
            </div>
          );
        },
        size: 100,
      },
      {
        accessorKey: 'lastModified',
        header: ({ column }) => {
          return (
            <button
              className="flex items-center gap-1 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors ml-auto"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            >
              Modified
              {column.getIsSorted() === 'asc' ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : column.getIsSorted() === 'desc' ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronsUpDown className="w-3.5 h-3.5 opacity-50" />
              )}
            </button>
          );
        },
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="text-right text-neutral-500 dark:text-neutral-400">
              {item.lastModified ? formatDate(item.lastModified) : '-'}
            </div>
          );
        },
        size: 160,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const item = row.original;
          return (
            <button
              onClick={(e) => onDeleteItem(item, e)}
              disabled={isDeleting}
              className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-500/10 transition-all disabled:opacity-50"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-500" />
            </button>
          );
        },
        size: 40,
      },
    ],
    [selectedKey, onDeleteItem, isDeleting]
  );

  const table = useReactTable({
    data: items,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-neutral-50 dark:bg-[#1a1a1a] z-10">
        {table.getHeaderGroups().map((headerGroup) => (
          <tr key={headerGroup.id} className="border-b border-neutral-200 dark:border-white/8">
            {headerGroup.headers.map((header) => (
              <th
                key={header.id}
                className="px-4 py-2 text-left font-medium text-neutral-500 dark:text-neutral-400"
                style={{ width: header.getSize() }}
              >
                {header.isPlaceholder
                  ? null
                  : flexRender(header.column.columnDef.header, header.getContext())}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {/* Parent directory row */}
        {path && (
          <tr
            className="hover:bg-neutral-50 dark:hover:bg-white/5 cursor-pointer border-b border-neutral-100 dark:border-white/5"
            onClick={(e) => {
              e.stopPropagation();
              onNavigateUp();
            }}
          >
            <td className="px-4 py-2" colSpan={4}>
              <div className="flex items-center gap-2">
                <ArrowUp className="w-4 h-4 text-neutral-400" />
                <span className="text-neutral-500 dark:text-neutral-400">..</span>
              </div>
            </td>
          </tr>
        )}
        {/* Object rows */}
        {table.getRowModel().rows.map((row) => {
          const isSelected = selectedKey === row.original.key;
          return (
            <tr
              key={row.id}
              className={`group cursor-pointer border-b border-neutral-100 dark:border-white/5 ${
                isSelected ? 'bg-blue-50 dark:bg-blue-500/10' : 'hover:bg-neutral-50 dark:hover:bg-white/5'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                onItemClick(row.original);
              }}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-4 py-2">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

// Empty state component for when no container is selected
export function ObjectStorageEmpty() {
  return (
    <div className="flex-1 bg-white dark:bg-[#1a1a1a]/60 border border-neutral-200 dark:border-white/8 rounded-xl flex items-center justify-center">
      <div className="text-center">
        <Folder className="w-16 h-16 text-neutral-300 dark:text-neutral-700 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-neutral-600 dark:text-neutral-400 mb-2">
          No container selected
        </h3>
        <p className="text-sm text-neutral-400 dark:text-neutral-600">
          Select a container from the sidebar to browse objects
        </p>
      </div>
    </div>
  );
}
