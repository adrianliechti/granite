import { Database, Package, Plus } from 'lucide-react';

interface WelcomePageProps {
  onAddConnection: () => void;
}

export function WelcomePage({ onAddConnection }: WelcomePageProps) {
  return (
    <main className="flex-1 flex items-center justify-center">
      <div className="max-w-2xl px-8 text-center">
        {/* Logo/Title */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
            Welcome to Granite
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-500">
            A unified interface for databases and object storage
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="p-4 rounded-lg bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/8">
            <div className="w-10 h-10 rounded-lg bg-blue-500/5 dark:bg-blue-500/10 flex items-center justify-center mx-auto mb-3">
              <Database className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Database Connections
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-500">
              PostgreSQL, MySQL, SQLite, SQL Server, and Oracle
            </p>
          </div>

          <div className="p-4 rounded-lg bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/8">
            <div className="w-10 h-10 rounded-lg bg-orange-500/5 dark:bg-orange-500/10 flex items-center justify-center mx-auto mb-3">
              <Package className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            </div>
            <h3 className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Object Storage
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-500">
              Amazon S3 and Azure Blob Storage
            </p>
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={onAddConnection}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-100 hover:bg-neutral-200 dark:bg-white/5 dark:hover:bg-white/10 text-neutral-700 dark:text-neutral-300 text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Connection
        </button>

        {/* Quick tip */}
        <p className="mt-6 text-xs text-neutral-400 dark:text-neutral-600">
          You can have multiple connections open simultaneously
        </p>
      </div>
    </main>
  );
}
