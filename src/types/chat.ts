// Chat-related types for the SQL assistant

import type { Connection, SQLResponse } from './index';
import type { SchemaInfo } from '../components/QueryEditor';

// Setters for modifying SQL query state
export interface QuerySetters {
  setQuery: (query: string) => void;
  /** Execute query and update the UI with results */
  executeQuery: (query: string) => Promise<SQLResponse>;
  /** Execute query silently without updating the UI */
  executeQuerySilent: (query: string) => Promise<SQLResponse>;
}

// Environment context passed to chat tools
export interface QueryChatEnvironment {
  connection: Connection | null;
  database: string | null;
  table: string | null;
  currentQuery: string;
  queryResult: SQLResponse | null;
  schema: SchemaInfo | undefined;
  setters: QuerySetters;
}
