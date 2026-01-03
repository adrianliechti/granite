package server

import (
	"context"

	"github.com/adrianliechti/granite/pkg/storage"
	"github.com/adrianliechti/granite/pkg/storage/azblob"
	"github.com/adrianliechti/granite/pkg/storage/s3"
)

// StorageRequest is the base request for storage operations
type StorageRequest struct {
	Provider string         `json:"provider"` // "s3" or "azure-blob"
	Config   map[string]any `json:"config"`
}

// ListObjectsRequest contains parameters for listing objects
type ListObjectsRequest struct {
	StorageRequest
	Container         string `json:"container"`
	Prefix            string `json:"prefix"`
	Delimiter         string `json:"delimiter"`
	MaxKeys           int    `json:"maxKeys"`
	ContinuationToken string `json:"continuationToken"`
}

// ObjectRequest contains parameters for object operations
type ObjectRequest struct {
	StorageRequest
	Container string `json:"container"`
	Key       string `json:"key"`
	ExpiresIn int    `json:"expiresIn,omitempty"`
}

// CreateContainerRequest contains parameters for creating a container
type CreateContainerRequest struct {
	StorageRequest
	Name string `json:"name"`
}

// PresignedURLResponse contains a presigned URL
type PresignedURLResponse struct {
	URL string `json:"url"`
}

// newStorageProvider creates a storage provider based on the request
func newStorageProvider(ctx context.Context, req StorageRequest) (storage.Provider, error) {
	switch req.Provider {
	case "s3":
		cfg, err := s3.ParseConfig(req.Config)

		if err != nil {
			return nil, err
		}

		return s3.New(ctx, cfg)

	case "azure-blob":
		cfg, err := azblob.ParseConfig(req.Config)

		if err != nil {
			return nil, err
		}

		return azblob.New(cfg)

	default:
		return nil, ErrUnsupportedProvider
	}
}

// ErrUnsupportedProvider is returned when an unsupported storage provider is specified
var ErrUnsupportedProvider = &Error{Message: "unsupported storage provider"}

// Error represents a storage error
type Error struct {
	Message string
}

func (e *Error) Error() string {
	return e.Message
}
