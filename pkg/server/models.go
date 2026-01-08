package server

import (
	"time"

	"github.com/adrianliechti/granite/pkg/storage/azblob"
	"github.com/adrianliechti/granite/pkg/storage/s3"
)

type Config struct {
	AI *AIConfig `json:"ai,omitempty"`
}

type AIConfig struct {
	Model string `json:"model,omitempty"`
}

type ErrorResponse struct {
	Message string `json:"message"`
}

// Connection represents a database or storage connection configuration
type Connection struct {
	ID   string `json:"id"`
	Name string `json:"name"`

	// SQL connection
	SQL *SQLConfig `json:"sql,omitempty"`

	// Storage connections (only one should be set)
	AmazonS3  *s3.Config     `json:"amazonS3,omitempty"`
	AzureBlob *azblob.Config `json:"azureBlob,omitempty"`

	CreatedAt *time.Time `json:"createdAt,omitempty"`
	UpdatedAt *time.Time `json:"updatedAt,omitempty"`
}

// SQLConfig contains SQL database connection configuration
type SQLConfig struct {
	Driver string `json:"driver"` // "postgres", "mysql", "sqlite", "sqlserver", "oracle"
	DSN    string `json:"dsn"`
}

type SQLRequest struct {
	Query  string `json:"query"`
	Params []any  `json:"params"`
}

type SQLResponse struct {
	Columns      []string         `json:"columns,omitempty"`
	Rows         []map[string]any `json:"rows,omitempty"`
	RowsAffected int64            `json:"rows_affected,omitempty"`
	Error        string           `json:"error,omitempty"`
}
