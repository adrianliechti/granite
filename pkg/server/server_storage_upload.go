package server

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/gabriel-vasile/mimetype"
)

// POST /storage/upload - Upload an object to storage
func (s *Server) handleStorageUploadObject(w http.ResponseWriter, r *http.Request) {
	// Parse multipart form (32 MB max)
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "Failed to parse multipart form")
		return
	}

	// Get connection details from form
	provider := r.FormValue("provider")
	configJSON := r.FormValue("config")
	container := r.FormValue("container")
	objectKey := r.FormValue("key")

	if provider == "" || configJSON == "" || container == "" || objectKey == "" {
		writeError(w, http.StatusBadRequest, "provider, config, container, and key are required")
		return
	}

	// Parse config
	var configMap map[string]any
<<<<<<< HEAD
=======

>>>>>>> a59f79b23a93bc5d1230c130632a6daa6204d0cf
	if err := json.Unmarshal([]byte(configJSON), &configMap); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid config JSON")
		return
	}

	// Build storage request
	storageReq := StorageRequest{
		Provider: provider,
		Config:   configMap,
	}

	ctx := r.Context()
	storageProvider, err := newStorageProvider(ctx, storageReq)
<<<<<<< HEAD
=======

>>>>>>> a59f79b23a93bc5d1230c130632a6daa6204d0cf
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Get the uploaded file
	file, header, err := r.FormFile("file")
<<<<<<< HEAD
=======

>>>>>>> a59f79b23a93bc5d1230c130632a6daa6204d0cf
	if err != nil {
		writeError(w, http.StatusBadRequest, "No file uploaded")
		return
	}
<<<<<<< HEAD
=======

>>>>>>> a59f79b23a93bc5d1230c130632a6daa6204d0cf
	defer file.Close()

	// Read file data
	data, err := io.ReadAll(file)
<<<<<<< HEAD
=======

>>>>>>> a59f79b23a93bc5d1230c130632a6daa6204d0cf
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to read file")
		return
	}

	// Get content type from form or header
	contentType := r.FormValue("contentType")
<<<<<<< HEAD
	if contentType == "" {
		contentType = header.Header.Get("Content-Type")
	}
=======

	if contentType == "" {
		contentType = header.Header.Get("Content-Type")
	}

>>>>>>> a59f79b23a93bc5d1230c130632a6daa6204d0cf
	if contentType == "" {
		// Detect from file content
		mtype := mimetype.Detect(data)
		contentType = mtype.String()
	}

	// Upload the object
	if err := storageProvider.UploadObject(ctx, container, objectKey, data, contentType); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{
		"key": objectKey,
	})
}
