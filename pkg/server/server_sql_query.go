package server

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"os"
)

func (s *Server) handleQuery(w http.ResponseWriter, r *http.Request) {
	connID := r.PathValue("connection")

	conn, err := s.getConnection(connID)
	if err != nil {
		if os.IsNotExist(err) {
			writeError(w, http.StatusNotFound, "connection not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if conn.SQL == nil {
		writeError(w, http.StatusBadRequest, "connection is not a SQL connection")
		return
	}

	var req SQLRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request payload: "+err.Error())
		return
	}

	db, err := sql.Open(conn.SQL.Driver, conn.SQL.DSN)

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
