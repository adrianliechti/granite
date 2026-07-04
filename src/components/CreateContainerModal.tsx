import { useState } from 'react';
import { X, Loader2, Box } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createContainer } from '../lib/adapters/storage';
import type { Connection } from '../types';

interface CreateContainerModalProps {
  connection: Connection;
  onClose: () => void;
}

export function CreateContainerModal({ connection, onClose }: CreateContainerModalProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');

  const containerSingular = connection.amazonS3 ? 'Bucket' : 'Container';

  const createMutation = useMutation({
    mutationFn: (containerName: string) => createContainer(connection.id, containerName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storage-containers', connection.id] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      createMutation.mutate(name.trim());
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 dark:bg-black/70"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-white dark:bg-neutral-900 rounded-xl shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Box className="w-4 h-4 text-blue-500" />
            </div>
            <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              Create {containerSingular}
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
          {/* Connection info */}
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            Creating in <span className="font-medium text-neutral-700 dark:text-neutral-300">{connection.name}</span>
          </div>

          {/* Name input */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
              {containerSingular} Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`my-${containerSingular.toLowerCase()}`}
              className="w-full px-3 py-2 text-sm border border-neutral-200 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              autoFocus
              disabled={createMutation.isPending}
            />
            <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
              {connection.amazonS3 
                ? 'Bucket names must be globally unique and follow S3 naming rules'
                : 'Container names must be lowercase and can contain letters, numbers, and hyphens'}
            </p>
          </div>

          {/* Error message */}
          {createMutation.error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-xs text-red-600 dark:text-red-400">
                {createMutation.error instanceof Error 
                  ? createMutation.error.message 
                  : 'Failed to create container'}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5 rounded-lg transition-colors"
              disabled={createMutation.isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || createMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
            >
              {createMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Create {containerSingular}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
