package server

import (
	"encoding/json"
	"io"
	"net/http"
	"os"

	"github.com/gabriel-vasile/mimetype"
)

// POST /storage/{connection}/upload - Upload an object to storage
func (s *Server) handleStorageUploadObject(w http.ResponseWriter, r *http.Request) {
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

	// Parse multipart form (32 MB max)
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "Failed to parse multipart form")
		return
	}

	// Get upload parameters from form
	container := r.FormValue("container")
	objectKey := r.FormValue("key")

	if container == "" || objectKey == "" {
		writeError(w, http.StatusBadRequest, "container and key are required")
		return
	}

	ctx := r.Context()
	storageProvider, err := newStorageProviderFromConnection(ctx, conn)

	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Get the uploaded file
	file, header, err := r.FormFile("file")

	if err != nil {
		writeError(w, http.StatusBadRequest, "No file uploaded")
		return
	}

	defer file.Close()

	// Read file data
	data, err := io.ReadAll(file)

	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to read file")
		return
	}

	// Get content type from form or header
	contentType := r.FormValue("contentType")

	if contentType == "" {
		contentType = header.Header.Get("Content-Type")
	}

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
