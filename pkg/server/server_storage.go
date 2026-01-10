package server

import (
	"context"

	"github.com/adrianliechti/granite/pkg/storage"
	"github.com/adrianliechti/granite/pkg/storage/azblob"
	"github.com/adrianliechti/granite/pkg/storage/s3"
)

// ListObjectsRequest contains parameters for listing objects
type ListObjectsRequest struct {
	Container         string `json:"container"`
	Prefix            string `json:"prefix"`
	Delimiter         string `json:"delimiter"`
	MaxKeys           int    `json:"maxKeys"`
	ContinuationToken string `json:"continuationToken"`
}

// ObjectRequest contains parameters for object operations
type ObjectRequest struct {
	Container string `json:"container"`
	Key       string `json:"key"`
	ExpiresIn int    `json:"expiresIn,omitempty"`
}

// CreateContainerRequest contains parameters for creating a container
type CreateContainerRequest struct {
	Name string `json:"name"`
}

// PresignedURLResponse contains a presigned URL
type PresignedURLResponse struct {
	URL string `json:"url"`
}

// newStorageProviderFromConnection creates a storage provider from a connection config
func newStorageProviderFromConnection(ctx context.Context, conn *Connection) (storage.Provider, error) {
	switch {
	case conn.AmazonS3 != nil:
		return s3.New(ctx, *conn.AmazonS3)

	case conn.AzureBlob != nil:
		return azblob.New(*conn.AzureBlob)

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
