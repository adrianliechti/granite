package server

import (
	"encoding/json"
	"net/http"
)

// POST /storage/containers - List containers
func (s *Server) handleStorageContainers(w http.ResponseWriter, r *http.Request) {
	var req StorageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	ctx := r.Context()
	provider, err := newStorageProvider(ctx, req)
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

// POST /storage/containers/create - Create a new container
func (s *Server) handleStorageCreateContainer(w http.ResponseWriter, r *http.Request) {
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
	provider, err := newStorageProvider(ctx, req.StorageRequest)
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
