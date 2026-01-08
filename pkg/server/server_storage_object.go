package server

import (
	"encoding/json"
	"net/http"
	"os"

	"github.com/adrianliechti/granite/pkg/storage"
)

// POST /storage/{connection}/objects - List objects in a container
func (s *Server) handleStorageObjects(w http.ResponseWriter, r *http.Request) {
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

	var req ListObjectsRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Container == "" {
		writeError(w, http.StatusBadRequest, "Container is required")
		return
	}

	ctx := r.Context()
	provider, err := newStorageProviderFromConnection(ctx, conn)

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

	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// POST /storage/{connection}/object/details - Get object metadata
func (s *Server) handleStorageObjectDetails(w http.ResponseWriter, r *http.Request) {
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

	var req ObjectRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Container == "" || req.Key == "" {
		writeError(w, http.StatusBadRequest, "Container and key are required")
		return
	}

	ctx := r.Context()
	provider, err := newStorageProviderFromConnection(ctx, conn)

	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	result, err := provider.GetObjectDetails(ctx, req.Container, req.Key)

	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// POST /storage/{connection}/object/presign - Generate presigned URL
func (s *Server) handleStoragePresignedURL(w http.ResponseWriter, r *http.Request) {
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

	var req ObjectRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Container == "" || req.Key == "" {
		writeError(w, http.StatusBadRequest, "Container and key are required")
		return
	}

	ctx := r.Context()
	provider, err := newStorageProviderFromConnection(ctx, conn)

	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	expiresIn := req.ExpiresIn

	if expiresIn <= 0 {
		expiresIn = 3600 // Default 1 hour
	}

	url, err := provider.GetPresignedURL(ctx, req.Container, req.Key, expiresIn)

	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(PresignedURLResponse{URL: url})
}
