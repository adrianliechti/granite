package server

import (
	"encoding/json"
	"net/http"

	"github.com/adrianliechti/granite/pkg/storage"
)

// POST /storage/objects - List objects in a container
func (s *Server) handleStorageObjects(w http.ResponseWriter, r *http.Request) {
	var req ListObjectsRequest
<<<<<<< HEAD
=======

>>>>>>> a59f79b23a93bc5d1230c130632a6daa6204d0cf
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Container == "" {
		writeError(w, http.StatusBadRequest, "Container is required")
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

	opts := storage.ListObjectsOptions{
		Prefix:            req.Prefix,
		Delimiter:         req.Delimiter,
		MaxKeys:           req.MaxKeys,
		ContinuationToken: req.ContinuationToken,
	}

	result, err := provider.ListObjects(ctx, req.Container, opts)
<<<<<<< HEAD
=======

>>>>>>> a59f79b23a93bc5d1230c130632a6daa6204d0cf
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// POST /storage/object/details - Get object metadata
func (s *Server) handleStorageObjectDetails(w http.ResponseWriter, r *http.Request) {
	var req ObjectRequest
<<<<<<< HEAD
=======

>>>>>>> a59f79b23a93bc5d1230c130632a6daa6204d0cf
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Container == "" || req.Key == "" {
		writeError(w, http.StatusBadRequest, "Container and key are required")
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

	result, err := provider.GetObjectDetails(ctx, req.Container, req.Key)
<<<<<<< HEAD
=======

>>>>>>> a59f79b23a93bc5d1230c130632a6daa6204d0cf
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// POST /storage/object/presign - Generate presigned URL
func (s *Server) handleStoragePresignedURL(w http.ResponseWriter, r *http.Request) {
	var req ObjectRequest
<<<<<<< HEAD
=======

>>>>>>> a59f79b23a93bc5d1230c130632a6daa6204d0cf
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Container == "" || req.Key == "" {
		writeError(w, http.StatusBadRequest, "Container and key are required")
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

	expiresIn := req.ExpiresIn
<<<<<<< HEAD
=======

>>>>>>> a59f79b23a93bc5d1230c130632a6daa6204d0cf
	if expiresIn <= 0 {
		expiresIn = 3600 // Default 1 hour
	}

	url, err := provider.GetPresignedURL(ctx, req.Container, req.Key, expiresIn)
<<<<<<< HEAD
=======

>>>>>>> a59f79b23a93bc5d1230c130632a6daa6204d0cf
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(PresignedURLResponse{URL: url})
}
