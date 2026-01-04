package server

import (
	"context"
	"encoding/json"
	"io"
	"io/fs"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"path"
	"strings"

	"github.com/adrianliechti/granite"
	"github.com/adrianliechti/granite/pkg/config"

	_ "github.com/go-sql-driver/mysql"
	_ "github.com/lib/pq"
	_ "github.com/microsoft/go-mssqldb"
	_ "github.com/microsoft/go-mssqldb/integratedauth/krb5"
	_ "github.com/sijms/go-ora/v2"
	_ "modernc.org/sqlite"
)

type Server struct {
	http.Handler
}

func New(cfg *config.Config) (*Server, error) {
	mux := http.NewServeMux()

	s := &Server{
		Handler: mux,
	}

	// Data endpoints
	mux.HandleFunc("GET /data/{store}", s.handleDataList)
	mux.HandleFunc("GET /data/{store}/{id}", s.handleDataGet)
	mux.HandleFunc("PUT /data/{store}/{id}", s.handleDataPut)
	mux.HandleFunc("DELETE /data/{store}/{id}", s.handleDataDelete)

	// Database endpoints
	mux.HandleFunc("POST /db/query", s.handleDatabaseQuery)
	mux.HandleFunc("POST /db/execute", s.handleDatabaseExecute)

	// Storage endpoints
	mux.HandleFunc("POST /storage/containers", s.handleStorageContainers)
	mux.HandleFunc("POST /storage/containers/create", s.handleStorageCreateContainer)

	mux.HandleFunc("POST /storage/objects", s.handleStorageObjects)
	mux.HandleFunc("POST /storage/object/details", s.handleStorageObjectDetails)
	mux.HandleFunc("POST /storage/object/presign", s.handleStoragePresignedURL)
	mux.HandleFunc("POST /storage/object/delete", s.handleStorageDeleteObject)
	mux.HandleFunc("POST /storage/upload", s.handleStorageUploadObject)

	if cfg.OpenAI != nil {
		target, err := url.Parse(cfg.OpenAI.URL)

		if err != nil {
			return nil, err
		}

		proxy := &httputil.ReverseProxy{
			ErrorLog: log.New(io.Discard, "", 0),

			Rewrite: func(r *httputil.ProxyRequest) {
				r.Out.URL.Path = strings.TrimPrefix(r.Out.URL.Path, "/openai/v1")

				r.SetURL(target)

				if cfg.OpenAI.Token != "" {
					r.Out.Header.Set("Authorization", "Bearer "+cfg.OpenAI.Token)
				}

				r.Out.Host = target.Host
			},
		}

		mux.Handle("/openai/v1/", proxy)
	}

	mux.HandleFunc("GET /config.json", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		config := &Config{}

		if cfg.OpenAI != nil {
			config.AI = &AIConfig{
				Model: cfg.OpenAI.Model,
			}
		}

		json.NewEncoder(w).Encode(config)
	})

	mux.Handle("/", spaHandler(granite.DistFS))

	return &Server{
		Handler: mux,
	}, nil
}

func (s *Server) ListenAndServe(ctx context.Context, addr string) error {
	srv := &http.Server{
		Addr:    addr,
		Handler: s,
	}

	go func() {
		<-ctx.Done()
		srv.Shutdown(context.Background())
	}()

	if err := srv.ListenAndServe(); err != http.ErrServerClosed {
		return err
	}

	return nil
}

func writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(ErrorResponse{Message: message})
}

func spaHandler(fsys fs.FS) http.Handler {
	fileServer := http.FileServerFS(fsys)

	// Read index.html once at startup
	indexHTML, err := fs.ReadFile(fsys, "index.html")
	if err != nil {
		panic("failed to read index.html: " + err.Error())
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		urlPath := path.Clean(r.URL.Path)

		// Redirect trailing slashes to canonical path (except root)
		if r.URL.Path != "/" && strings.HasSuffix(r.URL.Path, "/") {
			http.Redirect(w, r, urlPath, http.StatusMovedPermanently)
			return
		}

		// Try to open the file
		filePath := strings.TrimPrefix(urlPath, "/")
		if filePath == "" {
			filePath = "index.html"
		}

		f, err := fsys.Open(filePath)
		if err == nil {
			f.Close()
			fileServer.ServeHTTP(w, r)
			return
		}

		// File doesn't exist, serve index.html for SPA routing
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		w.Write(indexHTML)
	})
}
