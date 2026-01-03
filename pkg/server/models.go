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

type SQLRequest struct {
	Driver string `json:"driver"`
	DSN    string `json:"dsn"`

	Query  string `json:"query"`
	Params []any  `json:"params"`
}

type SQLResponse struct {
	Columns      []string         `json:"columns,omitempty"`
	Rows         []map[string]any `json:"rows,omitempty"`
	RowsAffected int64            `json:"rows_affected,omitempty"`
	Error        string           `json:"error,omitempty"`
}
