package storage

import (
	"context"
	"path/filepath"
	"strings"
)

// Provider defines the interface for object storage operations
type Provider interface {
	// ListContainers returns all containers
	ListContainers(ctx context.Context) ([]Container, error)

	// CreateContainer creates a new container
	CreateContainer(ctx context.Context, name string) error

	// ListObjects lists objects in a container with optional prefix filtering
	ListObjects(ctx context.Context, container string, opts ListObjectsOptions) (*ListObjectsResult, error)

	// GetObjectDetails returns detailed metadata for a specific object
	GetObjectDetails(ctx context.Context, container, key string) (*ObjectDetails, error)

	// GetPresignedURL generates a presigned URL for downloading an object
	GetPresignedURL(ctx context.Context, container, key string, expiresIn int) (string, error)

	// UploadObject uploads an object to the storage provider
	UploadObject(ctx context.Context, container, key string, data []byte, contentType string) error

	// DeleteObject deletes a single object from storage
	DeleteObject(ctx context.Context, container, key string) error

	// DeleteObjects deletes multiple objects from storage (for prefix/folder deletion)
	DeleteObjects(ctx context.Context, container string, keys []string) error
}

// Container represents a storage container
type Container struct {
	Name      string  `json:"name"`
	CreatedAt *string `json:"createdAt,omitempty"`
	Region    *string `json:"region,omitempty"`
}

// Object represents a storage object/blob
type Object struct {
	Key          string  `json:"key"`
	Name         string  `json:"name"`
	Size         int64   `json:"size"`
	LastModified string  `json:"lastModified"`
	ETag         *string `json:"etag,omitempty"`
	ContentType  *string `json:"contentType,omitempty"`
	IsFolder     bool    `json:"isFolder"`
}

// ListObjectsOptions contains options for listing objects
type ListObjectsOptions struct {
	Prefix            string
	Delimiter         string
	MaxKeys           int
	ContinuationToken string
}

// ListObjectsResult contains the result of listing objects
type ListObjectsResult struct {
	Objects           []Object `json:"objects"`
	Prefixes          []string `json:"prefixes"`
	IsTruncated       bool     `json:"isTruncated"`
	ContinuationToken *string  `json:"continuationToken,omitempty"`
}

// ObjectDetails contains detailed metadata for an object
type ObjectDetails struct {
	Key          string            `json:"key"`
	Size         int64             `json:"size"`
	LastModified string            `json:"lastModified"`
	ETag         *string           `json:"etag,omitempty"`
	ContentType  *string           `json:"contentType,omitempty"`
	Metadata     map[string]string `json:"metadata,omitempty"`
	StorageClass *string           `json:"storageClass,omitempty"`
	// S3 specific
	VersionID *string `json:"versionId,omitempty"`
	// Azure specific
	AccessTier *string `json:"accessTier,omitempty"`
	BlobType   *string `json:"blobType,omitempty"`
}

// GetObjectName extracts the display name from an object key
func GetObjectName(key string) string {
	key = strings.TrimSuffix(key, "/")
	return filepath.Base(key)
}
