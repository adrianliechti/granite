package server

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestOpenDatabaseDrivers(t *testing.T) {
	tests := []struct {
		name    string
		driver  string
		dsn     string
		pkgPath string
	}{
		{"postgres URL", "postgres", "postgres://user:p%40ss@localhost/old?sslmode=disable", "github.com/lib/pq"},
		{"postgres keywords", "postgres", "host=localhost user=user password='p a/s' dbname=old sslmode=disable", "github.com/lib/pq"},
		{"mysql TCP", "mysql", "user:p/a?ss@tcp(localhost:3306)/old?parseTime=true&loc=Europe%2FZurich", "github.com/go-sql-driver/mysql"},
		{"mysql socket", "mysql", "user:password@unix(/tmp/mysql.sock)/old", "github.com/go-sql-driver/mysql"},
		{"sqlserver URL", "sqlserver", "sqlserver://user:p%40ss@localhost?database=old&encrypt=true", "github.com/microsoft/go-mssqldb"},
		{"sqlserver ADO", "sqlserver", "server=localhost;user id=user;password=password;database=old", "github.com/microsoft/go-mssqldb"},
		{"sqlserver ODBC", "sqlserver", "odbc:server=localhost;user id=user;password={p;a/ss};database=old", "github.com/microsoft/go-mssqldb"},
		{"oracle Easy Connect", "oracle", "user/password@tcp://localhost:1521/service", "github.com/oracle/go-oracledb/v26/oracle"},
		{"oracle descriptor", "oracle", "user/password@(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=localhost)(PORT=1521))(CONNECT_DATA=(SERVICE_NAME=service)))", "github.com/oracle/go-oracledb/v26/oracle"},
		{"sqlite", "sqlite", ":memory:", "modernc.org/sqlite"},
		{"trino", "trino", "http://user@localhost:8080?catalog=old&schema=public", "github.com/trinodb/trino-go-client/trino"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			for _, database := range []string{"", "db with 'quotes'/and?symbols"} {
				db, err := openDatabase(&SQLConfig{Driver: tt.driver, DSN: tt.dsn}, database)
				if err != nil {
					t.Fatal(err)
				}
				defer db.Close()
				if got := reflect.TypeOf(db.Driver()).Elem().PkgPath(); got != tt.pkgPath {
					t.Fatalf("driver package = %q, want %q", got, tt.pkgPath)
				}
			}
		})
	}
}

func TestOpenDatabaseRejectsInvalidDSN(t *testing.T) {
	for _, config := range []SQLConfig{
		{Driver: "postgres", DSN: "password='unterminated"},
		{Driver: "mysql", DSN: "user@tcp(localhost)/old?parseTime=invalid"},
		{Driver: "sqlserver", DSN: "sqlserver://localhost?encrypt=invalid"},
		{Driver: "trino", DSN: "http://localhost:8080?catalog=%zz"},
		{Driver: "unsupported", DSN: "unused"},
	} {
		t.Run(config.Driver, func(t *testing.T) {
			db, err := openDatabase(&config, "selected")
			if err == nil {
				db.Close()
				t.Fatal("expected invalid connection configuration to fail")
			}
		})
	}
}

func TestExecuteSQLSQLite(t *testing.T) {
	config := &SQLConfig{Driver: "sqlite", DSN: filepath.Join(t.TempDir(), "test.db")}
	ctx := t.Context()
	for _, query := range []string{
		"CREATE TABLE records (id INTEGER PRIMARY KEY, name TEXT)",
		"INSERT INTO records VALUES (1, 'before'), (2, NULL)",
	} {
		if _, err := executeSQL(ctx, config, SQLRequest{Query: query}, false); err != nil {
			t.Fatal(err)
		}
	}

	updated, err := executeSQL(ctx, config, SQLRequest{
		Query: "UPDATE records SET name = ? WHERE id = ?", Params: []any{"after's", 1}, Database: "main",
	}, false)
	if err != nil {
		t.Fatal(err)
	}
	if updated.RowsAffected != 1 {
		t.Fatalf("updated %d rows, want 1", updated.RowsAffected)
	}

	canceled, cancel := context.WithCancel(ctx)
	cancel()
	for _, query := range []bool{true, false} {
		_, err := executeSQL(canceled, config, SQLRequest{Query: "DELETE FROM records"}, query)
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("canceled request error = %v", err)
		}
	}

	result, err := executeSQL(ctx, config, SQLRequest{Query: "SELECT id, name FROM records ORDER BY id", Database: "main"}, true)
	if err != nil {
		t.Fatal(err)
	}
	want := &SQLResponse{
		Columns: []string{"id", "name"},
		Rows: []map[string]any{
			{"id": int64(1), "name": "after's"},
			{"id": int64(2), "name": nil},
		},
	}
	if !reflect.DeepEqual(result, want) {
		t.Fatalf("query result = %#v, want %#v", result, want)
	}
}

func TestTrinoDatabaseSelection(t *testing.T) {
	for _, tt := range []struct {
		database string
		catalog  string
		schema   string
	}{
		{"", "original", "public"},
		{"warehouse.sales", "warehouse", "sales"},
		{"schema with spaces", "original", "schema with spaces"},
		{"warehouse.schema.with.dots", "warehouse", "schema.with.dots"},
	} {
		t.Run(tt.database, func(t *testing.T) {
			requests := make(chan http.Header, 1)
			backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				if r.Method == http.MethodPost && r.URL.Path == "/v1/statement" {
					body, _ := io.ReadAll(r.Body)
					if string(body) != "SELECT 1" {
						t.Errorf("query = %q", body)
					}
					requests <- r.Header.Clone()
					io.WriteString(w, `{"id":"test","nextUri":"http://`+r.Host+`/v1/statement/test/1","stats":{"state":"RUNNING"}}`)
					return
				}
				if r.Method != http.MethodGet || r.URL.Path != "/v1/statement/test/1" {
					t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
				}
				io.WriteString(w, `{"id":"test","columns":[{"name":"value","type":"bigint","typeSignature":{"rawType":"bigint","arguments":[]}}],"data":[[1]],"stats":{"state":"FINISHED"}}`)
			}))
			defer backend.Close()

			u, _ := url.Parse(backend.URL)
			u.User = url.User("test-user")
			u.RawQuery = "catalog=original&schema=public&source=granite-test&session_properties=query_max_run_time%3A1m"
			result, err := executeSQL(t.Context(), &SQLConfig{Driver: "trino", DSN: u.String()}, SQLRequest{
				Query: "SELECT 1", Database: tt.database,
			}, true)
			if err != nil {
				t.Fatal(err)
			}
			if len(result.Rows) != 1 || result.Rows[0]["value"] != int64(1) {
				t.Fatalf("unexpected result: %#v", result)
			}
			headers := <-requests
			for name, want := range map[string]string{
				"X-Trino-Catalog": tt.catalog,
				"X-Trino-Schema":  tt.schema,
				"X-Trino-User":    "test-user",
				"X-Trino-Source":  "granite-test",
				"X-Trino-Session": "query_max_run_time=1m",
			} {
				if got := headers.Get(name); got != want {
					t.Errorf("%s = %q, want %q", name, got, want)
				}
			}
		})
	}
}

func TestExecuteSQLJSONNumbers(t *testing.T) {
	result, err := executeSQL(t.Context(), &SQLConfig{Driver: "sqlite", DSN: ":memory:"}, SQLRequest{
		Query:  "SELECT ? AS integer_value, ? AS decimal_value",
		Params: []any{json.Number("9007199254740993"), json.Number("1.25")},
	}, true)
	if err != nil {
		t.Fatal(err)
	}
	want := []map[string]any{{"integer_value": "9007199254740993", "decimal_value": 1.25}}
	if !reflect.DeepEqual(result.Rows, want) {
		t.Fatalf("rows = %#v, want %#v", result.Rows, want)
	}
}

func TestTypedParametersAndRowLimit(t *testing.T) {
	config := &SQLConfig{Driver: "sqlite", DSN: filepath.Join(t.TempDir(), "typed.db")}
	_, err := executeSQL(t.Context(), config, SQLRequest{Query: "CREATE TABLE values_test(id INTEGER PRIMARY KEY, amount DECIMAL, day DATE)"}, false)
	if err != nil {
		t.Fatal(err)
	}
	typed := func(kind, value string) any { return map[string]any{"type": kind, "value": value} }
	_, err = executeSQL(t.Context(), config, SQLRequest{Query: "INSERT INTO values_test VALUES (?, ?, ?)", Params: []any{typed("number", "9007199254740993"), typed("number", "1.25"), typed("date", "2026-09-12")}}, false)
	if err != nil {
		t.Fatal(err)
	}
	result, err := executeSQL(t.Context(), config, SQLRequest{Query: "SELECT id, amount FROM values_test WHERE id = ?", Params: []any{typed("number", "9007199254740993")}}, true)
	if err != nil || result.Rows[0]["id"] != "9007199254740993" {
		t.Fatalf("exact integer: %#v, %v", result, err)
	}
	for _, param := range []any{typed("number", "1; DROP TABLE values_test"), typed("date", "2026-02-31"), typed("unknown", "1")} {
		if _, err := executeSQL(t.Context(), config, SQLRequest{Query: "SELECT ?", Params: []any{param}}, true); err == nil {
			t.Fatalf("accepted invalid parameter %#v", param)
		}
	}
	limited, err := executeSQL(t.Context(), config, SQLRequest{Query: "SELECT 1 AS id UNION ALL SELECT 2 UNION ALL SELECT 3", MaxRows: 2}, true)
	if err != nil || !limited.Truncated || len(limited.Rows) != 2 {
		t.Fatalf("limit: %#v, %v", limited, err)
	}
	complete, err := executeSQL(t.Context(), config, SQLRequest{Query: "SELECT 1 AS id UNION ALL SELECT 2", MaxRows: 2}, true)
	if err != nil || complete.Truncated {
		t.Fatalf("exact limit: %#v, %v", complete, err)
	}
}

func TestSQLBatchSharesSessionAndStopsAtFirstError(t *testing.T) {
	t.Setenv("GRANITE_DATA_DIR", t.TempDir())
	s := &Server{}
	conn := &Connection{ID: "batch", Name: "Batch", SQL: &SQLConfig{Driver: "sqlite", DSN: filepath.Join(t.TempDir(), "batch.db")}}
	if err := s.saveConnection(conn); err != nil {
		t.Fatal(err)
	}
	body := `{"maxRows":10,"statements":[{"query":"CREATE TEMP TABLE local_values (id INTEGER)"},{"query":"INSERT INTO local_values VALUES (7)"},{"query":"SELECT id FROM local_values","returnsRows":true},{"query":"INSERT INTO missing VALUES (1)"},{"query":"SELECT 99","returnsRows":true}]}`
	req := httptest.NewRequest(http.MethodPost, "/sql/batch/batch", strings.NewReader(body))
	req.SetPathValue("connection", "batch")
	recorder := httptest.NewRecorder()
	s.handleSQLBatch(recorder, req)
	if recorder.Code != http.StatusOK {
		t.Fatal(recorder.Body.String())
	}
	var results []SQLResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &results); err != nil {
		t.Fatal(err)
	}
	if len(results) != 4 || results[2].Rows[0]["id"] != float64(7) || results[3].Error == "" {
		t.Fatalf("batch results: %#v", results)
	}
}

func TestConnectionTestDoesNotPersistConfiguration(t *testing.T) {
	directory := t.TempDir()
	t.Setenv("GRANITE_DATA_DIR", directory)
	s := &Server{}
	for _, dsn := range []string{":memory:", "/missing-granite-directory/test.sqlite"} {
		body, _ := json.Marshal(Connection{ID: "unsaved", Name: "Unsaved", SQL: &SQLConfig{Driver: "sqlite", DSN: dsn}})
		req := httptest.NewRequest(http.MethodPost, "/connections/test", strings.NewReader(string(body)))
		recorder := httptest.NewRecorder()
		s.handleConnectionTest(recorder, req)
		if (recorder.Code == http.StatusOK) != (dsn == ":memory:") {
			t.Fatalf("test status: %d, %s", recorder.Code, recorder.Body.String())
		}
		files, err := os.ReadDir(directory)
		if err != nil || len(files) != 0 {
			t.Fatalf("test saved a connection: %v, %v", files, err)
		}
	}
}
