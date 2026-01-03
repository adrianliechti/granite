import { createCollection, localStorageCollectionOptions } from '@tanstack/react-db';
import { queryCollectionOptions } from '@tanstack/query-db-collection';
import { QueryClient } from '@tanstack/react-query';
import type { Connection, SavedQuery, AppPreferences } from '../types';

// ============================================================================
// QueryClient for server-backed collections
// ============================================================================

export const collectionsQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      refetchOnWindowFocus: false,
    },
  },
});

// ============================================================================
// Server API helpers
// ============================================================================

async function fetchAllFromStore<T extends { id: string }>(storeName: string): Promise<T[]> {
  const response = await fetch(`/data/${storeName}`);
  if (!response.ok) {
    throw new Error(`Failed to list entries: ${response.statusText}`);
  }
  const entries: { id: string; updated?: string }[] = await response.json();

  const results: T[] = [];
  
  for (const entry of entries) {
    const res = await fetch(`/data/${storeName}/${encodeURIComponent(entry.id)}`);
    if (res.ok) {
      const data = await res.json() as T;
      results.push(data);
    }
  }

  return results;
}

async function saveToServer<T extends { id: string }>(storeName: string, item: T): Promise<void> {
  const response = await fetch(`/data/${storeName}/${encodeURIComponent(item.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
  if (!response.ok) {
    throw new Error(`Failed to save item: ${response.statusText}`);
  }
}

async function deleteFromServer(storeName: string, id: string): Promise<void> {
  const response = await fetch(`/data/${storeName}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete item: ${response.statusText}`);
  }
}

// ============================================================================
// Connections collection - persisted to server
// ============================================================================

const CONNECTIONS_STORE = 'connections';

export const connectionsCollection = createCollection(
  queryCollectionOptions({
    queryKey: ['connections'],
    queryFn: async (): Promise<Connection[]> => {
      return fetchAllFromStore<Connection>(CONNECTIONS_STORE);
    },
    getKey: (item: Connection) => item.id,
    queryClient: collectionsQueryClient,

    onInsert: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map(async (mutation) => {
          const connection = mutation.modified as Connection;
          await saveToServer(CONNECTIONS_STORE, connection);
        })
      );
    },

    onUpdate: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map(async (mutation) => {
          const connection = mutation.modified as Connection;
          await saveToServer(CONNECTIONS_STORE, connection);
        })
      );
    },

    onDelete: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map(async (mutation) => {
          const original = mutation.original as Connection;
          await deleteFromServer(CONNECTIONS_STORE, original.id);
        })
      );
    },
  })
);

// ============================================================================
// Saved queries collection - persisted to server
// ============================================================================

const QUERIES_STORE = 'queries';

export const savedQueriesCollection = createCollection(
  queryCollectionOptions({
    queryKey: ['saved-queries'],
    queryFn: async (): Promise<SavedQuery[]> => {
      return fetchAllFromStore<SavedQuery>(QUERIES_STORE);
    },
    getKey: (item: SavedQuery) => item.id,
    queryClient: collectionsQueryClient,

    onInsert: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map(async (mutation) => {
          const query = mutation.modified as SavedQuery;
          await saveToServer(QUERIES_STORE, query);
        })
      );
    },

    onUpdate: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map(async (mutation) => {
          const query = mutation.modified as SavedQuery;
          await saveToServer(QUERIES_STORE, query);
        })
      );
    },

    onDelete: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map(async (mutation) => {
          const original = mutation.original as SavedQuery;
          await deleteFromServer(QUERIES_STORE, original.id);
        })
      );
    },
  })
);

// ============================================================================
// App preferences collection - persisted to localStorage (local only)
// ============================================================================

export const preferencesCollection = createCollection(
  localStorageCollectionOptions<AppPreferences>({
    id: 'preferences',
    storageKey: 'granite-preferences',
    getKey: (item) => item.id,
  })
);

// Helper to get or create default preferences
export function getDefaultPreferences(): AppPreferences {
  return {
    id: 'app-prefs',
    theme: 'dark',
    activeConnectionId: null,
    sidebarWidth: 280,
  };
}

// ============================================================================
// Helper functions
// ============================================================================

export async function clearAllConnections(): Promise<void> {
  const ids = Array.from(connectionsCollection.state.keys()) as string[];
  ids.forEach((id) => connectionsCollection.delete(id));
}

export async function clearAllSavedQueries(): Promise<void> {
  const ids = Array.from(savedQueriesCollection.state.keys()) as string[];
  ids.forEach((id) => savedQueriesCollection.delete(id));
}
