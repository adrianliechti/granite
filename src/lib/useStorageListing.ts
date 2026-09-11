import { useInfiniteQuery } from "@tanstack/react-query";
import { listObjects } from "./adapters/storage";

export function useStorageListing(
  connection: string,
  container: string,
  prefix: string,
  recursive = false,
  tree = false,
) {
  return useInfiniteQuery({
    queryKey: [
      tree ? "storage-tree" : "storage-objects",
      connection,
      container,
      prefix,
      recursive,
    ],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const page = await listObjects(connection, container, {
        prefix,
        delimiter: recursive ? "" : "/",
        maxKeys: 250,
        continuationToken: pageParam,
        signal,
      });
      if (
        page.isTruncated &&
        (!page.continuationToken || page.continuationToken === pageParam)
      )
        throw new Error(
          "The storage service did not provide a valid continuation token. Refresh to retry.",
        );
      return page;
    },
    getNextPageParam: (last, _pages, previous) =>
      last.isTruncated &&
      last.continuationToken &&
      last.continuationToken !== previous
        ? last.continuationToken
        : undefined,
  });
}
