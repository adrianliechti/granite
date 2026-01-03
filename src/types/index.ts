// ============================================================================
// Connection Types
// ============================================================================

// Database driver types
export type DatabaseDriver = 'postgres' | 'mysql' | 'sqlite' | 'sqlserver' | 'oracle';

// Storage provider types
export type StorageProvider = 's3' | 'azure-blob';

// Connection type discriminator
export type ConnectionType = 'database' | 'storage';

// Base connection interface
interface BaseConnection {
  id: string;
  name: string;
  createdAt: string;
}

// Database connection configuration
export interface DatabaseConnection extends BaseConnection {
  type: 'database';
  driver: DatabaseDriver;
  dsn: string;
}

// S3 storage configuration
export interface S3Config {
  endpoint?: string; // Optional custom endpoint (for MinIO, etc.)
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  container?: string; // Optional default container
}

// Azure Blob storage configuration
export interface AzureBlobConfig {
  accountName: string;
  accountKey?: string;
  sasToken?: string;
  connectionString?: string;
  container?: string; // Optional default container
}

// Storage connection configuration
export interface StorageConnection extends BaseConnection {
  type: 'storage';
  provider: StorageProvider;
  config: S3Config | AzureBlobConfig;
}

// Union type for all connections
export type Connection = DatabaseConnection | StorageConnection;

// Type guards
export function isDatabaseConnection(conn: Connection): conn is DatabaseConnection {
  return conn.type === 'database';
}

export function isStorageConnection(conn: Connection): conn is StorageConnection {
  return conn.type === 'storage';
}

export function isS3Connection(conn: StorageConnection): conn is StorageConnection & { config: S3Config } {
  return conn.provider === 's3';
}

export function isAzureBlobConnection(conn: StorageConnection): conn is StorageConnection & { config: AzureBlobConfig } {
  return conn.provider === 'azure-blob';
}

// ============================================================================
// Object Storage Types
// ============================================================================

// Storage object (file/blob)
export interface StorageObject {
  key: string;
  name: string;
  size: number;
  lastModified: string;
  etag?: string;
  contentType?: string;
  isFolder: boolean;
}

// Storage container
export interface StorageContainer {
  name: string;
  createdAt?: string;
  region?: string;
}

// Object details (metadata)
export interface StorageObjectDetails {
  key: string;
  size: number;
  lastModified: string;
  etag?: string;
  contentType?: string;
  metadata?: Record<string, string>;
  storageClass?: string;
  // S3 specific
  versionId?: string;
  // Azure specific
  accessTier?: string;
  blobType?: string;
}

// ============================================================================
// SQL Types
// ============================================================================

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


