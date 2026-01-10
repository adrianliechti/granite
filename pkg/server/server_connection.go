package server

import (
	"encoding/json"
	"net/http"
	"os"
)

// GET /connections - List all connections
func (s *Server) handleConnectionList(w http.ResponseWriter, r *http.Request) {
	connections, err := s.listConnections()

	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(connections)
}

// GET /connections/{id} - Get a specific connection
func (s *Server) handleConnectionGet(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	conn, err := s.getConnection(id)

	if err != nil {
		if os.IsNotExist(err) {
			writeError(w, http.StatusNotFound, "connection not found")
			return
		}

		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(conn)
}

// POST /connections - Create a new connection
func (s *Server) handleConnectionCreate(w http.ResponseWriter, r *http.Request) {
	var conn Connection

	if err := json.NewDecoder(r.Body).Decode(&conn); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if conn.ID == "" {
		writeError(w, http.StatusBadRequest, "id is required")
		return
	}

	if conn.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}

	isSQL := conn.SQL != nil
	isStorage := conn.AmazonS3 != nil || conn.AzureBlob != nil

	if !isSQL && !isStorage {
		writeError(w, http.StatusBadRequest, "connection must have a SQL or storage configuration")
		return
	}

	if isSQL && isStorage {
		writeError(w, http.StatusBadRequest, "connection cannot have both SQL and storage configurations")
		return
	}

	if isSQL && conn.SQL.DSN == "" {
		writeError(w, http.StatusBadRequest, "dsn is required for sql connections")
		return
	}

	// Check if connection already exists
	if _, err := s.getConnection(conn.ID); err == nil {
		writeError(w, http.StatusConflict, "connection already exists")
		return
	}

	if err := s.saveConnection(&conn); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(conn)
}

// PUT /connections/{id} - Update an existing connection
func (s *Server) handleConnectionUpdate(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	// Check if connection exists
	if _, err := s.getConnection(id); err != nil {
		if os.IsNotExist(err) {
			writeError(w, http.StatusNotFound, "connection not found")
			return
		}

		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	var conn Connection

	if err := json.NewDecoder(r.Body).Decode(&conn); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Ensure ID matches path
	conn.ID = id

	if conn.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}

	isSQL := conn.SQL != nil
	isStorage := conn.AmazonS3 != nil || conn.AzureBlob != nil

	if !isSQL && !isStorage {
		writeError(w, http.StatusBadRequest, "connection must have a SQL or storage configuration")
		return
	}

	if isSQL && isStorage {
		writeError(w, http.StatusBadRequest, "connection cannot have both SQL and storage configurations")
		return
	}

	if isSQL && conn.SQL.DSN == "" {
		writeError(w, http.StatusBadRequest, "dsn is required for sql connections")
		return
	}

	if err := s.saveConnection(&conn); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(conn)
}

// DELETE /connections/{id} - Delete a connection
func (s *Server) handleConnectionDelete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	if err := s.deleteConnection(id); err != nil {
		if os.IsNotExist(err) {
			writeError(w, http.StatusNotFound, "connection not found")
			return
		}

		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
