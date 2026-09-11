import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Folder,
  File,
  ChevronRight,
  ArrowUp,
  Loader2,
  Upload,
  Trash2,
  RefreshCw,
  Search,
  Plus,
  Box,
  ArrowDown,
} from "lucide-react";
import {
  listContainers,
  deleteObjects,
  deletePrefix,
  formatFileSize,
  getDisplayName,
  getParentPath,
} from "../lib/adapters/storage";
import { useStorageListing } from "../lib/useStorageListing";
import { ObjectDetail } from "./ObjectDetail";
import { UploadModal } from "./UploadModal";
import { CreateContainerModal } from "./CreateContainerModal";
import type { Connection } from "../types";

interface ObjectStorageViewProps {
  connection: Connection;
  container: string;
  path: string;
  onNavigate: (container: string, path: string) => void;
}
interface Item {
  key: string;
  name: string;
  isFolder: boolean;
  size: number;
  lastModified: string;
}
export function ObjectStorageView({
  connection,
  container,
  path,
  onNavigate,
}: ObjectStorageViewProps) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null),
    [upload, setUpload] = useState(false),
    [deleting, setDeleting] = useState<Item | null>(null);
  const [draft, setDraft] = useState(""),
    [search, setSearch] = useState(""),
    [recursive, setRecursive] = useState(false),
    [kind, setKind] = useState("all");
  const [sort, setSort] = useState<{
    column: "name" | "size" | "lastModified";
    desc: boolean;
  }>({ column: "name", desc: false });
  const prefix = path && !path.endsWith("/") ? `${path}/` : path;
  const listing = useStorageListing(
    connection.id,
    container,
    prefix + search,
    recursive,
  );
  const items: Item[] = [
    ...new Set(listing.data?.pages.flatMap((p) => p.prefixes) ?? []),
  ].map((key) => ({
    key,
    name: getDisplayName(key),
    isFolder: true,
    size: 0,
    lastModified: "",
  }));
  const objects = new Map(
    listing.data?.pages
      .flatMap((p) => p.objects)
      .filter((o) => !o.isFolder)
      .map((o) => [o.key, o]),
  );
  items.push(
    ...[...objects.values()].map((object) => ({
      ...object,
      name: recursive ? object.key.slice(prefix.length) : object.name,
    })),
  );
  const visible = items
    .filter(
      (item) =>
        kind === "all" || (kind === "folders" ? item.isFolder : !item.isFolder),
    )
    .sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      const order =
        sort.column === "size"
          ? a.size - b.size
          : a[sort.column].localeCompare(b[sort.column], undefined, {
              numeric: true,
            });
      return sort.desc ? -order : order;
    });
  const remove = useMutation({
    mutationFn: (item: Item) =>
      item.isFolder
        ? deletePrefix(connection.id, container, item.key)
        : deleteObjects(connection.id, container, [item.key]),
    onSuccess: () => {
      setDeleting(null);
      setSelected(null);
      void queryClient.invalidateQueries({
        predicate: (q) =>
          ["storage-objects", "storage-tree"].includes(String(q.queryKey[0])) &&
          q.queryKey[1] === connection.id &&
          q.queryKey[2] === container,
      });
    },
  });
  const navigate = (next: string) => {
    setSelected(null);
    setDeleting(null);
    onNavigate(container, next);
  };
  return (
    <main className="workspace flex-1 min-w-0 flex flex-col gap-2">
      <header className="workspace-header">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <span>{connection.name}</span>
          <ChevronRight size={12} />
          <button onClick={() => navigate("")}>{container}</button>
          {prefix
            .split("/")
            .filter(Boolean)
            .map((part, index, parts) => (
              <span className="flex items-center gap-2 min-w-0" key={index}>
                <ChevronRight size={12} />
                <button
                  onClick={() =>
                    navigate(parts.slice(0, index + 1).join("/") + "/")
                  }
                >
                  {part}
                </button>
              </span>
            ))}
        </nav>
      </header>
      <div className="panel flex flex-col flex-1 min-h-0">
        <form
          className="toolbar flex-wrap"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(draft);
            setSelected(null);
          }}
        >
          <button
            className="icon-button"
            type="button"
            aria-label="Parent folder"
            disabled={!prefix}
            onClick={() => navigate(getParentPath(prefix))}
          >
            <ArrowUp size={15} />
          </button>
          <label className="search-field">
            <Search size={14} />
            <input
              aria-label="Object name prefix"
              placeholder="Search by name prefix…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </label>
          {draft !== search && <button className="text-button">Apply</button>}
          {search && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setDraft("");
                setSearch("");
              }}
            >
              Clear
            </button>
          )}
          <label className="inline-check">
            <input
              type="checkbox"
              checked={recursive}
              onChange={(e) => setRecursive(e.target.checked)}
            />
            Subfolders
          </label>
          <select
            className="inline-select"
            aria-label="Object type"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="all">All items</option>
            <option value="files">Files</option>
            <option value="folders">Folders</option>
          </select>
          <button
            className="icon-button ml-auto"
            type="button"
            aria-label="Refresh objects"
            disabled={listing.isFetching}
            onClick={() => void listing.refetch()}
          >
            <RefreshCw
              size={14}
              className={listing.isFetching ? "animate-spin" : ""}
            />
          </button>
          <button
            className="text-button"
            type="button"
            onClick={() => setUpload(true)}
          >
            <Upload size={14} />
            Upload
          </button>
        </form>
        {deleting && (
          <div className="inline-confirm">
            <span>
              Delete <strong>{deleting.name}</strong>
              {deleting.isFolder ? " and everything inside this folder" : ""}?
            </span>
            <button
              className="text-button danger"
              disabled={remove.isPending}
              onClick={() => remove.mutate(deleting)}
            >
              {remove.isPending ? "Deleting…" : "Delete"}
            </button>
            <button
              className="text-button"
              disabled={remove.isPending}
              onClick={() => {
                setDeleting(null);
                remove.reset();
              }}
            >
              Cancel
            </button>
            {remove.error && (
              <p className="danger" role="alert">
                {remove.error.message}
              </p>
            )}
          </div>
        )}
        {listing.error && (
          <p className="error-banner" role="alert">
            {listing.error.message}
          </p>
        )}
        <div className="flex flex-1 min-h-0 relative">
          <div className="overflow-auto flex-1 min-w-0">
            <table className="storage-grid">
              <thead>
                <tr>
                  {(["name", "size", "lastModified"] as const).map((column) => (
                    <th
                      key={column}
                      aria-sort={
                        sort.column === column
                          ? sort.desc
                            ? "descending"
                            : "ascending"
                          : "none"
                      }
                    >
                      <button
                        className="column-title"
                        onClick={() =>
                          setSort({
                            column,
                            desc: sort.column === column && !sort.desc,
                          })
                        }
                      >
                        {column === "lastModified"
                          ? "Modified"
                          : column === "name"
                            ? "Name"
                            : "Size"}
                        {sort.column === column &&
                          (sort.desc ? (
                            <ArrowDown size={12} />
                          ) : (
                            <ArrowUp size={12} />
                          ))}
                      </button>
                    </th>
                  ))}
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr
                    key={item.key}
                    className={selected === item.key ? "active" : ""}
                  >
                    <td>
                      <button
                        className="object-name"
                        title={item.key}
                        onClick={() =>
                          item.isFolder
                            ? navigate(item.key)
                            : setSelected(item.key)
                        }
                      >
                        {item.isFolder ? (
                          <Folder size={15} />
                        ) : (
                          <File size={15} />
                        )}
                        <span className="truncate">{item.name}</span>
                      </button>
                    </td>
                    <td className="muted tabular-nums">
                      {item.isFolder ? "—" : formatFileSize(item.size)}
                    </td>
                    <td className="muted whitespace-nowrap">
                      {item.lastModified
                        ? new Date(item.lastModified).toLocaleDateString()
                        : "—"}
                    </td>
                    <td>
                      <button
                        className="icon-button quiet"
                        aria-label={`Delete ${item.name}`}
                        disabled={remove.isPending}
                        onClick={() => {
                          setDeleting(item);
                          remove.reset();
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visible.length && (
              <div className="empty-state">
                {listing.isPending ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Loading objects…
                  </>
                ) : search || kind !== "all" ? (
                  "No matching items loaded."
                ) : (
                  "This folder is empty. Upload a file to get started."
                )}
              </div>
            )}
          </div>
          {selected && (
            <ObjectDetail
              key={selected}
              connection={connection}
              container={container}
              objectKey={selected}
              onClose={() => setSelected(null)}
            />
          )}
        </div>
        <div className="results-footer">
          <span className="muted">
            {visible.length} of {items.length} loaded
          </span>
          {listing.hasNextPage ? (
            <button
              className="text-button"
              onClick={() => void listing.fetchNextPage()}
              disabled={listing.isFetchingNextPage}
            >
              {listing.isFetchingNextPage ? "Loading…" : "Load more"}
            </button>
          ) : (
            !listing.isPending && (
              <span className="muted">All items loaded</span>
            )
          )}
          <span className="muted text-xs ml-auto">
            Sort and type filter use loaded items
          </span>
        </div>
      </div>
      {upload && (
        <UploadModal
          connection={connection}
          container={container}
          currentPath={prefix}
          onClose={() => setUpload(false)}
        />
      )}
    </main>
  );
}
export function StorageLanding({
  connection,
  onNavigate,
}: {
  connection: Connection;
  onNavigate: (container: string, path: string) => void;
}) {
  const containers = useQuery({
    queryKey: ["storage-containers", connection.id],
    queryFn: () => listContainers(connection.id),
  });
  const [create, setCreate] = useState(false),
    [search, setSearch] = useState("");
  const names =
    containers.data?.filter((c) =>
      c.name.toLowerCase().includes(search.toLowerCase()),
    ) ?? [];
  return (
    <main className="workspace flex-1 min-w-0 flex flex-col gap-2">
      <header className="workspace-header">
        {connection.name}
        <span className="muted ml-auto text-xs">
          {connection.amazonS3 ? "S3" : "Azure Blob"}
        </span>
      </header>
      <section className="panel flex-1 min-h-0 overflow-auto p-6">
        <h1 className="font-medium text-base mb-2">
          {connection.amazonS3 ? "Buckets" : "Containers"}
        </h1>
        <p className="muted mb-5">
          Choose a container to browse, upload, or manage objects.
        </p>
        <div className="flex items-center gap-3 mb-4">
          <label className="search-field">
            <Search size={14} />
            <input
              aria-label="Find container"
              placeholder="Find a container…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <button className="text-button" onClick={() => setCreate(true)}>
            <Plus size={14} />
            New {connection.amazonS3 ? "bucket" : "container"}
          </button>
          <button
            className="icon-button"
            aria-label="Refresh containers"
            onClick={() => void containers.refetch()}
          >
            <RefreshCw size={14} />
          </button>
        </div>
        {containers.error && (
          <p className="error-banner" role="alert">
            {containers.error.message}
          </p>
        )}
        <div className="landing-list">
          {names.map((container) => (
            <button
              key={container.name}
              onClick={() => onNavigate(container.name, "")}
            >
              <Box size={15} />
              <span className="truncate">{container.name}</span>
              <ChevronRight size={12} className="ml-auto" />
            </button>
          ))}
        </div>
        {!names.length && (
          <p className="muted">
            {containers.isPending
              ? "Loading containers…"
              : search
                ? "No matching containers."
                : "No containers yet."}
          </p>
        )}
      </section>
      {create && (
        <CreateContainerModal
          connection={connection}
          onClose={() => setCreate(false)}
        />
      )}
    </main>
  );
}
