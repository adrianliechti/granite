import { useState } from 'react';
import { X, Loader2, CheckCircle2, XCircle, Plug, Database, Cloud } from 'lucide-react';
import { buildDatabaseConfig } from '../lib/adapters';
import type { 
  Connection, 
  DatabaseConnection, 
  StorageConnection, 
  DatabaseDriver, 
  StorageProvider,
  S3Config,
  AzureBlobConfig 
} from '../types';

interface ConnectionModalProps {
  connection?: Connection | null;
  onSave: (conn: Omit<Connection, 'id' | 'createdAt'>) => void;
  onClose: () => void;
}

// Connection type tabs
type ConnectionCategory = 'database' | 'storage';

const driverInfo: Record<DatabaseDriver, { label: string; placeholder: string }> = {
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
  redis: {
    label: 'Redis',
    placeholder: 'redis://localhost:6379/0',
  },
};

const driverStyles: Record<DatabaseDriver, { active: string; label: string }> = {
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
  redis: {
    active: 'bg-red-500/10 border-red-500/50 text-red-600 dark:text-red-400',
    label: 'Redis',
  },
};

const storageProviderInfo: Record<StorageProvider, { label: string; color: string }> = {
  's3': {
    label: 'Amazon S3',
    color: 'bg-orange-500/10 border-orange-500/50 text-orange-600 dark:text-orange-400',
  },
  'azure-blob': {
    label: 'Azure Blob',
    color: 'bg-blue-500/10 border-blue-500/50 text-blue-600 dark:text-blue-400',
  },
};

export function ConnectionModal({ connection, onSave, onClose }: ConnectionModalProps) {
  // Determine initial category from existing connection
  const initialCategory: ConnectionCategory = connection?.type === 'storage' ? 'storage' : 'database';
  
  const [category, setCategory] = useState<ConnectionCategory>(initialCategory);
  const [name, setName] = useState(connection?.name ?? '');
  
  // Database state
  const [driver, setDriver] = useState<DatabaseDriver>(
    connection?.type === 'database' ? connection.driver : 'postgres'
  );
  const [dsn, setDsn] = useState(
    connection?.type === 'database' ? connection.dsn : ''
  );
  
  // Storage state
  const [storageProvider, setStorageProvider] = useState<StorageProvider>(
    connection?.type === 'storage' ? connection.provider : 's3'
  );
  
  // S3 config
  const [s3Region, setS3Region] = useState(
    connection?.type === 'storage' && connection.provider === 's3' 
      ? (connection.config as S3Config).region 
      : 'us-east-1'
  );
  const [s3AccessKeyId, setS3AccessKeyId] = useState(
    connection?.type === 'storage' && connection.provider === 's3'
      ? (connection.config as S3Config).accessKeyId
      : ''
  );
  const [s3SecretAccessKey, setS3SecretAccessKey] = useState(
    connection?.type === 'storage' && connection.provider === 's3'
      ? (connection.config as S3Config).secretAccessKey
      : ''
  );
  const [s3Endpoint, setS3Endpoint] = useState(
    connection?.type === 'storage' && connection.provider === 's3'
      ? (connection.config as S3Config).endpoint ?? ''
      : ''
  );
  
  // Azure config
  const [azureAccountName, setAzureAccountName] = useState(
    connection?.type === 'storage' && connection.provider === 'azure-blob'
      ? (connection.config as AzureBlobConfig).accountName
      : ''
  );
  const [azureAccountKey, setAzureAccountKey] = useState(
    connection?.type === 'storage' && connection.provider === 'azure-blob'
      ? (connection.config as AzureBlobConfig).accountKey ?? ''
      : ''
  );
  const [azureConnectionString, setAzureConnectionString] = useState(
    connection?.type === 'storage' && connection.provider === 'azure-blob'
      ? (connection.config as AzureBlobConfig).connectionString ?? ''
      : ''
  );

  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testError, setTestError] = useState<string | null>(null);

  const isEditing = !!connection;

  const handleTest = async () => {
    setTestStatus('testing');
    setTestError(null);

    try {
      if (category === 'database') {
        if (!dsn) return;
        
        // Use appropriate test query for driver
        const testQuery = driver === 'redis' ? 'KEYS *' : 'SELECT 1';
        
        const response = await fetch('/db/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            provider: driver, 
            config: buildDatabaseConfig(driver, dsn), 
            query: testQuery, 
            params: [] 
          }),
        });
        
        const data = await response.json();
        
        if (data.error) {
          setTestStatus('error');
          setTestError(data.error);
        } else if (!response.ok) {
          setTestStatus('error');
          setTestError(data.message || 'Connection failed');
        } else {
          setTestStatus('success');
        }
      } else {
        // Test storage connection
        const config = buildStorageConfig();
        const response = await fetch('/storage/containers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: storageProvider, config }),
        });
        
        if (!response.ok) {
          const data = await response.json();
          setTestStatus('error');
          setTestError(data.message || 'Connection failed');
        } else {
          setTestStatus('success');
        }
      }
    } catch (err) {
      setTestStatus('error');
      setTestError(err instanceof Error ? err.message : 'Connection failed');
    }
  };

  const buildStorageConfig = (): S3Config | AzureBlobConfig => {
    if (storageProvider === 's3') {
      return {
        region: s3Region,
        accessKeyId: s3AccessKeyId,
        secretAccessKey: s3SecretAccessKey,
        ...(s3Endpoint && { endpoint: s3Endpoint }),
      };
    } else {
      return {
        accountName: azureAccountName,
        ...(azureAccountKey && { accountKey: azureAccountKey }),
        ...(azureConnectionString && { connectionString: azureConnectionString }),
      };
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name) return;
    
    if (category === 'database') {
      if (!dsn) return;
      onSave({ 
        type: 'database',
        name, 
        driver, 
        dsn 
      } as Omit<DatabaseConnection, 'id' | 'createdAt'>);
    } else {
      const config = buildStorageConfig();
      onSave({
        type: 'storage',
        name,
        provider: storageProvider,
        config,
      } as Omit<StorageConnection, 'id' | 'createdAt'>);
    }
  };

  const isFormValid = () => {
    if (!name) return false;
    if (category === 'database') {
      return !!dsn;
    } else if (storageProvider === 's3') {
      return !!s3Region && !!s3AccessKeyId && !!s3SecretAccessKey;
    } else {
      return !!azureAccountName && (!!azureAccountKey || !!azureConnectionString);
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
          {/* Connection Type Tabs */}
          {!isEditing && (
            <div className="flex gap-2 p-1 bg-neutral-100 dark:bg-white/5 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setCategory('database');
                  setTestStatus('idle');
                  setTestError(null);
                }}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  category === 'database'
                    ? 'bg-white dark:bg-white/10 text-neutral-800 dark:text-neutral-100 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
                }`}
              >
                <Database className="w-4 h-4" />
                Database
              </button>
              <button
                type="button"
                onClick={() => {
                  setCategory('storage');
                  setTestStatus('idle');
                  setTestError(null);
                }}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  category === 'storage'
                    ? 'bg-white dark:bg-white/10 text-neutral-800 dark:text-neutral-100 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
                }`}
              >
                <Cloud className="w-4 h-4" />
                Storage
              </button>
            </div>
          )}

          {/* Name */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Connection Name
            </label>
            <input
              type="text"
              placeholder={category === 'database' ? 'My Database' : 'My Storage'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-colors"
              autoFocus
            />
          </div>

          {/* Database Form */}
          {category === 'database' && (
            <>
              {/* Driver */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  Database Type
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {(Object.keys(driverInfo) as DatabaseDriver[]).map((key) => {
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
            </>
          )}

          {/* Storage Form */}
          {category === 'storage' && (
            <>
              {/* Storage Provider */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  Storage Provider
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {(Object.keys(storageProviderInfo) as StorageProvider[]).map((key) => {
                    const providerInfo = storageProviderInfo[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          setStorageProvider(key);
                          setTestStatus('idle');
                          setTestError(null);
                        }}
                        className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-all ${
                          storageProvider === key
                            ? providerInfo.color
                            : 'bg-neutral-50 dark:bg-white/5 border-neutral-200 dark:border-white/10 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/10'
                        }`}
                      >
                        {providerInfo.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* S3 Config */}
              {storageProvider === 's3' && (
                <>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                      Region
                    </label>
                    <input
                      type="text"
                      placeholder="us-east-1"
                      value={s3Region}
                      onChange={(e) => {
                        setS3Region(e.target.value);
                        setTestStatus('idle');
                      }}
                      className="w-full px-3 py-2 text-sm text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                      Access Key ID
                    </label>
                    <input
                      type="text"
                      placeholder="AKIAIOSFODNN7EXAMPLE"
                      value={s3AccessKeyId}
                      onChange={(e) => {
                        setS3AccessKeyId(e.target.value);
                        setTestStatus('idle');
                      }}
                      className="w-full px-3 py-2 text-sm font-mono text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                      Secret Access Key
                    </label>
                    <input
                      type="password"
                      placeholder="••••••••••••••••"
                      value={s3SecretAccessKey}
                      onChange={(e) => {
                        setS3SecretAccessKey(e.target.value);
                        setTestStatus('idle');
                      }}
                      className="w-full px-3 py-2 text-sm font-mono text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                      Custom Endpoint <span className="text-neutral-400">(optional)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="https://s3.example.com"
                      value={s3Endpoint}
                      onChange={(e) => {
                        setS3Endpoint(e.target.value);
                        setTestStatus('idle');
                      }}
                      className="w-full px-3 py-2 text-sm text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-colors"
                    />
                    <p className="text-[10px] text-neutral-400 dark:text-neutral-600">
                      For S3-compatible services like MinIO, Wasabi, etc.
                    </p>
                  </div>
                </>
              )}

              {/* Azure Config */}
              {storageProvider === 'azure-blob' && (
                <>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                      Storage Account Name
                    </label>
                    <input
                      type="text"
                      placeholder="mystorageaccount"
                      value={azureAccountName}
                      onChange={(e) => {
                        setAzureAccountName(e.target.value);
                        setTestStatus('idle');
                      }}
                      className="w-full px-3 py-2 text-sm text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                      Account Key <span className="text-neutral-400">(or use connection string)</span>
                    </label>
                    <input
                      type="password"
                      placeholder="••••••••••••••••"
                      value={azureAccountKey}
                      onChange={(e) => {
                        setAzureAccountKey(e.target.value);
                        setTestStatus('idle');
                      }}
                      className="w-full px-3 py-2 text-sm font-mono text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                      Connection String <span className="text-neutral-400">(alternative)</span>
                    </label>
                    <input
                      type="password"
                      placeholder="DefaultEndpointsProtocol=https;AccountName=..."
                      value={azureConnectionString}
                      onChange={(e) => {
                        setAzureConnectionString(e.target.value);
                        setTestStatus('idle');
                      }}
                      className="w-full px-3 py-2 text-sm font-mono text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-colors"
                    />
                  </div>
                </>
              )}
            </>
          )}

          {/* Test Connection */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={!isFormValid() || testStatus === 'testing'}
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
              disabled={!isFormValid()}
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
