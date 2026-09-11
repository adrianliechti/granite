import type { DatabaseDriver } from "../types/index.ts";
export const driverInfo: Record<
  DatabaseDriver,
  { label: string; placeholder: string; port: string }
> = {
  postgres: {
    label: "PostgreSQL",
    placeholder: "postgres://user:password@localhost:5432/database",
    port: "5432",
  },
  mysql: {
    label: "MySQL",
    placeholder: "user:password@tcp(localhost:3306)/database",
    port: "3306",
  },
  sqlite: { label: "SQLite", placeholder: "/path/to/database.db", port: "" },
  sqlserver: {
    label: "SQL Server",
    placeholder: "sqlserver://user:password@localhost:1433?database=mydb",
    port: "1433",
  },
  oracle: {
    label: "Oracle",
    placeholder: "user/password@tcp://localhost:1521/service_name",
    port: "1521",
  },
  trino: {
    label: "Trino",
    placeholder: "http://user@localhost:8080?catalog=tpch&schema=tiny",
    port: "8080",
  },
};
export interface ConnectionFields {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
  catalog: string;
  tls: boolean;
}
export function buildDSN(
  driver: DatabaseDriver,
  fields: ConnectionFields,
): string {
  const { user, password, database, catalog, tls } = fields;
  let host = fields.host.trim();
  if (!host || /[\s/?#@]/.test(host))
    throw new Error("Enter a hostname or IP address without a protocol.");
  if (host.includes(":") && !host.startsWith("[")) host = `[${host}]`;
  const port = fields.port || driverInfo[driver].port;
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
    throw new Error("Enter a port between 1 and 65535.");
  const address = `${host}:${port}`;
  if (driver === "mysql") {
    if (user.includes(":"))
      throw new Error(
        "Use a connection string for usernames containing a colon.",
      );
    return `${user}:${password}@tcp(${address})/${encodeURIComponent(database)}?parseTime=true&tls=${tls}`;
  }
  if (driver === "oracle") {
    if (/[/@]/.test(user) || /@/.test(password) || /[\s/?#]/.test(database))
      throw new Error(
        "Use a connection string for credentials or service names containing special delimiters.",
      );
    return `${user}/${password}@${tls ? "tcps" : "tcp"}://${address}/${database}`;
  }
  const url = new URL(
    `${driver === "postgres" ? "postgres" : driver === "sqlserver" ? "sqlserver" : tls ? "https" : "http"}://${address}`,
  );
  url.username = user;
  url.password = password;
  if (driver === "postgres") {
    url.pathname = `/${encodeURIComponent(database)}`;
    url.searchParams.set("sslmode", tls ? "require" : "disable");
  }
  if (driver === "sqlserver") {
    url.searchParams.set("database", database);
    url.searchParams.set("encrypt", String(tls));
  }
  if (driver === "trino") {
    if (password && !tls)
      throw new Error("Trino requires TLS when using a password.");
    if (catalog) url.searchParams.set("catalog", catalog);
    if (database) url.searchParams.set("schema", database);
  }
  return url.toString();
}
