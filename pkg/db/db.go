package db

import (
	"context"
)

// Provider defines the interface for database operations
type Provider interface {
	// Query executes a query that returns rows (SELECT)
	Query(ctx context.Context, query string, params ...any) (*QueryResult, error)

	// Execute executes a query that doesn't return rows (INSERT, UPDATE, DELETE)
	Execute(ctx context.Context, query string, params ...any) (*ExecResult, error)
}

// QueryResult contains the result of a query operation
type QueryResult struct {
	Columns []string         `json:"columns"`
	Rows    []map[string]any `json:"rows"`
}

// ExecResult contains the result of an execute operation
type ExecResult struct {
	RowsAffected int64 `json:"rowsAffected"`
}
