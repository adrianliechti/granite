package server

import (
	"database/sql"
	"encoding/json"
	"net/http"
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

	resp := SQLResponse{
		Columns: columns,
		Rows:    data,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}
