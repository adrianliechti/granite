package server

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
)

func (s *Server) handleQuery(w http.ResponseWriter, r *http.Request) {
	var req SQLRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request payload: "+err.Error())
		return
	}

	db, err := sql.Open(req.Driver, req.DSN)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Failed to open database: "+err.Error())
		return
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		writeError(w, http.StatusBadRequest, "Failed to connect to database: "+err.Error())
		return
	}

	var resp SQLResponse

	if isQuery(req.Query) {
		rows, err := db.Query(req.Query, req.Params...)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		defer rows.Close()

		columns, data, err := rowsToJSON(rows)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		resp.Columns = columns
		resp.Rows = data
	} else {
		result, err := db.Exec(req.Query, req.Params...)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		resp.RowsAffected, _ = result.RowsAffected()
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
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
