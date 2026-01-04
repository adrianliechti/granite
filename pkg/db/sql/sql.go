package sql

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/adrianliechti/granite/pkg/db"
)

var _ db.Provider = (*Provider)(nil)

// Config contains SQL database connection configuration
type Config struct {
	Driver string `json:"driver"`
	DSN    string `json:"dsn"`
}

// Provider implements db.Provider for SQL databases
type Provider struct {
	config Config
}

// New creates a new SQL database provider
func New(cfg Config) (*Provider, error) {
	if cfg.Driver == "" {
		return nil, errors.New("driver is required")
	}

	if cfg.DSN == "" {
		return nil, errors.New("dsn is required")
	}

	return &Provider{
		config: cfg,
	}, nil
}

// ParseConfig parses a config map into Config
func ParseConfig(configMap map[string]any) (Config, error) {
	cfg := Config{}

	if v, ok := configMap["driver"].(string); ok {
		cfg.Driver = v
	}

	if v, ok := configMap["dsn"].(string); ok {
		cfg.DSN = v
	}

	if cfg.Driver == "" {
		return cfg, errors.New("driver is required")
	}

	if cfg.DSN == "" {
		return cfg, errors.New("dsn is required")
	}

	return cfg, nil
}

// Query executes a query that returns rows
func (p *Provider) Query(ctx context.Context, query string, params ...any) (*db.QueryResult, error) {
	conn, err := sql.Open(p.config.Driver, p.config.DSN)

	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	defer conn.Close()

	if err := conn.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	rows, err := conn.QueryContext(ctx, query, params...)

	if err != nil {
		return nil, err
	}

	defer rows.Close()

	columns, data, err := rowsToJSON(rows)

	if err != nil {
		return nil, err
	}

	return &db.QueryResult{
		Columns: columns,
		Rows:    data,
	}, nil
}

// Execute executes a query that doesn't return rows
func (p *Provider) Execute(ctx context.Context, query string, params ...any) (*db.ExecResult, error) {
	conn, err := sql.Open(p.config.Driver, p.config.DSN)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}
	defer conn.Close()

	if err := conn.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	result, err := conn.ExecContext(ctx, query, params...)

	if err != nil {
		return nil, err
	}

	rowsAffected, _ := result.RowsAffected()

	return &db.ExecResult{
		RowsAffected: rowsAffected,
	}, nil
}

// rowsToJSON converts sql.Rows to columns and row data
func rowsToJSON(rows *sql.Rows) ([]string, []map[string]any, error) {
	columns, err := rows.Columns()

	if err != nil {
		return nil, nil, err
	}

	var result []map[string]any

	for rows.Next() {
		values := make([]any, len(columns))
		pointers := make([]any, len(columns))

		for i := range values {
			pointers[i] = &values[i]
		}

		if err := rows.Scan(pointers...); err != nil {
			return nil, nil, err
		}

		row := make(map[string]any)

		for i, col := range columns {
			val := values[i]

			if b, ok := val.([]byte); ok {
				row[col] = string(b)
			} else {
				row[col] = val
			}
		}

		result = append(result, row)
	}

	return columns, result, rows.Err()
}
