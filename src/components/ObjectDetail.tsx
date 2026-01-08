import { useQuery } from '@tanstack/react-query';
import { 
  File, 
  Image, 
  FileText, 
  FileCode, 
  Archive, 
  Download,
  Loader2,
  X
} from 'lucide-react';
import { 
  getObjectDetails, 
  getPresignedUrl, 
  formatFileSize, 
  getFileIconType, 
  getContentTypeLabel,
  getDisplayName
} from '../lib/adapters/storage';
import type { Connection } from '../types';

interface ObjectDetailProps {
  connection: Connection;
  container: string;
  objectKey: string;
  onDeleted?: () => void;
  onClose?: () => void;
}

const iconMap = {
  folder: File,
  image: Image,
  document: FileText,
  code: FileCode,
  archive: Archive,
  file: File,
};

export function ObjectDetail({ connection, container, objectKey, onClose }: ObjectDetailProps) {
  
  const { data: details, isLoading, error } = useQuery({
    queryKey: ['storage-object-details', connection.id, container, objectKey],
    queryFn: () => getObjectDetails(connection.id, container, objectKey),
    enabled: !!connection && !!container && !!objectKey,
  });

  const handleDownload = async () => {
    try {
      const url = await getPresignedUrl(connection.id, container, objectKey);
      // Create a temporary anchor element to trigger download
      const link = document.createElement('a');
      link.href = url;
      link.download = getDisplayName(objectKey);
      link.target = '_blank';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Failed to get download URL:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-neutral-400 animate-spin" />
      </div>
    );
  }

  if (error || !details) {
    return (
      <div className="flex-1 flex items-center justify-center text-neutral-400 dark:text-neutral-600 text-sm">
        {error ? 'Failed to load object details' : 'Select an object to view details'}
      </div>
    );
  }

  const iconType = getFileIconType(objectKey);
  const Icon = iconMap[iconType];
  const displayName = getDisplayName(objectKey);

  return (
    <div className="flex-1 bg-white dark:bg-[#1a1a1a]/60 border border-neutral-200 dark:border-white/8 rounded-xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-neutral-200 dark:border-white/8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-neutral-100 dark:bg-white/5 flex items-center justify-center">
            <Icon className="w-5 h-5 text-neutral-500 dark:text-neutral-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-200 truncate">
              {displayName}
            </h2>
            <p className="text-xs text-neutral-400 dark:text-neutral-500 truncate">
              {container}/{objectKey}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleDownload}
              className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors"
              title="Download"
            >
              <Download className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors"
              title="Close"
            >
              <X className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
            </button>
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-4">
          {/* Basic Info */}
          <DetailSection title="Basic Information">
            <DetailRow label="Size" value={formatFileSize(details.size)} />
            <DetailRow label="Last Modified" value={formatDate(details.lastModified)} />
            {details.contentType && (
              <DetailRow label="Content Type" value={getContentTypeLabel(details.contentType)} />
            )}
            {details.etag && (
              <DetailRow label="ETag" value={details.etag} mono />
            )}
          </DetailSection>

          {/* Storage Info */}
          {(details.storageClass || details.accessTier || details.blobType) && (
            <DetailSection title="Storage">
              {details.storageClass && (
                <DetailRow label="Storage Class" value={details.storageClass} />
              )}
              {details.accessTier && (
                <DetailRow label="Access Tier" value={details.accessTier} />
              )}
              {details.blobType && (
                <DetailRow label="Blob Type" value={details.blobType} />
              )}
              {details.versionId && (
                <DetailRow label="Version ID" value={details.versionId} mono />
              )}
            </DetailSection>
          )}

          {/* Custom Metadata */}
          {details.metadata && Object.keys(details.metadata).length > 0 && (
            <DetailSection title="Metadata">
              {Object.entries(details.metadata).map(([key, value]) => (
                <DetailRow key={key} label={key} value={value} />
              ))}
            </DetailSection>
          )}
        </div>
      </div>
    </div>
  );
}

// Sub-components

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2">
        {title}
      </h3>
      <div className="bg-neutral-50 dark:bg-white/5 rounded-lg divide-y divide-neutral-200 dark:divide-white/5">
        {children}
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-xs text-neutral-500 dark:text-neutral-400">{label}</span>
      <span className={`text-xs text-neutral-700 dark:text-neutral-200 ${mono ? 'font-mono' : ''} truncate max-w-50`}>
        {value}
      </span>
    </div>
  );
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

// Empty state for when no object is selected
export function ObjectDetailEmpty() {
  return (
    <div className="flex-1 bg-white dark:bg-[#1a1a1a]/60 border border-neutral-200 dark:border-white/8 rounded-xl flex items-center justify-center">
      <div className="text-center">
        <File className="w-12 h-12 text-neutral-300 dark:text-neutral-700 mx-auto mb-3" />
        <p className="text-sm text-neutral-400 dark:text-neutral-600">
          Select an object to view details
        </p>
      </div>
    </div>
  );
}
