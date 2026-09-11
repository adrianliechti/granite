# Granite

A lightweight database and object-storage browser. A single Go binary serves the embedded React UI and bridges to your databases and storage accounts.

## Features

- **SQL databases**: PostgreSQL, MySQL, SQL Server, Oracle, SQLite, Trino
  - Query editor with Monaco, schema-aware autocompletion
  - Browse databases, tables, and views; edit cells and delete rows inline
- **Object storage**: Amazon S3 (and compatible), Azure Blob Storage
  - Browse containers and objects, upload, download, preview, delete
- **AI assistant** (optional): SQL chat assistant that can inspect results, write, and run queries

## Getting started

### Homebrew (macOS)

Install the Granite desktop app into `/Applications` via Homebrew Cask:

```sh
brew install --cask adrianliechti/tap/granite-app
```

### From source

```sh
# build the frontend and run the server (opens your browser)
task run
```

Or manually:

```sh
npm install
npm run build
go run ./cmd/granite
```

Connections are stored in `~/.local/share/granite`. Set `GRANITE_DATA_DIR` to use another directory.

## Database drivers

| Database | Go driver | Connection string example |
| --- | --- | --- |
| PostgreSQL | [lib/pq](https://github.com/lib/pq) | `postgres://user:password@localhost:5432/database` (keyword DSNs also supported) |
| MySQL | [go-sql-driver/mysql](https://github.com/go-sql-driver/mysql) | `user:password@tcp(localhost:3306)/database` |
| SQL Server | [microsoft/go-mssqldb](https://github.com/microsoft/go-mssqldb) | `sqlserver://user:password@localhost:1433?database=mydb` (ADO and ODBC DSNs also supported) |
| Oracle | [oracle/go-oracledb](https://github.com/oracle/go-oracledb) | `user/password@tcp://localhost:1521/service_name` |
| SQLite | [modernc.org/sqlite](https://pkg.go.dev/modernc.org/sqlite) | `/path/to/database.db` |
| Trino | [trinodb/trino-go-client](https://github.com/trinodb/trino-go-client) | `http://user@localhost:8080?catalog=tpch&schema=tiny` |

Oracle uses the official pure Go driver, pinned to `v26.0.1-beta`, and requires Oracle Database 19c or newer and Go 1.26.6 or newer. It accepts Easy Connect and TNS Connect Descriptors; use `tcps://` for TLS. Existing Oracle connections need their DSN updated from `oracle://user:password@host:1521/service` to `user/password@tcp://host:1521/service`; the saved driver type remains `oracle`.

PostgreSQL browsing currently lists tables in `public`. SQL Server browsing lists unqualified table names in the user's default schema and `dbo`. Oracle browsing lists tables owned by the connected user, and Trino's database selector represents `catalog.schema` pairs.

## AI assistant

Set OpenAI-compatible credentials before starting the server to enable the chat assistant:

```sh
export OPENAI_BASE_URL="https://api.openai.com/v1"   # or any OpenAI-compatible endpoint
export OPENAI_API_KEY="sk-..."
export OPENAI_MODEL="gpt-5.1"
```

The server proxies AI requests at `/openai/v1` and advertises the model to the UI via `/config.json`.

## Development

```sh
go run ./cmd/granite   # backend on http://localhost:7777
npm run dev            # Vite dev server, proxies API calls to :7777
```

Run `npm test` and `go test ./...` for regression tests. For browser tests against real databases, start the Docker services listed in [connection.txt](connection.txt), run `npx playwright install chromium`, then `npm run build && npm run test:e2e`. The tests use an isolated connection directory and clean up their temporary database objects.

Monaco currently pins an older DOMPurify patch; the npm override keeps that dependency on a patched release.

## Build

```sh
go build ./cmd/granite   # CLI with the UI embedded
task install             # installs the CLI and the desktop app (~/Applications)
```
