package server

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"os"
)

func (s *Server) handleExecute(w http.ResponseWriter, r *http.Request) {
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

	// Modify DSN if a specific database is requested
	dsn := modifyDSNForDatabase(conn.SQL.Driver, conn.SQL.DSN, req.Database)

	db, err := sql.Open(conn.SQL.Driver, dsn)

	if err != nil {
		writeError(w, http.StatusBadRequest, "Failed to open database: "+err.Error())
		return
	}

	defer db.Close()

	if err := db.Ping(); err != nil {
		writeError(w, http.StatusBadRequest, "Failed to connect to database: "+err.Error())
		return
	}

	result, err := db.Exec(req.Query, req.Params...)

	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	rowsAffected, _ := result.RowsAffected()

	resp := SQLResponse{
		RowsAffected: rowsAffected,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}
