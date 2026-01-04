package server

type Config struct {
	AI *AIConfig `json:"ai,omitempty"`
}

type AIConfig struct {
	Model string `json:"model,omitempty"`
}

type ErrorResponse struct {
	Message string `json:"message"`
}

type DatabaseRequest struct {
	Provider string         `json:"provider"` // "sql" or "redis"
	Config   map[string]any `json:"config"`

	Query  string `json:"query"`
	Params []any  `json:"params"`
}

type DatabaseResponse struct {
	Columns      []string         `json:"columns,omitempty"`
	Rows         []map[string]any `json:"rows,omitempty"`
	RowsAffected int64            `json:"rows_affected,omitempty"`
	Error        string           `json:"error,omitempty"`
}
