import { useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { Loader2, Database, Cloud } from 'lucide-react';
import type { Connection, DatabaseDriver, StorageProvider } from '../types';
import { connectionFormSchema } from '../lib/schemas/connection';

interface ConnectionModalProps {
  connection?: Connection | null;
  onSave: (conn: Omit<Connection, 'id' | 'createdAt'>) => Promise<Connection>;
  onClose: () => void;
}

type ConnectionCategory = 'database' | 'storage';

const driverInfo: Record<DatabaseDriver, { label: string; placeholder: string }> = {
  postgres: { label: 'PostgreSQL', placeholder: 'postgres://user:password@localhost:5432/database' },
  mysql: { label: 'MySQL', placeholder: 'user:password@tcp(localhost:3306)/database' },
  sqlite: { label: 'SQLite', placeholder: '/path/to/database.db' },
  sqlserver: { label: 'SQL Server', placeholder: 'sqlserver://user:password@localhost:1433?database=mydb' },
  oracle: { label: 'Oracle', placeholder: 'oracle://user:password@localhost:1521/service_name' },
};

const driverStyles: Record<DatabaseDriver, { active: string; label: string }> = {
  postgres: { active: 'bg-blue-500/10 border-blue-500/50 text-blue-600 dark:text-blue-400', label: 'PG' },
  mysql: { active: 'bg-yellow-500/10 border-yellow-500/50 text-yellow-600 dark:text-yellow-400', label: 'MySQL' },
  sqlite: { active: 'bg-purple-500/10 border-purple-500/50 text-purple-600 dark:text-purple-400', label: 'SQLite' },
  sqlserver: { active: 'bg-red-500/10 border-red-500/50 text-red-600 dark:text-red-400', label: 'MSSQL' },
  oracle: { active: 'bg-orange-500/10 border-orange-500/50 text-orange-600 dark:text-orange-400', label: 'Oracle' },
};

const storageProviderInfo: Record<StorageProvider, { label: string; color: string }> = {
  's3': { label: 'Amazon S3', color: 'bg-orange-500/10 border-orange-500/50 text-orange-600 dark:text-orange-400' },
  'azure-blob': { label: 'Azure Blob', color: 'bg-blue-500/10 border-blue-500/50 text-blue-600 dark:text-blue-400' },
};

// CSS classes
const inputClass = "w-full px-3 py-2 text-sm text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-colors";
const inputMonoClass = `${inputClass} font-mono`;
const errorClass = "text-[10px] text-red-500 dark:text-red-400 mt-1";

interface FormValues {
  category: ConnectionCategory;
  name: string;
  driver: DatabaseDriver;
  dsn: string;
  storageProvider: StorageProvider;
  s3Region: string;
  s3AccessKeyId: string;
  s3SecretAccessKey: string;
  s3Endpoint: string;
  azureAccountName: string;
  azureAccountKey: string;
  azureConnectionString: string;
}

function getInitialValues(connection?: Connection | null): FormValues {
  const defaults: FormValues = {
    category: 'database',
    name: '',
    driver: 'postgres',
    dsn: '',
    storageProvider: 's3',
    s3Region: '',
    s3AccessKeyId: '',
    s3SecretAccessKey: '',
    s3Endpoint: '',
    azureAccountName: '',
    azureAccountKey: '',
    azureConnectionString: '',
  };

  if (!connection) return defaults;

  if (connection.sql) {
    return { ...defaults, category: 'database', name: connection.name, driver: connection.sql.driver, dsn: connection.sql.dsn };
  }
  if (connection.amazonS3) {
    return {
      ...defaults,
      category: 'storage',
      name: connection.name,
      storageProvider: 's3',
      s3Region: connection.amazonS3.region,
      s3AccessKeyId: connection.amazonS3.accessKeyId,
      s3SecretAccessKey: connection.amazonS3.secretAccessKey,
      s3Endpoint: connection.amazonS3.endpoint ?? '',
    };
  }
  if (connection.azureBlob) {
    return {
      ...defaults,
      category: 'storage',
      name: connection.name,
      storageProvider: 'azure-blob',
      azureAccountName: connection.azureBlob.accountName,
      azureAccountKey: connection.azureBlob.accountKey ?? '',
      azureConnectionString: connection.azureBlob.connectionString ?? '',
    };
  }

  return { ...defaults, name: connection.name };
}

// Validate based on current form values
function validateForm(values: FormValues): Record<string, string> | undefined {
  const result = connectionFormSchema.safeParse(values);
  if (result.success) return undefined;

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join('.');
    if (path && !errors[path]) {
      errors[path] = issue.message;
    }
  }
  return Object.keys(errors).length > 0 ? errors : undefined;
}

export function ConnectionModal({ connection, onSave, onClose }: ConnectionModalProps) {
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testError, setTestError] = useState<string | null>(null);
  const [submitErrors, setSubmitErrors] = useState<Record<string, string>>({});

  const isEditing = !!connection;

  // Build connection payload from form values
  const buildConnectionPayload = (value: FormValues): Omit<Connection, 'id' | 'createdAt'> => {
    if (value.category === 'database') {
      return { name: value.name, sql: { driver: value.driver, dsn: value.dsn } };
    } else if (value.storageProvider === 's3') {
      return {
        name: value.name,
        amazonS3: {
          region: value.s3Region || 'us-east-1',
          accessKeyId: value.s3AccessKeyId,
          secretAccessKey: value.s3SecretAccessKey,
          ...(value.s3Endpoint && { endpoint: value.s3Endpoint }),
        },
      };
    } else {
      return {
        name: value.name,
        azureBlob: {
          accountName: value.azureAccountName,
          ...(value.azureAccountKey && { accountKey: value.azureAccountKey }),
          ...(value.azureConnectionString && { connectionString: value.azureConnectionString }),
        },
      };
    }
  };

  const form = useForm({
    defaultValues: getInitialValues(connection),
    onSubmit: async ({ value }) => {
      // Validate before submit
      const errors = validateForm(value);
      if (errors) {
        setSubmitErrors(errors);
        return;
      }
      setSubmitErrors({});
      await onSave(buildConnectionPayload(value));
      onClose();
    },
  });

  const resetTestStatus = () => {
    setTestStatus('idle');
    setTestError(null);
  };

  // Save & Test: create connection on server, test it, delete if test fails
  const handleSaveAndTest = async () => {
    const values = form.state.values;
    
    // Validate first
    const errors = validateForm(values);
    if (errors) {
      setSubmitErrors(errors);
      return;
    }
    setSubmitErrors({});
    setTestStatus('testing');
    setTestError(null);

    let savedConnection: Connection | null = null;

    try {
      // 1. Save connection directly to server first
      const payload = buildConnectionPayload(values);
      const connToSave = {
        ...payload,
        id: connection?.id || crypto.randomUUID(),
        createdAt: connection?.createdAt || new Date().toISOString(),
      };

      const saveUrl = connection?.id 
        ? `/connections/${encodeURIComponent(connection.id)}`
        : '/connections';
      const saveMethod = connection?.id ? 'PUT' : 'POST';
      
      const saveResponse = await fetch(saveUrl, {
        method: saveMethod,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(connToSave),
      });
      
      if (!saveResponse.ok) {
        const data = await saveResponse.json();
        throw new Error(data.message || 'Failed to save connection');
      }
      
      savedConnection = connToSave as Connection;

      // 2. Test the connection
      if (values.category === 'database') {
        const response = await fetch(`/sql/${savedConnection.id}/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: 'SELECT 1', params: [] }),
        });
        const data = await response.json();
        if (data.message) {
          throw new Error(data.message);
        }
      } else {
        const response = await fetch(`/storage/${savedConnection.id}/containers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.message || 'Connection failed');
        }
      }

      // 3. Success! Update local state via onSave callback
      setTestStatus('success');
      await onSave(payload);
      setTimeout(() => onClose(), 500);
    } catch (err) {
      setTestStatus('error');
      setTestError(err instanceof Error ? err.message : 'Connection failed');

      // 4. Delete the connection on error (if we created a new one)
      if (savedConnection && !connection?.id) {
        try {
          await fetch(`/connections/${encodeURIComponent(savedConnection.id)}`, {
            method: 'DELETE',
          });
        } catch {
          // Ignore delete errors
        }
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-md bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl border border-neutral-200 dark:border-white/10 overflow-hidden">
        {/* Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          className="p-5 space-y-4"
        >
          {/* Subscribe to form state for conditional rendering */}
          <form.Subscribe selector={(state) => state.values}>
            {(values) => (
              <>
                {/* Top Bar: Type Switcher */}
                {!isEditing && (
                  <div className="flex gap-2 p-1 bg-neutral-100 dark:bg-white/5 rounded-xl -mt-1">
                    <button
                      type="button"
                      onClick={() => { form.setFieldValue('category', 'database'); resetTestStatus(); }}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                        values.category === 'database'
                          ? 'bg-white dark:bg-white/10 text-neutral-800 dark:text-neutral-100 shadow-sm'
                          : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
                      }`}
                    >
                      <Database className="w-4 h-4" />
                      Database
                    </button>
                    <button
                      type="button"
                      onClick={() => { form.setFieldValue('category', 'storage'); resetTestStatus(); }}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                        values.category === 'storage'
                          ? 'bg-white dark:bg-white/10 text-neutral-800 dark:text-neutral-100 shadow-sm'
                          : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
                      }`}
                    >
                      <Cloud className="w-4 h-4" />
                      Storage
                    </button>
                  </div>
                )}

                {/* Database Form */}
                {values.category === 'database' && (
                  <>
                    {/* Database Type - only show when creating new */}
                    {!isEditing && (
                      <form.Field name="driver">
                        {(field) => (
                          <div className="space-y-1.5">
                            <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                              Database Type
                            </label>
                            <div className="grid grid-cols-5 gap-1.5">
                              {(Object.keys(driverInfo) as DatabaseDriver[]).map((key) => (
                                <button
                                  key={key}
                                  type="button"
                                  onClick={() => { field.handleChange(key); resetTestStatus(); }}
                                  className={`px-2 py-2 text-[10px] font-semibold rounded-lg border transition-all ${
                                    values.driver === key
                                      ? driverStyles[key].active
                                      : 'bg-neutral-50 dark:bg-white/5 border-neutral-200 dark:border-white/10 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/10'
                                  }`}
                                >
                                  {driverStyles[key].label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </form.Field>
                    )}

                    {/* Name Field */}
                    <form.Field name="name">
                      {(field) => (
                        <div className="space-y-1.5">
                          <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                            Connection Name
                          </label>
                          <input
                            type="text"
                            placeholder="My Database"
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                            onBlur={field.handleBlur}
                            className={inputClass}
                            autoFocus
                          />
                          {submitErrors.name && <p className={errorClass}>{submitErrors.name}</p>}
                        </div>
                      )}
                    </form.Field>

                    <form.Field name="dsn">
                      {(field) => (
                        <div className="space-y-1.5">
                          <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                            Connection String
                          </label>
                          <input
                            type="text"
                            value={field.state.value}
                            onChange={(e) => { field.handleChange(e.target.value); resetTestStatus(); }}
                            onBlur={field.handleBlur}
                            className={inputMonoClass}
                          />
                          {submitErrors.dsn && <p className={errorClass}>{submitErrors.dsn}</p>}
                        </div>
                      )}
                    </form.Field>
                  </>
                )}

                {/* Storage Form */}
                {values.category === 'storage' && (
                  <>
                    {/* Storage Provider - only show when creating new */}
                    {!isEditing && (
                      <form.Field name="storageProvider">
                        {(field) => (
                          <div className="space-y-1.5">
                            <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                              Storage Provider
                            </label>
                            <div className="grid grid-cols-2 gap-1.5">
                              {(Object.keys(storageProviderInfo) as StorageProvider[]).map((key) => (
                                <button
                                  key={key}
                                  type="button"
                                  onClick={() => { field.handleChange(key); resetTestStatus(); }}
                                  className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-all ${
                                    values.storageProvider === key
                                      ? storageProviderInfo[key].color
                                      : 'bg-neutral-50 dark:bg-white/5 border-neutral-200 dark:border-white/10 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/10'
                                  }`}
                                >
                                  {storageProviderInfo[key].label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </form.Field>
                    )}

                    {/* Name Field */}
                    <form.Field name="name">
                      {(field) => (
                        <div className="space-y-1.5">
                          <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                            Connection Name
                          </label>
                          <input
                            type="text"
                            placeholder="My Storage"
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                            onBlur={field.handleBlur}
                            className={inputClass}
                            autoFocus
                          />
                          {submitErrors.name && <p className={errorClass}>{submitErrors.name}</p>}
                        </div>
                      )}
                    </form.Field>

                    {/* S3 Fields */}
                    {values.storageProvider === 's3' && (
                      <>
                        <form.Field name="s3Endpoint">
                          {(field) => (
                            <div className="space-y-1.5">
                              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                                Custom Endpoint <span className="text-neutral-400">(optional)</span>
                              </label>
                              <input
                                type="text"
                                placeholder="https://s3.example.com"
                                value={field.state.value}
                                onChange={(e) => { field.handleChange(e.target.value); resetTestStatus(); }}
                                onBlur={field.handleBlur}
                                className={inputClass}
                              />
                            </div>
                          )}
                        </form.Field>
                        <form.Field name="s3Region">
                          {(field) => (
                            <div className="space-y-1.5">
                              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                                Region <span className="text-neutral-400">(optional)</span>
                              </label>
                              <input
                                type="text"
                                placeholder="us-east-1"
                                value={field.state.value}
                                onChange={(e) => { field.handleChange(e.target.value); resetTestStatus(); }}
                                onBlur={field.handleBlur}
                                className={inputClass}
                              />
                              {submitErrors.s3Region && <p className={errorClass}>{submitErrors.s3Region}</p>}
                            </div>
                          )}
                        </form.Field>
                        <form.Field name="s3AccessKeyId">
                          {(field) => (
                            <div className="space-y-1.5">
                              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">Access Key ID</label>
                              <input
                                type="text"
                                placeholder="AKIAIOSFODNN7EXAMPLE"
                                value={field.state.value}
                                onChange={(e) => { field.handleChange(e.target.value); resetTestStatus(); }}
                                onBlur={field.handleBlur}
                                className={inputMonoClass}
                              />
                              {submitErrors.s3AccessKeyId && <p className={errorClass}>{submitErrors.s3AccessKeyId}</p>}
                            </div>
                          )}
                        </form.Field>
                        <form.Field name="s3SecretAccessKey">
                          {(field) => (
                            <div className="space-y-1.5">
                              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">Secret Access Key</label>
                              <input
                                type="password"
                                placeholder="••••••••••••••••"
                                value={field.state.value}
                                onChange={(e) => { field.handleChange(e.target.value); resetTestStatus(); }}
                                onBlur={field.handleBlur}
                                className={inputMonoClass}
                              />
                              {submitErrors.s3SecretAccessKey && <p className={errorClass}>{submitErrors.s3SecretAccessKey}</p>}
                            </div>
                          )}
                        </form.Field>
                      </>
                    )}

                    {/* Azure Fields */}
                    {values.storageProvider === 'azure-blob' && (
                      <>
                        <form.Field name="azureAccountName">
                          {(field) => (
                            <div className="space-y-1.5">
                              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">Storage Account Name</label>
                              <input
                                type="text"
                                placeholder="mystorageaccount"
                                value={field.state.value}
                                onChange={(e) => { field.handleChange(e.target.value); resetTestStatus(); }}
                                onBlur={field.handleBlur}
                                className={inputClass}
                              />
                              {submitErrors.azureAccountName && <p className={errorClass}>{submitErrors.azureAccountName}</p>}
                            </div>
                          )}
                        </form.Field>
                        <form.Field name="azureAccountKey">
                          {(field) => (
                            <div className="space-y-1.5">
                              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                                Account Key <span className="text-neutral-400">(or use connection string)</span>
                              </label>
                              <input
                                type="password"
                                placeholder="••••••••••••••••"
                                value={field.state.value}
                                onChange={(e) => { field.handleChange(e.target.value); resetTestStatus(); }}
                                onBlur={field.handleBlur}
                                className={inputMonoClass}
                              />
                              {submitErrors.azureAccountKey && <p className={errorClass}>{submitErrors.azureAccountKey}</p>}
                            </div>
                          )}
                        </form.Field>
                        <form.Field name="azureConnectionString">
                          {(field) => (
                            <div className="space-y-1.5">
                              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                                Connection String <span className="text-neutral-400">(alternative)</span>
                              </label>
                              <input
                                type="password"
                                placeholder="DefaultEndpointsProtocol=https;AccountName=..."
                                value={field.state.value}
                                onChange={(e) => { field.handleChange(e.target.value); resetTestStatus(); }}
                                onBlur={field.handleBlur}
                                className={inputMonoClass}
                              />
                            </div>
                          )}
                        </form.Field>
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </form.Subscribe>

          {/* Test Status Messages */}
          {testStatus === 'success' && (
            <p className="text-xs text-blue-600 dark:text-blue-400">✓ Connection successful</p>
          )}
          {testStatus === 'error' && testError && (
            <p className="text-xs text-red-500 dark:text-red-400 break-all">{testError}</p>
          )}

          {/* Actions */}
          <form.Subscribe selector={(state) => state.values}>
            {(values) => {
              const formValid = (() => {
                if (!values.name) return false;
                if (values.category === 'database') return !!values.dsn;
                if (values.storageProvider === 's3') return !!values.s3AccessKeyId && !!values.s3SecretAccessKey;
                return !!values.azureAccountName && (!!values.azureAccountKey || !!values.azureConnectionString);
              })();

              return (
                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveAndTest}
                    disabled={!formValid || testStatus === 'testing'}
                    className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-neutral-800 dark:bg-neutral-200 text-white dark:text-neutral-900 rounded-lg hover:bg-neutral-700 dark:hover:bg-neutral-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {testStatus === 'testing' && (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    )}
                    {testStatus === 'testing' ? 'Saving...' : 'Save'}
                  </button>
                </div>
              );
            }}
          </form.Subscribe>
        </form>
      </div>
    </div>
  );
}
