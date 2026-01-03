package s3

import (
	"bytes"
	"context"
	"crypto/tls"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/adrianliechti/granite/pkg/storage"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

// Config contains S3 connection configuration
type Config struct {
	Endpoint        string `json:"endpoint,omitempty"`
	Region          string `json:"region"`
	AccessKeyID     string `json:"accessKeyId"`
	SecretAccessKey string `json:"secretAccessKey"`
}

// Provider implements storage.Provider for AWS S3
type Provider struct {
	client *s3.Client
	config Config
}

// New creates a new S3 storage provider
func New(ctx context.Context, cfg Config) (*Provider, error) {
	// Default region for S3-compatible services
	region := cfg.Region
	if region == "" {
		region = "us-east-1"
	}

	// Build HTTP client
	httpClient := http.DefaultClient
	if strings.HasPrefix(cfg.Endpoint, "http://") {
		httpClient = &http.Client{
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{
					InsecureSkipVerify: true,
				},
			},
		}
	}

	// Create S3 client with options
	client := s3.New(s3.Options{
		Region:       region,
		BaseEndpoint: aws.String(cfg.Endpoint),
		UsePathStyle: true,
		Credentials: credentials.NewStaticCredentialsProvider(
			cfg.AccessKeyID,
			cfg.SecretAccessKey,
			"",
		),
		HTTPClient: httpClient,
	})

	return &Provider{
		client: client,
		config: cfg,
	}, nil
}

// ParseConfig parses a config map into S3Config
func ParseConfig(configMap map[string]any) (Config, error) {
	cfg := Config{}

	if v, ok := configMap["endpoint"].(string); ok {
		cfg.Endpoint = v
	}
	if v, ok := configMap["region"].(string); ok {
		cfg.Region = v
	}
	// Region is optional - defaults to us-east-1 for S3-compatible services
	if v, ok := configMap["accessKeyId"].(string); ok {
		cfg.AccessKeyID = v
	} else {
		return cfg, fmt.Errorf("accessKeyId is required")
	}
	if v, ok := configMap["secretAccessKey"].(string); ok {
		cfg.SecretAccessKey = v
	} else {
		return cfg, fmt.Errorf("secretAccessKey is required")
	}

	return cfg, nil
}

// ListContainers returns all S3 buckets
func (p *Provider) ListContainers(ctx context.Context) ([]storage.Container, error) {
	result, err := p.client.ListBuckets(ctx, &s3.ListBucketsInput{})
	if err != nil {
		return nil, fmt.Errorf("failed to list buckets: %w", err)
	}

	containers := make([]storage.Container, len(result.Buckets))
	for i, b := range result.Buckets {
		container := storage.Container{
			Name: *b.Name,
		}
		if b.CreationDate != nil {
			t := b.CreationDate.Format(time.RFC3339)
			container.CreatedAt = &t
		}
		containers[i] = container
	}

	return containers, nil
}

// CreateContainer creates a new S3 bucket
func (p *Provider) CreateContainer(ctx context.Context, name string) error {
	_, err := p.client.CreateBucket(ctx, &s3.CreateBucketInput{
		Bucket: aws.String(name),
	})
	if err != nil {
		return fmt.Errorf("failed to create bucket: %w", err)
	}
	return nil
}

// ListObjects lists objects in a container
func (p *Provider) ListObjects(ctx context.Context, container string, opts storage.ListObjectsOptions) (*storage.ListObjectsResult, error) {
	input := &s3.ListObjectsV2Input{
		Bucket:    aws.String(container),
		Prefix:    aws.String(opts.Prefix),
		Delimiter: aws.String(opts.Delimiter),
	}

	if opts.MaxKeys > 0 {
		input.MaxKeys = aws.Int32(int32(opts.MaxKeys))
	}
	if opts.ContinuationToken != "" {
		input.ContinuationToken = aws.String(opts.ContinuationToken)
	}

	result, err := p.client.ListObjectsV2(ctx, input)
	if err != nil {
		return nil, fmt.Errorf("failed to list objects: %w", err)
	}

	objects := make([]storage.Object, 0, len(result.Contents))
	for _, obj := range result.Contents {
		// Skip the prefix itself if it appears in the results
		if obj.Key != nil && *obj.Key == opts.Prefix {
			continue
		}

		o := storage.Object{
			Key:      *obj.Key,
			Name:     storage.GetObjectName(*obj.Key),
			Size:     *obj.Size,
			IsFolder: strings.HasSuffix(*obj.Key, "/"),
		}
		if obj.LastModified != nil {
			o.LastModified = obj.LastModified.Format(time.RFC3339)
		}
		if obj.ETag != nil {
			o.ETag = obj.ETag
		}
		objects = append(objects, o)
	}

	prefixes := make([]string, len(result.CommonPrefixes))
	for i, prefix := range result.CommonPrefixes {
		prefixes[i] = *prefix.Prefix
	}

	resp := &storage.ListObjectsResult{
		Objects:     objects,
		Prefixes:    prefixes,
		IsTruncated: *result.IsTruncated,
	}
	if result.NextContinuationToken != nil {
		resp.ContinuationToken = result.NextContinuationToken
	}

	return resp, nil
}

// GetObjectDetails returns detailed metadata for an object
func (p *Provider) GetObjectDetails(ctx context.Context, container, key string) (*storage.ObjectDetails, error) {
	result, err := p.client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(container),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to get object details: %w", err)
	}

	resp := &storage.ObjectDetails{
		Key:  key,
		Size: *result.ContentLength,
	}
	if result.LastModified != nil {
		resp.LastModified = result.LastModified.Format(time.RFC3339)
	}
	if result.ETag != nil {
		resp.ETag = result.ETag
	}
	if result.ContentType != nil {
		resp.ContentType = result.ContentType
	}
	if result.VersionId != nil {
		resp.VersionID = result.VersionId
	}
	if result.StorageClass != "" {
		sc := string(result.StorageClass)
		resp.StorageClass = &sc
	}
	if len(result.Metadata) > 0 {
		resp.Metadata = result.Metadata
	}

	return resp, nil
}

// GetPresignedURL generates a presigned URL for downloading an object
func (p *Provider) GetPresignedURL(ctx context.Context, container, key string, expiresIn int) (string, error) {
	presignClient := s3.NewPresignClient(p.client)

	if expiresIn <= 0 {
		expiresIn = 3600 // Default 1 hour
	}

	result, err := presignClient.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(container),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(time.Duration(expiresIn)*time.Second))

	if err != nil {
		return "", fmt.Errorf("failed to generate presigned URL: %w", err)
	}

	return result.URL, nil
}

// UploadObject uploads data to an S3 object
func (p *Provider) UploadObject(ctx context.Context, container, key string, data []byte, contentType string) error {
	input := &s3.PutObjectInput{
		Bucket: aws.String(container),
		Key:    aws.String(key),
		Body:   bytes.NewReader(data),
	}

	if contentType != "" {
		input.ContentType = aws.String(contentType)
	}

	_, err := p.client.PutObject(ctx, input)
	if err != nil {
		return fmt.Errorf("failed to upload object: %w", err)
	}

	return nil
}

// DeleteObject deletes a single object from S3
func (p *Provider) DeleteObject(ctx context.Context, container, key string) error {
	_, err := p.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(container),
		Key:    aws.String(key),
	})
	if err != nil {
		return fmt.Errorf("failed to delete object: %w", err)
	}
	return nil
}

// DeleteObjects deletes multiple objects from S3
func (p *Provider) DeleteObjects(ctx context.Context, container string, keys []string) error {
	if len(keys) == 0 {
		return nil
	}

	// S3 DeleteObjects has a limit of 1000 keys per request
	const batchSize = 1000
	for i := 0; i < len(keys); i += batchSize {
		end := i + batchSize
		if end > len(keys) {
			end = len(keys)
		}
		batch := keys[i:end]

		objects := make([]types.ObjectIdentifier, len(batch))
		for j, key := range batch {
			objects[j] = types.ObjectIdentifier{
				Key: aws.String(key),
			}
		}

		_, err := p.client.DeleteObjects(ctx, &s3.DeleteObjectsInput{
			Bucket: aws.String(container),
			Delete: &types.Delete{
				Objects: objects,
				Quiet:   aws.Bool(true),
			},
		})
		if err != nil {
			return fmt.Errorf("failed to delete objects: %w", err)
		}
	}

	return nil
}

// Ensure Provider implements storage.Provider
var _ storage.Provider = (*Provider)(nil)
