import { createCollection, localStorageCollectionOptions } from '@tanstack/react-db';
import type { Connection, SavedQuery, AppPreferences } from '../types';

// Connections collection - persisted to localStorage
export const connectionsCollection = createCollection(
  localStorageCollectionOptions<Connection>({
    id: 'connections',
    storageKey: 'granite-connections',
    getKey: (item) => item.id,
  })
);

// Saved queries collection - persisted to localStorage
export const savedQueriesCollection = createCollection(
  localStorageCollectionOptions<SavedQuery>({
    id: 'saved-queries',
    storageKey: 'granite-queries',
    getKey: (item) => item.id,
  })
);

// App preferences collection - persisted to localStorage
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
