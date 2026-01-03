import { useState } from 'react';
import { X, Loader2, CheckCircle2, XCircle, Plug } from 'lucide-react';
import type { Connection } from '../types';

interface ConnectionModalProps {
  connection?: Connection | null;
  onSave: (conn: Omit<Connection, 'id' | 'createdAt'>) => void;
  onClose: () => void;
}

const driverInfo: Record<Connection['driver'], { label: string; placeholder: string }> = {
  postgres: {
    label: 'PostgreSQL',
    placeholder: 'postgres://user:password@localhost:5432/database',
  },
  mysql: {
    label: 'MySQL',
    placeholder: 'user:password@tcp(localhost:3306)/database',
  },
  sqlite: {
    label: 'SQLite',
    placeholder: '/path/to/database.db',
  },
  sqlserver: {
    label: 'SQL Server',
    placeholder: 'sqlserver://user:password@localhost:1433?database=mydb',
  },
  oracle: {
    label: 'Oracle',
    placeholder: 'oracle://user:password@localhost:1521/service_name',
  },
};

const driverStyles: Record<Connection['driver'], { active: string; label: string }> = {
  postgres: {
    active: 'bg-blue-500/10 border-blue-500/50 text-blue-600 dark:text-blue-400',
    label: 'PG',
  },
  mysql: {
    active: 'bg-yellow-500/10 border-yellow-500/50 text-yellow-600 dark:text-yellow-400',
    label: 'MySQL',
  },
  sqlite: {
    active: 'bg-purple-500/10 border-purple-500/50 text-purple-600 dark:text-purple-400',
    label: 'SQLite',
  },
  sqlserver: {
    active: 'bg-red-500/10 border-red-500/50 text-red-600 dark:text-red-400',
    label: 'MSSQL',
  },
  oracle: {
    active: 'bg-orange-500/10 border-orange-500/50 text-orange-600 dark:text-orange-400',
    label: 'Oracle',
  },
};

export function ConnectionModal({ connection, onSave, onClose }: ConnectionModalProps) {
  const [name, setName] = useState(connection?.name ?? '');
  const [driver, setDriver] = useState<Connection['driver']>(connection?.driver ?? 'postgres');
  const [dsn, setDsn] = useState(connection?.dsn ?? '');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testError, setTestError] = useState<string | null>(null);

  const isEditing = !!connection;

  const handleTest = async () => {
    if (!dsn) return;
    
    setTestStatus('testing');
    setTestError(null);

    try {
      const response = await fetch('/sql/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driver, dsn, query: 'SELECT 1', params: [] }),
      });
      
      const data = await response.json();
      
      if (data.error) {
        setTestStatus('error');
        setTestError(data.error);
      } else {
        setTestStatus('success');
      }
    } catch (err) {
      setTestStatus('error');
      setTestError(err instanceof Error ? err.message : 'Connection failed');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name && dsn) {
      onSave({ name, driver, dsn });
    }
  };

  const info = driverInfo[driver];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-md bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl border border-neutral-200 dark:border-white/10 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-white/10">
          <h2 className="text-base font-semibold text-neutral-800 dark:text-neutral-100">
            {isEditing ? 'Edit Connection' : 'New Connection'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 -mr-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4 text-neutral-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Connection Name
            </label>
            <input
              type="text"
              placeholder="My Database"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-colors"
              autoFocus
            />
          </div>

          {/* Driver */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Database Type
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {(Object.keys(driverInfo) as Connection['driver'][]).map((key) => {
                const style = driverStyles[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setDriver(key);
                      setTestStatus('idle');
                      setTestError(null);
                    }}
                    className={`px-2 py-2 text-[10px] font-semibold rounded-lg border transition-all ${
                      driver === key
                        ? style.active
                        : 'bg-neutral-50 dark:bg-white/5 border-neutral-200 dark:border-white/10 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/10'
                    }`}
                  >
                    {style.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* DSN */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Connection String
            </label>
            <input
              type="text"
              placeholder={info.placeholder}
              value={dsn}
              onChange={(e) => {
                setDsn(e.target.value);
                setTestStatus('idle');
                setTestError(null);
              }}
              className="w-full px-3 py-2 text-sm font-mono text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-colors"
            />
            <p className="text-[10px] text-neutral-400 dark:text-neutral-600">
              {info.label} connection string format
            </p>
          </div>

          {/* Test Connection */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={!dsn || testStatus === 'testing'}
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-neutral-700 dark:text-neutral-200 bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 disabled:opacity-50 rounded-lg transition-colors"
            >
              {testStatus === 'testing' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-neutral-500 dark:text-neutral-400" />
              ) : testStatus === 'success' ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
              ) : testStatus === 'error' ? (
                <XCircle className="w-3.5 h-3.5 text-red-500" />
              ) : (
                <Plug className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
              )}
              {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
            </button>
            
            {testStatus === 'success' && (
              <p className="text-xs text-blue-600 dark:text-blue-400">
                ✓ Connection successful
              </p>
            )}
            {testStatus === 'error' && testError && (
              <p className="text-xs text-red-500 dark:text-red-400 break-all">
                {testError}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name || !dsn}
              className="flex-1 px-4 py-2.5 text-sm font-medium bg-blue-500 text-white rounded-xl hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isEditing ? 'Save Changes' : 'Add Connection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
