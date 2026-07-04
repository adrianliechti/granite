import { createCollection } from '@tanstack/react-db';
import { queryCollectionOptions } from '@tanstack/query-db-collection';
import { QueryClient } from '@tanstack/react-query';
import type { Connection } from '../types';

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

async function fetchAllConnections(): Promise<Connection[]> {
  const response = await fetch('/connections');
  if (!response.ok) {
    throw new Error(`Failed to list connections: ${response.statusText}`);
  }
  return response.json();
}

async function saveConnection(connection: Connection): Promise<void> {
  const exists = await fetch(`/connections/${encodeURIComponent(connection.id)}`).then(r => r.ok);
  
  if (exists) {
    // Update existing
    const response = await fetch(`/connections/${encodeURIComponent(connection.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(connection),
    });
    if (!response.ok) {
      throw new Error(`Failed to update connection: ${response.statusText}`);
    }
  } else {
    // Create new
    const response = await fetch('/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(connection),
    });
    if (!response.ok) {
      throw new Error(`Failed to create connection: ${response.statusText}`);
    }
  }
}

async function deleteConnection(id: string): Promise<void> {
  const response = await fetch(`/connections/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete connection: ${response.statusText}`);
  }
}

// ============================================================================
// Connections collection - persisted to server
// ============================================================================

export const connectionsCollection = createCollection(
  queryCollectionOptions({
    queryKey: ['connections'],
    queryFn: async (): Promise<Connection[]> => {
      return fetchAllConnections();
    },
    getKey: (item: Connection) => item.id,
    queryClient: collectionsQueryClient,

    onInsert: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map(async (mutation) => {
          const connection = mutation.modified as Connection;
          await saveConnection(connection);
        })
      );
    },

    onUpdate: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map(async (mutation) => {
          const connection = mutation.modified as Connection;
          await saveConnection(connection);
        })
      );
    },

    onDelete: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map(async (mutation) => {
          const original = mutation.original as Connection;
          await deleteConnection(original.id);
        })
      );
    },
  })
);
