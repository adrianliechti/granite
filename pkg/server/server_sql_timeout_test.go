package server

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

const slowSQLQuery = "WITH RECURSIVE numbers(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM numbers WHERE n < 1000000000) SELECT SUM(n) FROM numbers"

func TestSQLQueryTimeout(t *testing.T) {
	for _, query := range []string{
		slowSQLQuery,
		strings.Replace(slowSQLQuery, "SELECT SUM(n)", "SELECT n", 1),
	} {
		t.Run(query, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(t.Context(), 3*time.Second)
			defer cancel()
			start := time.Now()
			result, err := executeSQL(ctx, &SQLConfig{Driver: "sqlite", DSN: ":memory:"}, SQLRequest{
				Query: query, TimeoutMS: 20,
			}, true)
			if result != nil || !errors.Is(err, errQueryTimeout) {
				t.Fatalf("timed out query returned %#v, %v", result, err)
			}
			if elapsed := time.Since(start); elapsed > time.Second {
				t.Fatalf("request deadline was not applied: elapsed %s", elapsed)
			}
		})
	}
}

func TestSQLQueryTimeoutHTTP(t *testing.T) {
	t.Setenv("GRANITE_DATA_DIR", t.TempDir())
	s := &Server{}
	if err := s.saveConnection(&Connection{ID: "timeout", Name: "Timeout", SQL: &SQLConfig{Driver: "sqlite", DSN: ":memory:"}}); err != nil {
		t.Fatal(err)
	}
	body := `{"query":"` + slowSQLQuery + `","timeoutMs":20}`
	req := httptest.NewRequest(http.MethodPost, "/sql/timeout/query", strings.NewReader(body))
	ctx, cancel := context.WithTimeout(t.Context(), 3*time.Second)
	defer cancel()
	req = req.WithContext(ctx)
	req.SetPathValue("connection", "timeout")
	recorder := httptest.NewRecorder()
	s.handleQuery(recorder, req)
	if recorder.Code != http.StatusGatewayTimeout || !strings.Contains(recorder.Body.String(), "Query timed out") {
		t.Fatalf("timeout response: %d %s", recorder.Code, recorder.Body.String())
	}
}

func TestSQLQueryTimeoutValidation(t *testing.T) {
	for _, timeout := range []int{-1, 300_001} {
		if _, err := executeOnConnection(t.Context(), nil, SQLRequest{TimeoutMS: timeout}, true); err == nil {
			t.Fatalf("accepted invalid timeout %d", timeout)
		}
	}
}

// failingExecutor fails every statement with err.
type failingExecutor struct{ err error }

func (f failingExecutor) QueryContext(context.Context, string, ...any) (*sql.Rows, error) {
	return nil, f.err
}

func (f failingExecutor) ExecContext(context.Context, string, ...any) (sql.Result, error) {
	return nil, f.err
}

func TestDriverDeadlineIsNotQueryTimeout(t *testing.T) {
	// e.g. lib/pq's connect_timeout to an unreachable host: "dial tcp: i/o timeout"
	dial := fmt.Errorf("dial tcp 10.255.255.1:5432: i/o timeout: %w", context.DeadlineExceeded)
	for _, timeout := range []int{0, 60_000} {
		_, err := executeOnConnection(t.Context(), failingExecutor{dial}, SQLRequest{TimeoutMS: timeout}, true)
		if errors.Is(err, errQueryTimeout) || !strings.Contains(err.Error(), "dial tcp") {
			t.Fatalf("timeout %d: error = %v, want the driver's error", timeout, err)
		}
	}
}

func TestSQLBatchTimeout(t *testing.T) {
	t.Setenv("GRANITE_DATA_DIR", t.TempDir())
	s := &Server{}
	if err := s.saveConnection(&Connection{ID: "batch", Name: "Batch", SQL: &SQLConfig{Driver: "sqlite", DSN: ":memory:"}}); err != nil {
		t.Fatal(err)
	}
	body := `{"timeoutMs":20,"statements":[{"query":"SELECT 1","returnsRows":true},{"query":"` + slowSQLQuery + `","returnsRows":true},{"query":"SELECT 2","returnsRows":true}]}`
	req := httptest.NewRequest(http.MethodPost, "/sql/batch/batch", strings.NewReader(body))
	ctx, cancel := context.WithTimeout(t.Context(), 3*time.Second)
	defer cancel()
	req = req.WithContext(ctx)
	req.SetPathValue("connection", "batch")
	recorder := httptest.NewRecorder()
	s.handleSQLBatch(recorder, req)
	var results []SQLResponse
	if err := json.NewDecoder(recorder.Body).Decode(&results); err != nil {
		t.Fatal(err)
	}
	if len(results) != 2 || results[0].Error != "" || results[1].Error != errQueryTimeout.Error() {
		t.Fatalf("batch results = %+v", results)
	}
}
