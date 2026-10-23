package server

import (
	"encoding/json"
	"net/http"
)

// A batch uses one session, including explicit BEGIN/COMMIT and temporary tables.
// Execution stops on the first error; already completed statements are reported.
func (s *Server) handleSQLBatch(w http.ResponseWriter, r *http.Request) {
	conn, err := s.getConnection(r.PathValue("connection"))
	if err != nil || conn.SQL == nil {
		writeError(w, http.StatusBadRequest, "SQL connection not found")
		return
	}
	var req struct {
		Database   string `json:"database"`
		Schema     string `json:"schema"`
		MaxRows    int    `json:"maxRows"`
		TimeoutMS  int    `json:"timeoutMs"`
		Statements []struct {
			Query       string `json:"query"`
			ReturnsRows bool   `json:"returnsRows"`
		} `json:"statements"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.Statements) == 0 || len(req.Statements) > 100 {
		writeError(w, http.StatusBadRequest, "Provide between 1 and 100 statements")
		return
	}
	if req.MaxRows < 1 || req.MaxRows > 10000 {
		req.MaxRows = 1000
	}
	// One timeout covers the whole batch.
	ctx, cancel, err := withQueryTimeout(r.Context(), req.TimeoutMS)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	defer cancel()
	db, err := openDatabase(conn.SQL, req.Database, req.Schema)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	defer db.Close()
	session, err := db.Conn(ctx)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	defer session.Close()
	results := make([]*SQLResponse, 0, len(req.Statements))
	for _, statement := range req.Statements {
		response, err := executeStatement(ctx, session, SQLRequest{Query: statement.Query, MaxRows: req.MaxRows}, statement.ReturnsRows)
		if err != nil {
			results = append(results, &SQLResponse{Error: err.Error()})
			break
		}
		results = append(results, response)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}
