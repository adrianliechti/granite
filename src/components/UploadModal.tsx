import { useState, useRef } from 'react';
import { X, Loader2, Upload, FileUp, File } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { uploadObject } from '../lib/adapters/storage';
import type { StorageConnection } from '../types';

interface UploadModalProps {
  connection: StorageConnection;
  container: string;
  currentPath: string;
  onClose: () => void;
}

export function UploadModal({ connection, container, currentPath, onClose }: UploadModalProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [objectKey, setObjectKey] = useState('');

  const uploadMutation = useMutation({
    mutationFn: ({ file, key }: { file: File; key: string }) =>
      uploadObject(connection, container, key, file),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['storage-objects', connection.id, container],
      });
      onClose();
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    setSelectedFile(file);
    setObjectKey(currentPath + file.name);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedFile && objectKey.trim()) {
      // Strip leading slashes - object keys shouldn't start with /
      const key = objectKey.trim().replace(/^\/+/, '');
      uploadMutation.mutate({ file: selectedFile, key });
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 dark:bg-black/70"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-white dark:bg-neutral-900 rounded-xl shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Upload className="w-4 h-4 text-blue-500" />
            </div>
            <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              Upload File
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4 text-neutral-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Destination info */}
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            Uploading to{' '}
            <span className="font-medium text-neutral-700 dark:text-neutral-300">
              {container}
              {currentPath && `/${currentPath.replace(/\/$/, '')}`}
            </span>
          </div>

          {/* File selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Select File
            </label>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              className="hidden"
            />
            {selectedFile ? (
              <div className="flex items-center gap-3 p-3 border border-neutral-200 dark:border-neutral-700 rounded-lg bg-neutral-50 dark:bg-neutral-800/50">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <File className="w-5 h-5 text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {formatFileSize(selectedFile.size)} • {selectedFile.type || 'Unknown type'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 text-xs font-medium text-blue-500 hover:bg-blue-500/10 rounded-lg transition-colors"
                >
                  Change
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full p-6 border-2 border-dashed border-neutral-200 dark:border-neutral-700 rounded-lg hover:border-blue-500/50 hover:bg-blue-500/5 transition-colors group"
              >
                <div className="flex flex-col items-center gap-2">
                  <FileUp className="w-8 h-8 text-neutral-400 group-hover:text-blue-500 transition-colors" />
                  <span className="text-sm text-neutral-500 dark:text-neutral-400 group-hover:text-blue-500 transition-colors">
                    Click to select a file
                  </span>
                </div>
              </button>
            )}
          </div>

          {/* Object key input */}
          {selectedFile && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                Object Key (Path)
              </label>
              <input
                type="text"
                value={objectKey}
                onChange={(e) => setObjectKey(e.target.value)}
                placeholder="path/to/file.txt"
                className="w-full px-3 py-2 text-sm font-mono border border-neutral-200 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                disabled={uploadMutation.isPending}
              />
              <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
                Use forward slashes to create a folder structure (e.g., folder/subfolder/file.pdf)
              </p>
            </div>
          )}

          {/* Error message */}
          {uploadMutation.error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-xs text-red-600 dark:text-red-400">
                {uploadMutation.error instanceof Error
                  ? uploadMutation.error.message
                  : 'Failed to upload file'}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5 rounded-lg transition-colors"
              disabled={uploadMutation.isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedFile || !objectKey.trim() || uploadMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
            >
              {uploadMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Upload
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
