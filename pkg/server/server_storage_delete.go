package server

import (
	"encoding/json"
	"net/http"
)

// DeleteObjectRequest contains parameters for deleting objects
type DeleteObjectRequest struct {
	StorageRequest
	Container string   `json:"container"`
	Keys      []string `json:"keys"` // One or more object keys to delete
}

// POST /storage/object/delete - Delete one or more objects from storage
func (s *Server) handleStorageDeleteObject(w http.ResponseWriter, r *http.Request) {
	var req DeleteObjectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Container == "" {
		writeError(w, http.StatusBadRequest, "container is required")
		return
	}

	if len(req.Keys) == 0 {
		writeError(w, http.StatusBadRequest, "at least one key is required")
		return
	}

	ctx := r.Context()
	provider, err := newStorageProvider(ctx, req.StorageRequest)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Use DeleteObjects for efficiency (handles single or multiple keys)
	if err := provider.DeleteObjects(ctx, req.Container, req.Keys); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]any{
		"deleted": len(req.Keys),
	})
}
