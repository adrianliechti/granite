// ============================================================================
// Connection Types
// ============================================================================

// Database driver types
export type DatabaseDriver = 'postgres' | 'mysql' | 'sqlite' | 'sqlserver' | 'oracle';

// Storage provider types
export type StorageProvider = 's3' | 'azure-blob';

// SQL connection configuration
export interface SQLConfig {
  driver: DatabaseDriver;
  dsn: string;
}

// S3 storage configuration
export interface S3Config {
  endpoint?: string; // Optional custom endpoint (for MinIO, etc.)
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

// Azure Blob storage configuration
export interface AzureBlobConfig {
  accountName: string;
  accountKey?: string;
  sasToken?: string;
  connectionString?: string;
}

// Unified connection type
export interface Connection {
  id: string;
  name: string;
  
  // SQL connection (mutually exclusive with storage)
  sql?: SQLConfig;
  
  // Storage connections (mutually exclusive with sql)
  amazonS3?: S3Config;
  azureBlob?: AzureBlobConfig;
  
  createdAt?: string;
  updatedAt?: string;
}

// Type aliases for backward compatibility
export type DatabaseConnection = Connection;
export type StorageConnection = Connection;

// Type guards
export function isSQLConnection(conn: Connection): boolean {
  return conn.sql != null;
}

export function isStorageConnection(conn: Connection): boolean {
  return conn.amazonS3 != null || conn.azureBlob != null;
}

export function isS3Connection(conn: Connection): boolean {
  return conn.amazonS3 != null;
}

export function isAzureBlobConnection(conn: Connection): boolean {
  return conn.azureBlob != null;
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


