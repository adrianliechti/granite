// Database connection configuration
export interface Connection {
  id: string;
  name: string;
  driver: 'postgres' | 'mysql' | 'sqlite';
  dsn: string;
  createdAt: string;
}

// Saved query
export interface SavedQuery {
  id: string;
  name: string;
  connectionId: string;
  query: string;
  params: string; // JSON string
  createdAt: string;
  updatedAt: string;
}

// SQL request to backend
export interface SQLRequest {
  driver: string;
  dsn: string;
  query: string;
  params?: unknown[];
}

// SQL response from backend
export interface SQLResponse {
  columns?: string[];
  rows?: Record<string, unknown>[];
  rows_affected?: number;
  error?: string;
}

// Query execution state
export interface QueryExecution {
  id: string;
  connectionId: string;
  query: string;
  params: unknown[];
  response: SQLResponse | null;
  error: string | null;
  executedAt: string;
  duration: number;
}

// App preferences
export interface AppPreferences {
  id: string;
  theme: 'light' | 'dark';
  activeConnectionId: string | null;
  sidebarWidth: number;
}
