package server

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/adrianliechti/granite/pkg/db"
	"github.com/adrianliechti/granite/pkg/db/redis"
	"github.com/adrianliechti/granite/pkg/db/sql"
)

func newDatabaseProvider(req DatabaseRequest) (db.Provider, error) {
	switch req.Provider {
	case "postgres", "mysql", "sqlite", "sqlserver", "oracle":
		cfg, err := sql.ParseConfig(req.Config)
		if err != nil {
			return nil, err
		}
		cfg.Driver = req.Provider
		return sql.New(cfg)

	case "redis":
		cfg, err := redis.ParseConfig(req.Config)
		if err != nil {
			return nil, err
		}
		return redis.New(cfg)

	default:
		return nil, ErrUnsupportedProvider
	}
}

func (s *Server) handleDatabaseQuery(w http.ResponseWriter, r *http.Request) {
	var req DatabaseRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request payload: "+err.Error())
		return
	}

	provider, err := newDatabaseProvider(req)

	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	result, err := provider.Query(context.Background(), req.Query, req.Params...)

	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	resp := DatabaseResponse{
		Columns: result.Columns,
		Rows:    result.Rows,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (s *Server) handleDatabaseExecute(w http.ResponseWriter, r *http.Request) {
	var req DatabaseRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request payload: "+err.Error())
		return
	}

	provider, err := newDatabaseProvider(req)

	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	result, err := provider.Execute(context.Background(), req.Query, req.Params...)

	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	resp := DatabaseResponse{
		RowsAffected: result.RowsAffected,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}
