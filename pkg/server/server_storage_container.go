package server

import (
	"encoding/json"
	"net/http"
	"os"
)

// POST /storage/{connection}/containers - List containers
func (s *Server) handleStorageContainers(w http.ResponseWriter, r *http.Request) {
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

	if conn.AmazonS3 == nil && conn.AzureBlob == nil {
		writeError(w, http.StatusBadRequest, "connection is not a storage connection")
		return
	}

	ctx := r.Context()
	provider, err := newStorageProviderFromConnection(ctx, conn)

	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	containers, err := provider.ListContainers(ctx)

	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(containers)
}

// POST /storage/{connection}/containers/create - Create a new container
func (s *Server) handleStorageCreateContainer(w http.ResponseWriter, r *http.Request) {
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

	if conn.AmazonS3 == nil && conn.AzureBlob == nil {
		writeError(w, http.StatusBadRequest, "connection is not a storage connection")
		return
	}

	var req CreateContainerRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "Container name is required")
		return
	}

	ctx := r.Context()
	provider, err := newStorageProviderFromConnection(ctx, conn)

	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	if err := provider.CreateContainer(ctx, req.Name); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.WriteHeader(http.StatusCreated)
}
