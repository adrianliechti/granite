package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"

	_ "github.com/go-sql-driver/mysql"
	_ "github.com/lib/pq"
	_ "modernc.org/sqlite"
)

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

func isQuery(query string) bool {
	q := strings.ToUpper(strings.TrimSpace(query))
	prefixes := []string{"SELECT", "WITH", "SHOW", "DESCRIBE", "EXPLAIN", "PRAGMA"}
	for _, p := range prefixes {
		if strings.HasPrefix(q, p) {
			return true
		}
	}
	return strings.Contains(q, "RETURNING")
}

func rowsToJSON(rows *sql.Rows) ([]string, []map[string]interface{}, error) {
	columns, err := rows.Columns()
	if err != nil {
		return nil, nil, err
	}

	var result []map[string]interface{}
	for rows.Next() {
		values := make([]interface{}, len(columns))
		pointers := make([]interface{}, len(columns))
		for i := range values {
			pointers[i] = &values[i]
		}

		if err := rows.Scan(pointers...); err != nil {
			return nil, nil, err
		}

		row := make(map[string]interface{})
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

func main() {
	mux := http.NewServeMux()

	mux.HandleFunc("POST /sql/query", func(w http.ResponseWriter, r *http.Request) {
		var req SQLRequest
		var resp SQLResponse

		w.Header().Set("Content-Type", "application/json")

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			resp.Error = "Invalid request payload: " + err.Error()
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(resp)
			return
		}

		db, err := sql.Open(req.Driver, req.DSN)
		if err != nil {
			resp.Error = "Failed to open database: " + err.Error()
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(resp)
			return
		}
		defer db.Close()

		if err := db.Ping(); err != nil {
			resp.Error = "Failed to connect to database: " + err.Error()
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(resp)
			return
		}

		if isQuery(req.Query) {
			rows, err := db.Query(req.Query, req.Params...)
			if err != nil {
				resp.Error = err.Error()
				w.WriteHeader(http.StatusInternalServerError)
				json.NewEncoder(w).Encode(resp)
				return
			}
			defer rows.Close()

			columns, data, err := rowsToJSON(rows)
			if err != nil {
				resp.Error = err.Error()
				w.WriteHeader(http.StatusInternalServerError)
				json.NewEncoder(w).Encode(resp)
				return
			}

			resp.Columns = columns
			resp.Rows = data
		} else {
			result, err := db.Exec(req.Query, req.Params...)
			if err != nil {
				resp.Error = err.Error()
				w.WriteHeader(http.StatusInternalServerError)
				json.NewEncoder(w).Encode(resp)
				return
			}

			resp.RowsAffected, _ = result.RowsAffected()
		}

		json.NewEncoder(w).Encode(resp)
	})

	http.ListenAndServe(":7777", mux)
}
