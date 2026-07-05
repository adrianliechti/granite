# Granite

A lightweight database and object-storage browser. A single Go binary serves the embedded React UI and bridges to your databases and storage accounts.

## Features

- **SQL databases**: PostgreSQL, MySQL, SQL Server, Oracle, SQLite
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

Connections are stored in `~/.local/share/granite`.

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

## Build

```sh
go build ./cmd/granite   # CLI with the UI embedded
task install             # installs the CLI and the desktop app (~/Applications)
```
