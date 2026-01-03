import type { 
  StorageConnection, 
  StorageContainer, 
  StorageObject, 
  StorageObjectDetails,
} from '../../types';

// ============================================================================
// Storage API Client
// ============================================================================

export interface ListObjectsOptions {
  prefix?: string;
  delimiter?: string;
  maxKeys?: number;
  continuationToken?: string;
}

export interface ListObjectsResult {
  objects: StorageObject[];
  prefixes: string[]; // Common prefixes (folders)
  isTruncated: boolean;
  continuationToken?: string;
}

// Build request body for storage operations
function buildStorageRequest(connection: StorageConnection) {
  return {
    provider: connection.provider,
    config: connection.config,
  };
}

// List all containers
export async function listContainers(connection: StorageConnection): Promise<StorageContainer[]> {
  const response = await fetch('/storage/containers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildStorageRequest(connection)),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to list containers');
  }

  return response.json();
}

// Create a new container
export async function createContainer(connection: StorageConnection, name: string): Promise<void> {
  const response = await fetch('/storage/containers/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...buildStorageRequest(connection),
      name,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create container');
  }
}

// List objects in a container with optional prefix (for folder navigation)
export async function listObjects(
  connection: StorageConnection,
  container: string,
  options: ListObjectsOptions = {}
): Promise<ListObjectsResult> {
  const response = await fetch('/storage/objects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...buildStorageRequest(connection),
      container,
      prefix: options.prefix || '',
      delimiter: options.delimiter ?? '/',
      maxKeys: options.maxKeys || 1000,
      continuationToken: options.continuationToken,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to list objects');
  }

  return response.json();
}

// Get detailed metadata for a specific object
export async function getObjectDetails(
  connection: StorageConnection,
  container: string,
  key: string
): Promise<StorageObjectDetails> {
  const response = await fetch('/storage/object/details', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...buildStorageRequest(connection),
      container,
      key,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to get object details');
  }

  return response.json();
}

// Generate a presigned URL for downloading an object
export async function getPresignedUrl(
  connection: StorageConnection,
  container: string,
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  const response = await fetch('/storage/object/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...buildStorageRequest(connection),
      container,
      key,
      expiresIn,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to generate presigned URL');
  }

  const result = await response.json();
  return result.url;
}

// Upload a file to object storage
export async function uploadObject(
  connection: StorageConnection,
  container: string,
  key: string,
  file: File
): Promise<void> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('provider', connection.provider);
  formData.append('config', JSON.stringify(connection.config));
  formData.append('container', container);
  formData.append('key', key);
  
  const response = await fetch('/storage/upload', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to upload file');
  }
}

// Delete one or more objects from storage
export async function deleteObjects(
  connection: StorageConnection,
  container: string,
  keys: string[]
): Promise<void> {
  const response = await fetch('/storage/object/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...buildStorageRequest(connection),
      container,
      keys,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to delete objects');
  }
}

// Delete all objects with a given prefix (for folder deletion)
export async function deletePrefix(
  connection: StorageConnection,
  container: string,
  prefix: string
): Promise<void> {
  // First, list all objects with this prefix (without delimiter to get all nested objects)
  const result = await listObjects(connection, container, { 
    prefix, 
    delimiter: '', // No delimiter means get all nested objects
    maxKeys: 1000 
  });
  
  if (result.objects.length === 0) {
    return; // Nothing to delete
  }

  const keys = result.objects.map(obj => obj.key);
  await deleteObjects(connection, container, keys);

  // If there were more objects (truncated), recursively delete
  if (result.isTruncated) {
    await deletePrefix(connection, container, prefix);
  }
}

// Test storage connection
export async function testStorageConnection(connection: StorageConnection): Promise<boolean> {
  try {
    await listContainers(connection);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

// Parse a path into container and prefix
export function parseStoragePath(path: string): { container: string; prefix: string } {
  const parts = path.split('/').filter(Boolean);
  const container = parts[0] || '';
  const prefix = parts.slice(1).join('/');
  return { container, prefix: prefix ? prefix + '/' : '' };
}

// Build a path from container and prefix
export function buildStoragePath(container: string, prefix: string): string {
  if (!prefix) return container;
  return `${container}/${prefix}`.replace(/\/+$/, '');
}

// Get parent path
export function getParentPath(path: string): string {
  const parts = path.split('/').filter(Boolean);
  if (parts.length <= 1) return '';
  return parts.slice(0, -1).join('/');
}

// Get display name from key/path
export function getDisplayName(key: string): string {
  const parts = key.split('/').filter(Boolean);
  return parts[parts.length - 1] || key;
}

// Format file size
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// Get file extension from key
export function getFileExtension(key: string): string {
  const name = getDisplayName(key);
  const lastDot = name.lastIndexOf('.');
  return lastDot > 0 ? name.slice(lastDot + 1).toLowerCase() : '';
}

// Get icon type based on file extension
export function getFileIconType(key: string): 'folder' | 'image' | 'document' | 'code' | 'archive' | 'file' {
  if (key.endsWith('/')) return 'folder';
  
  const ext = getFileExtension(key);
  
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico', 'bmp'];
  const documentExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv'];
  const codeExts = ['js', 'ts', 'jsx', 'tsx', 'html', 'css', 'json', 'xml', 'yaml', 'yml', 'md', 'py', 'go', 'rs', 'java'];
  const archiveExts = ['zip', 'tar', 'gz', 'rar', '7z', 'bz2'];
  
  if (imageExts.includes(ext)) return 'image';
  if (documentExts.includes(ext)) return 'document';
  if (codeExts.includes(ext)) return 'code';
  if (archiveExts.includes(ext)) return 'archive';
  
  return 'file';
}

// Get content type label
export function getContentTypeLabel(contentType?: string): string {
  if (!contentType) return 'Unknown';
  
  const labels: Record<string, string> = {
    'application/json': 'JSON',
    'application/xml': 'XML',
    'application/pdf': 'PDF',
    'application/zip': 'ZIP Archive',
    'application/gzip': 'GZIP Archive',
    'text/plain': 'Plain Text',
    'text/html': 'HTML',
    'text/css': 'CSS',
    'text/javascript': 'JavaScript',
    'image/jpeg': 'JPEG Image',
    'image/png': 'PNG Image',
    'image/gif': 'GIF Image',
    'image/webp': 'WebP Image',
    'image/svg+xml': 'SVG Image',
  };
  
  return labels[contentType] || contentType;
}
