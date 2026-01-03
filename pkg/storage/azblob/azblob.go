package azblob

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/adrianliechti/granite/pkg/storage"

	"github.com/Azure/azure-sdk-for-go/sdk/azidentity"
	"github.com/Azure/azure-sdk-for-go/sdk/storage/azblob"
	"github.com/Azure/azure-sdk-for-go/sdk/storage/azblob/blob"
	azcontainer "github.com/Azure/azure-sdk-for-go/sdk/storage/azblob/container"
)

// Config contains Azure Blob Storage connection configuration
type Config struct {
	AccountName      string `json:"accountName"`
	AccountKey       string `json:"accountKey,omitempty"`
	SASToken         string `json:"sasToken,omitempty"`
	ConnectionString string `json:"connectionString,omitempty"`
}

// Provider implements storage.Provider for Azure Blob Storage
type Provider struct {
	client *azblob.Client
	config Config
}

// New creates a new Azure Blob storage provider
func New(cfg Config) (*Provider, error) {
	client, err := newClient(cfg)
	if err != nil {
		return nil, err
	}

	return &Provider{
		client: client,
		config: cfg,
	}, nil
}

func newClient(cfg Config) (*azblob.Client, error) {
	if cfg.ConnectionString != "" {
		return azblob.NewClientFromConnectionString(cfg.ConnectionString, nil)
	}

	serviceURL := fmt.Sprintf("https://%s.blob.core.windows.net/", cfg.AccountName)

	if cfg.AccountKey != "" {
		cred, err := azblob.NewSharedKeyCredential(cfg.AccountName, cfg.AccountKey)
		if err != nil {
			return nil, fmt.Errorf("failed to create shared key credential: %w", err)
		}
		return azblob.NewClientWithSharedKeyCredential(serviceURL, cred, nil)
	}

	if cfg.SASToken != "" {
		urlWithSAS := serviceURL + "?" + strings.TrimPrefix(cfg.SASToken, "?")
		return azblob.NewClientWithNoCredential(urlWithSAS, nil)
	}

	cred, err := azidentity.NewDefaultAzureCredential(nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create default Azure credential: %w", err)
	}
	return azblob.NewClient(serviceURL, cred, nil)
}

// ParseConfig parses a config map into Config
func ParseConfig(configMap map[string]any) (Config, error) {
	cfg := Config{}

	if v, ok := configMap["accountName"].(string); ok {
		cfg.AccountName = v
	}
	if v, ok := configMap["accountKey"].(string); ok {
		cfg.AccountKey = v
	}
	if v, ok := configMap["sasToken"].(string); ok {
		cfg.SASToken = v
	}
	if v, ok := configMap["connectionString"].(string); ok {
		cfg.ConnectionString = v
	}

	if cfg.AccountName == "" && cfg.ConnectionString == "" {
		return cfg, fmt.Errorf("accountName or connectionString is required")
	}

	return cfg, nil
}

// ListContainers returns all Azure containers
func (p *Provider) ListContainers(ctx context.Context) ([]storage.Container, error) {
	var containers []storage.Container
	pager := p.client.NewListContainersPager(nil)

	for pager.More() {
		page, err := pager.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("failed to list containers: %w", err)
		}

		for _, c := range page.ContainerItems {
			container := storage.Container{
				Name: *c.Name,
			}
			if c.Properties != nil && c.Properties.LastModified != nil {
				t := c.Properties.LastModified.Format(time.RFC3339)
				container.CreatedAt = &t
			}
			containers = append(containers, container)
		}
	}

	return containers, nil
}

// CreateContainer creates a new Azure container
func (p *Provider) CreateContainer(ctx context.Context, name string) error {
	_, err := p.client.CreateContainer(ctx, name, nil)
	if err != nil {
		return fmt.Errorf("failed to create container: %w", err)
	}
	return nil
}

// ListObjects lists blobs in a container
func (p *Provider) ListObjects(ctx context.Context, container string, opts storage.ListObjectsOptions) (*storage.ListObjectsResult, error) {
	containerClient := p.client.ServiceClient().NewContainerClient(container)

	listOpts := &azcontainer.ListBlobsHierarchyOptions{
		Prefix: &opts.Prefix,
	}
	if opts.MaxKeys > 0 {
		maxResults := int32(opts.MaxKeys)
		listOpts.MaxResults = &maxResults
	}

	delimiter := opts.Delimiter
	if delimiter == "" {
		delimiter = "/"
	}

	objects := []storage.Object{}
	prefixes := []string{}
	isTruncated := false

	pager := containerClient.NewListBlobsHierarchyPager(delimiter, listOpts)

	for pager.More() {
		page, err := pager.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("failed to list blobs: %w", err)
		}

		for _, blob := range page.Segment.BlobItems {
			if blob.Name != nil && *blob.Name == opts.Prefix {
				continue
			}

			o := storage.Object{
				Key:      *blob.Name,
				Name:     storage.GetObjectName(*blob.Name),
				IsFolder: false,
			}
			if blob.Properties != nil {
				if blob.Properties.ContentLength != nil {
					o.Size = *blob.Properties.ContentLength
				}
				if blob.Properties.LastModified != nil {
					o.LastModified = blob.Properties.LastModified.Format(time.RFC3339)
				}
				if blob.Properties.ETag != nil {
					etag := string(*blob.Properties.ETag)
					o.ETag = &etag
				}
				if blob.Properties.ContentType != nil {
					o.ContentType = blob.Properties.ContentType
				}
			}
			objects = append(objects, o)
		}

		for _, prefix := range page.Segment.BlobPrefixes {
			if prefix.Name != nil {
				prefixes = append(prefixes, *prefix.Name)
			}
		}

		if pager.More() {
			isTruncated = true
			break
		}
	}

	return &storage.ListObjectsResult{
		Objects:     objects,
		Prefixes:    prefixes,
		IsTruncated: isTruncated,
	}, nil
}

// GetObjectDetails returns detailed metadata for a blob
func (p *Provider) GetObjectDetails(ctx context.Context, containerName, blobName string) (*storage.ObjectDetails, error) {
	blobClient := p.client.ServiceClient().NewContainerClient(containerName).NewBlobClient(blobName)

	props, err := blobClient.GetProperties(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to get blob properties: %w", err)
	}

	resp := &storage.ObjectDetails{
		Key: blobName,
	}

	if props.ContentLength != nil {
		resp.Size = *props.ContentLength
	}
	if props.LastModified != nil {
		resp.LastModified = props.LastModified.Format(time.RFC3339)
	}
	if props.ETag != nil {
		etag := string(*props.ETag)
		resp.ETag = &etag
	}
	if props.ContentType != nil {
		resp.ContentType = props.ContentType
	}
	if props.AccessTier != nil {
		tier := string(*props.AccessTier)
		resp.AccessTier = &tier
	}
	if props.BlobType != nil {
		blobType := string(*props.BlobType)
		resp.BlobType = &blobType
	}
	if len(props.Metadata) > 0 {
		resp.Metadata = make(map[string]string)
		for k, v := range props.Metadata {
			if v != nil {
				resp.Metadata[k] = *v
			}
		}
	}

	return resp, nil
}

// GetPresignedURL generates a URL for downloading a blob
func (p *Provider) GetPresignedURL(ctx context.Context, containerName, blobName string, expiresIn int) (string, error) {
	if p.config.AccountKey == "" {
		return "", fmt.Errorf("account key required for generating presigned URLs")
	}

	cred, err := azblob.NewSharedKeyCredential(p.config.AccountName, p.config.AccountKey)
	if err != nil {
		return "", fmt.Errorf("failed to create credential: %w", err)
	}

	serviceURL := fmt.Sprintf("https://%s.blob.core.windows.net/", p.config.AccountName)
	client, err := azblob.NewClientWithSharedKeyCredential(serviceURL, cred, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create client: %w", err)
	}

	blobClient := client.ServiceClient().NewContainerClient(containerName).NewBlobClient(blobName)
	sasURL := blobClient.URL()

	return sasURL, nil
}

// UploadObject uploads data to an Azure blob
func (p *Provider) UploadObject(ctx context.Context, containerName, blobName string, data []byte, contentType string) error {
	blobClient := p.client.ServiceClient().NewContainerClient(containerName).NewBlockBlobClient(blobName)

	uploadOpts := &azblob.UploadBufferOptions{}
	if contentType != "" {
		uploadOpts.HTTPHeaders = &blob.HTTPHeaders{
			BlobContentType: &contentType,
		}
	}

	_, err := blobClient.UploadBuffer(ctx, data, uploadOpts)
	if err != nil {
		return fmt.Errorf("failed to upload blob: %w", err)
	}

	return nil
}

// DeleteObject deletes a single blob from Azure
func (p *Provider) DeleteObject(ctx context.Context, containerName, blobName string) error {
	blobClient := p.client.ServiceClient().NewContainerClient(containerName).NewBlobClient(blobName)
	_, err := blobClient.Delete(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to delete blob: %w", err)
	}
	return nil
}

// DeleteObjects deletes multiple blobs from Azure
func (p *Provider) DeleteObjects(ctx context.Context, containerName string, keys []string) error {
	for _, key := range keys {
		if err := p.DeleteObject(ctx, containerName, key); err != nil {
			return err
		}
	}
	return nil
}

var _ storage.Provider = (*Provider)(nil)
