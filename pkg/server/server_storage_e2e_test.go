package server

import (
	"context"
	"flag"
	"fmt"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/Azure/azure-sdk-for-go/sdk/storage/azblob"
	"github.com/adrianliechti/granite/pkg/config"
	graniteazure "github.com/adrianliechti/granite/pkg/storage/azblob"
	granites3 "github.com/adrianliechti/granite/pkg/storage/s3"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

var storageE2E = flag.Bool("storage-e2e", false, "run storage browser tests against MinIO and Azurite in connection.txt")

func TestStorageE2E(t *testing.T) {
	if !*storageE2E {
		t.Skip("start the storage services in connection.txt, then run npm run test:e2e:storage")
	}
	t.Setenv("GRANITE_DATA_DIR", t.TempDir())
	server, err := New(&config.Config{})
	if err != nil {
		t.Fatal(err)
	}
	backend := httptest.NewServer(server)
	defer backend.Close()
	azureDSN := "DefaultEndpointsProtocol=http;AccountName=granite;AccountKey=R3Jhbml0ZV9UZXN0XzIwMjY=;BlobEndpoint=http://127.0.0.1:10000/granite;"
	for _, kind := range []string{"s3", "azure"} {
		t.Run(kind, func(t *testing.T) {
			name := fmt.Sprintf("granite-e2e-%s-%d", kind, time.Now().UnixMilli())
			conn := &Connection{ID: name, Name: "E2E " + kind}
			if kind == "s3" {
				conn.AmazonS3 = &granites3.Config{Endpoint: "http://127.0.0.1:9000", Region: "us-east-1", AccessKeyID: "granite", SecretAccessKey: "Granite_Test_2026"}
			} else {
				conn.AzureBlob = &graniteazure.Config{ConnectionString: azureDSN}
			}
			provider, err := newStorageProviderFromConnection(t.Context(), conn)
			if err != nil {
				t.Fatal(err)
			}
			if err := provider.CreateContainer(t.Context(), name); err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() {
				ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
				defer cancel()
				// Remove only this test's container, including objects left after a failure.
				if kind == "s3" {
					client := s3.New(s3.Options{Region: "us-east-1", Credentials: credentials.NewStaticCredentialsProvider("granite", "Granite_Test_2026", ""), BaseEndpoint: aws.String("http://127.0.0.1:9000"), UsePathStyle: true})
					page, err := client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{Bucket: aws.String(name)})
					if err != nil {
						t.Error(err)
						return
					}
					for _, object := range page.Contents {
						if _, err := client.DeleteObject(ctx, &s3.DeleteObjectInput{Bucket: aws.String(name), Key: object.Key}); err != nil {
							t.Error(err)
						}
					}
					if _, err := client.DeleteBucket(ctx, &s3.DeleteBucketInput{Bucket: aws.String(name)}); err != nil {
						t.Error(err)
					}
				} else {
					client, err := azblob.NewClientFromConnectionString(azureDSN, nil)
					if err != nil {
						t.Error(err)
						return
					}
					if _, err := client.DeleteContainer(ctx, name, nil); err != nil {
						t.Error(err)
					}
				}
			})
			for i := 0; i < 251; i++ {
				if err := provider.UploadObject(t.Context(), name, fmt.Sprintf("file-%03d.txt", i), []byte("Granite storage e2e\n"), "text/plain"); err != nil {
					t.Fatal(err)
				}
			}
			if err := provider.UploadObject(t.Context(), name, "nested/child.txt", []byte("nested e2e\n"), "text/plain"); err != nil {
				t.Fatal(err)
			}
			if err := server.saveConnection(conn); err != nil {
				t.Fatal(err)
			}
			cmd := exec.CommandContext(t.Context(), "node", "--test", "tests/storage.e2e.mjs")
			cmd.Dir = filepath.Join("..", "..")
			cmd.Env = append(os.Environ(), "GRANITE_TEST_URL="+backend.URL, "GRANITE_STORAGE_ID="+name, "GRANITE_STORAGE_CONTAINER="+name, "GRANITE_STORAGE_KIND="+kind)
			cmd.Stdout = os.Stdout
			cmd.Stderr = os.Stderr
			if err := cmd.Run(); err != nil {
				t.Fatal(err)
			}
		})
	}
}
