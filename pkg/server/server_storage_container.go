package server

import (
	"encoding/json"
	"net/http"
)

// POST /storage/containers - List containers
func (s *Server) handleStorageContainers(w http.ResponseWriter, r *http.Request) {
	var req StorageRequest
<<<<<<< HEAD
=======

>>>>>>> a59f79b23a93bc5d1230c130632a6daa6204d0cf
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	ctx := r.Context()
	provider, err := newStorageProvider(ctx, req)
<<<<<<< HEAD
=======

>>>>>>> a59f79b23a93bc5d1230c130632a6daa6204d0cf
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	containers, err := provider.ListContainers(ctx)
<<<<<<< HEAD
=======

>>>>>>> a59f79b23a93bc5d1230c130632a6daa6204d0cf
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
<<<<<<< HEAD
=======

>>>>>>> a59f79b23a93bc5d1230c130632a6daa6204d0cf
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
<<<<<<< HEAD
=======

>>>>>>> a59f79b23a93bc5d1230c130632a6daa6204d0cf
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
