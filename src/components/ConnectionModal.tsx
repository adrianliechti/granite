import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import type { Connection, DatabaseDriver } from "../types";
import { driverInfo, buildDSN, type ConnectionFields } from "../lib/connection";
import { Dialog } from "./Dialog";

interface ConnectionModalProps {
  connection?: Connection | null;
  onSave: (conn: Connection) => Promise<Connection>;
  onClose: () => void;
}
export function ConnectionModal({
  connection,
  onSave,
  onClose,
}: ConnectionModalProps) {
  const [name, setName] = useState(connection?.name ?? "");
  const [type, setType] = useState(
    connection?.sql?.driver ??
      (connection?.azureBlob
        ? "azure-blob"
        : connection?.amazonS3
          ? "s3"
          : "postgres"),
  );
  const [dsn, setDSN] = useState(connection?.sql?.dsn ?? ""),
    [reveal, setReveal] = useState(false),
    [builder, setBuilder] = useState(false);
  const [fields, setFields] = useState<ConnectionFields>({
    host: "localhost",
    port: "",
    user: "",
    password: "",
    database: "",
    catalog: "",
    tls: true,
  });
  const [s3, setS3] = useState(
    connection?.amazonS3 ?? {
      region: "us-east-1",
      accessKeyId: "",
      secretAccessKey: "",
      endpoint: "",
    },
  );
  const [azure, setAzure] = useState(
    connection?.azureBlob ?? {
      accountName: "",
      accountKey: "",
      sasToken: "",
      connectionString: "",
    },
  );
  const [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [pending, setPending] = useState<"test" | "save" | null>(null);
  const isSQL = type !== "s3" && type !== "azure-blob";
  const driver = type as DatabaseDriver;
  const reset = () => {
    setStatus("");
    setError("");
  };
  const payload = (save: boolean): Connection => {
    if (save && !name.trim()) throw new Error("Enter a connection name.");
    if (isSQL && !dsn.trim()) throw new Error("Enter a connection string.");
    if (type === "s3" && (!s3.accessKeyId || !s3.secretAccessKey))
      throw new Error("Enter an access key ID and secret access key.");
    if (
      type === "azure-blob" &&
      !azure.connectionString &&
      (!azure.accountName || (!azure.accountKey && !azure.sasToken))
    )
      throw new Error(
        "Enter a connection string, or an account name and key / SAS token.",
      );
    return {
      id: connection?.id ?? crypto.randomUUID(),
      name: name.trim(),
      createdAt: connection?.createdAt,
      ...(isSQL
        ? { sql: { driver, dsn: dsn.trim() } }
        : type === "s3"
          ? { amazonS3: s3 }
          : { azureBlob: azure }),
    };
  };
  const submit = async (action: "test" | "save") => {
    setPending(action);
    reset();
    try {
      const conn = payload(action === "save");
      const response = await fetch(
        action === "test"
          ? "/connections/test"
          : connection
            ? `/connections/${encodeURIComponent(connection.id)}`
            : "/connections",
        {
          method: action === "save" && connection ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(conn),
          signal: AbortSignal.timeout(20_000),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Connection failed");
      if (action === "test") setStatus("Connection successful");
      else {
        await onSave(result);
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setPending(null);
    }
  };
  const field = (
    key: keyof ConnectionFields,
    label: string,
    secret = false,
  ) => (
    <label className="form-field">
      {label}
      <input
        className="field"
        type={secret && !reveal ? "password" : "text"}
        value={String(fields[key])}
        onChange={(e) => {
          setFields((current) => ({ ...current, [key]: e.target.value }));
          reset();
        }}
        autoComplete="off"
        placeholder={key === "port" ? driverInfo[driver]?.port : undefined}
      />
    </label>
  );
  return (
    <Dialog
      title={connection ? "Edit connection" : "Add connection"}
      onClose={onClose}
      busy={!!pending}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit("save");
        }}
        className="p-4 space-y-4"
      >
        <fieldset disabled={!!pending} className="space-y-4">
          <label className="form-field">
            Name
            <input
              className="field"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                reset();
              }}
              placeholder="e.g. Local development"
              autoFocus
              required
            />
          </label>
          <label className="form-field">
            Type
            <select
              className="field"
              aria-label="Connection type"
              value={type}
              onChange={(e) => {
                setType(e.target.value as typeof type);
                setBuilder(false);
                reset();
              }}
            >
              <optgroup label="Database">
                {Object.entries(driverInfo).map(([id, info]) => (
                  <option key={id} value={id}>
                    {info.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Object storage">
                <option value="s3">Amazon S3 / S3 compatible</option>
                <option value="azure-blob">Azure Blob Storage</option>
              </optgroup>
            </select>
          </label>
          {isSQL ? (
            <>
              <div className="form-field">
                <label htmlFor="connection-dsn">
                  {driver === "sqlite" ? "Database file" : "Connection string"}
                </label>
                <div className="flex items-center gap-1">
                  <input
                    id="connection-dsn"
                    className="field font-mono min-w-0 flex-1"
                    type={reveal || driver === "sqlite" ? "text" : "password"}
                    value={dsn}
                    onChange={(e) => {
                      setDSN(e.target.value);
                      reset();
                    }}
                    placeholder={driverInfo[driver].placeholder}
                    autoComplete="off"
                    spellCheck={false}
                    required
                  />
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={
                      reveal ? "Hide credentials" : "Show credentials"
                    }
                    onClick={() => setReveal(!reveal)}
                  >
                    {reveal ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <p className="muted text-xs">
                  {driver === "sqlite"
                    ? "Path on the machine running Granite."
                    : driverInfo[driver].placeholder}
                </p>
              </div>
              {driver !== "sqlite" && (
                <>
                  <button
                    className="text-button"
                    type="button"
                    aria-expanded={builder}
                    onClick={() => setBuilder(!builder)}
                  >
                    {builder
                      ? "Hide connection fields"
                      : "Build from connection fields"}
                  </button>
                  {builder && (
                    <div className="connection-builder">
                      <div className="grid grid-cols-[1fr_90px] gap-3">
                        {field("host", "Host")}
                        {field("port", "Port")}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {field("user", "User")}
                        {field("password", "Password", true)}
                      </div>
                      {field(
                        "database",
                        driver === "oracle"
                          ? "Service name"
                          : driver === "trino"
                            ? "Schema"
                            : "Database",
                      )}
                      {driver === "trino" && field("catalog", "Catalog")}
                      <div className="flex items-center justify-between">
                        <label className="inline-check">
                          <input
                            type="checkbox"
                            checked={fields.tls}
                            onChange={(e) =>
                              setFields({ ...fields, tls: e.target.checked })
                            }
                          />
                          TLS
                        </label>
                        <button
                          className="text-button"
                          type="button"
                          onClick={() => {
                            try {
                              setDSN(buildDSN(driver, fields));
                              reset();
                            } catch (err) {
                              setError(
                                err instanceof Error
                                  ? err.message
                                  : "Invalid fields",
                              );
                            }
                          }}
                        >
                          Use these fields
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          ) : type === "s3" ? (
            <>
              <label className="form-field">
                Region
                <input
                  className="field"
                  value={s3.region}
                  onChange={(e) => {
                    setS3({ ...s3, region: e.target.value });
                    reset();
                  }}
                />
              </label>
              <label className="form-field">
                Access key ID
                <input
                  className="field font-mono"
                  value={s3.accessKeyId}
                  onChange={(e) => {
                    setS3({ ...s3, accessKeyId: e.target.value });
                    reset();
                  }}
                  autoComplete="off"
                />
              </label>
              <label className="form-field">
                Secret access key
                <input
                  className="field font-mono"
                  type={reveal ? "text" : "password"}
                  value={s3.secretAccessKey}
                  onChange={(e) => {
                    setS3({ ...s3, secretAccessKey: e.target.value });
                    reset();
                  }}
                  autoComplete="off"
                />
              </label>
              <label className="form-field">
                Endpoint <span className="muted">Optional</span>
                <input
                  className="field"
                  value={s3.endpoint ?? ""}
                  onChange={(e) => {
                    setS3({ ...s3, endpoint: e.target.value });
                    reset();
                  }}
                  placeholder="https://s3.example.com"
                />
              </label>
            </>
          ) : (
            <>
              <label className="form-field">
                Connection string{" "}
                <span className="muted">Or use account details below</span>
                <input
                  className="field font-mono"
                  type={reveal ? "text" : "password"}
                  value={azure.connectionString ?? ""}
                  onChange={(e) => {
                    setAzure({ ...azure, connectionString: e.target.value });
                    reset();
                  }}
                  autoComplete="off"
                />
              </label>
              <label className="form-field">
                Account name
                <input
                  className="field"
                  value={azure.accountName}
                  onChange={(e) => {
                    setAzure({ ...azure, accountName: e.target.value });
                    reset();
                  }}
                />
              </label>
              <label className="form-field">
                Account key
                <input
                  className="field font-mono"
                  type={reveal ? "text" : "password"}
                  value={azure.accountKey ?? ""}
                  onChange={(e) => {
                    setAzure({ ...azure, accountKey: e.target.value });
                    reset();
                  }}
                  autoComplete="off"
                />
              </label>
              <label className="form-field">
                SAS token{" "}
                <span className="muted">Alternative to account key</span>
                <input
                  className="field font-mono"
                  type={reveal ? "text" : "password"}
                  value={azure.sasToken ?? ""}
                  onChange={(e) => {
                    setAzure({ ...azure, sasToken: e.target.value });
                    reset();
                  }}
                  autoComplete="off"
                />
              </label>
            </>
          )}
          {!isSQL && (
            <button
              type="button"
              className="text-button"
              onClick={() => setReveal(!reveal)}
            >
              {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
              {reveal ? "Hide credentials" : "Show credentials"}
            </button>
          )}
        </fieldset>
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        {status && (
          <p role="status" className="text-xs">
            {status}
          </p>
        )}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            className="text-button"
            onClick={() => void submit("test")}
            disabled={!!pending}
          >
            {pending === "test" && (
              <Loader2 size={14} className="animate-spin" />
            )}
            Test connection
          </button>
          <span className="flex-1" />
          <button
            type="button"
            className="text-button"
            onClick={onClose}
            disabled={!!pending}
          >
            Cancel
          </button>
          <button className="button" disabled={!!pending}>
            {pending === "save" && (
              <Loader2 size={14} className="animate-spin" />
            )}
            Save
          </button>
        </div>
      </form>
    </Dialog>
  );
}
