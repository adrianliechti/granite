import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { Folder, ChevronRight, ChevronDown, Box, Plus } from "lucide-react";
import { listContainers, getDisplayName } from "../lib/adapters/storage";
import { useStorageListing } from "../lib/useStorageListing";
import type { Connection } from "../types";

interface ObjectStorageBrowserProps {
  connection: Connection;
  expanded: Set<string>;
  onToggle: (key: string) => void;
  onSelectContainer: (container: string) => void;
  onSelectPath: (container: string, path: string) => void;
  onCreateContainer: () => void;
}
function Folders({
  connection,
  container,
  prefix,
  expanded,
  onToggle,
  onSelectPath,
}: Omit<
  ObjectStorageBrowserProps,
  "onSelectContainer" | "onCreateContainer"
> & { container: string; prefix: string }) {
  const params = useParams({ strict: false });
  const listing = useStorageListing(
    connection.id,
    container,
    prefix,
    false,
    true,
  );
  const prefixes = [
    ...new Set(listing.data?.pages.flatMap((page) => page.prefixes) ?? []),
  ];
  return (
    <div className="tree-children">
      {prefixes.map((name) => {
        const key = `folder:${connection.id}:${container}:${name}`,
          open = expanded.has(key);
        const active =
          params.connectionId === connection.id &&
          params.container === container &&
          (params["_splat"] ?? "").replace(/\/$/, "") ===
            name.replace(/\/$/, "");
        return (
          <div key={name}>
            <div className={`tree-row ${active ? "active" : ""}`}>
              <button
                className="tree-toggle"
                aria-label={`${open ? "Collapse" : "Expand"} ${getDisplayName(name)}`}
                aria-expanded={open}
                onClick={() => onToggle(key)}
              >
                {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
              <button
                className="tree-label"
                onClick={() => onSelectPath(container, name)}
              >
                <Folder size={13} />
                <span>{getDisplayName(name)}</span>
              </button>
            </div>
            {open && (
              <Folders
                connection={connection}
                container={container}
                prefix={name}
                expanded={expanded}
                onToggle={onToggle}
                onSelectPath={onSelectPath}
              />
            )}
          </div>
        );
      })}
      {listing.error && (
        <p role="alert" className="tree-message danger">
          {listing.error.message}
        </p>
      )}
      {listing.hasNextPage && (
        <button
          className="text-button text-xs"
          disabled={listing.isFetchingNextPage}
          onClick={() => void listing.fetchNextPage()}
        >
          {listing.isFetchingNextPage ? "Loading…" : "Load more folders"}
        </button>
      )}
    </div>
  );
}
export function ObjectStorageBrowser(props: ObjectStorageBrowserProps) {
  const {
    connection,
    expanded,
    onToggle,
    onSelectContainer,
    onCreateContainer,
  } = props;
  const params = useParams({ strict: false });
  const containers = useQuery({
    queryKey: ["storage-containers", connection.id],
    queryFn: () => listContainers(connection.id),
  });
  return (
    <>
      {containers.data?.map((container) => {
        const key = `container:${connection.id}:${container.name}`,
          open = expanded.has(key);
        const active =
          params.connectionId === connection.id &&
          params.container === container.name;
        return (
          <div key={container.name}>
            <div className={`tree-row ${active ? "active" : ""}`}>
              <button
                className="tree-toggle"
                aria-label={`${open ? "Collapse" : "Expand"} ${container.name}`}
                aria-expanded={open}
                onClick={() => onToggle(key)}
              >
                {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
              <button
                className="tree-label"
                onClick={() => onSelectContainer(container.name)}
              >
                <Box size={13} />
                <span>{container.name}</span>
              </button>
            </div>
            {open && (
              <Folders {...props} container={container.name} prefix="" />
            )}
          </div>
        );
      })}
      {containers.error ? (
        <p role="alert" className="tree-message danger">
          {containers.error.message}
        </p>
      ) : (
        !containers.data?.length && (
          <p className="tree-message">
            {containers.isPending ? "Loading containers…" : "No containers"}
          </p>
        )
      )}
      <button className="tree-label muted" onClick={onCreateContainer}>
        <Plus size={13} />
        <span>New {connection.amazonS3 ? "bucket" : "container"}</span>
      </button>
    </>
  );
}
