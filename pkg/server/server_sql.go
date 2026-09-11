package server

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/go-sql-driver/mysql"
	"github.com/lib/pq"
	mssql "github.com/microsoft/go-mssqldb"
	"github.com/microsoft/go-mssqldb/msdsn"

	_ "github.com/microsoft/go-mssqldb/integratedauth/krb5"
	_ "github.com/oracle/go-oracledb/v26/oracle"
	"github.com/trinodb/trino-go-client/trino"
	_ "modernc.org/sqlite"
)

func (s *Server) handleQuery(w http.ResponseWriter, r *http.Request) {
	s.handleSQL(w, r, true)
}

func (s *Server) handleExecute(w http.ResponseWriter, r *http.Request) {
	s.handleSQL(w, r, false)
}

func (s *Server) handleSQL(w http.ResponseWriter, r *http.Request, query bool) {
	conn, err := s.getConnection(r.PathValue("connection"))
	if err != nil {
		if os.IsNotExist(err) {
			writeError(w, http.StatusNotFound, "connection not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if conn.SQL == nil {
		writeError(w, http.StatusBadRequest, "connection is not a SQL connection")
		return
	}

	var req SQLRequest
	decoder := json.NewDecoder(r.Body)
	decoder.UseNumber()
	if err := decoder.Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request payload: "+err.Error())
		return
	}

	resp, err := executeSQL(r.Context(), conn.SQL, req, query)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func executeSQL(ctx context.Context, config *SQLConfig, req SQLRequest, query bool) (*SQLResponse, error) {
	// Preserve integer precision from JSON. Trino requires its Numeric type
	// because it deliberately rejects floating-point parameters.
	for i, param := range req.Params {
		if typed, ok := param.(map[string]any); ok {
			value, err := typedParameter(config.Driver, typed)
			if err != nil {
				return nil, fmt.Errorf("parameter %d: %w", i+1, err)
			}
			req.Params[i] = value
			continue
		}
		if number, ok := param.(json.Number); ok {
			if config.Driver == "trino" {
				req.Params[i] = trino.Numeric(number)
			} else if integer, err := number.Int64(); err == nil {
				req.Params[i] = integer
			} else {
				decimal, err := number.Float64()
				if err != nil {
					return nil, err
				}
				req.Params[i] = decimal
			}
		}
	}

	db, err := openDatabase(config, req.Database)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	return executeOnConnection(ctx, db, req, query)
}

type sqlExecutor interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

func executeOnConnection(ctx context.Context, db sqlExecutor, req SQLRequest, query bool) (*SQLResponse, error) {
	if query {
		rows, err := db.QueryContext(ctx, req.Query, req.Params...)
		if err != nil {
			return nil, err
		}
		defer rows.Close()

		columns, data, truncated, err := rowsToJSON(rows, req.MaxRows)
		if err != nil {
			return nil, err
		}
		return &SQLResponse{Columns: columns, Rows: data, Truncated: truncated}, nil
	}

	result, err := db.ExecContext(ctx, req.Query, req.Params...)
	if err != nil {
		return nil, err
	}

	rowsAffected, _ := result.RowsAffected()
	return &SQLResponse{RowsAffected: rowsAffected}, nil
}

var numericParameter = regexp.MustCompile(`^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$`)

// Explicit types preserve decimals and let drivers bind dates without relying
// on session-specific date formats. Values always remain bound parameters.
func typedParameter(driver string, param map[string]any) (any, error) {
	value, ok := param["value"].(string)
	if !ok || len(param) != 2 {
		return nil, fmt.Errorf("invalid typed value")
	}
	switch param["type"] {
	case "number":
		if !numericParameter.MatchString(value) {
			return nil, fmt.Errorf("invalid number")
		}
		if driver == "trino" {
			return trino.Numeric(value), nil
		}
		if integer, err := json.Number(value).Int64(); err == nil {
			return integer, nil
		}
		// SQL numeric columns convert this exact decimal string on assignment
		// and comparison, without a lossy intermediate float64.
		return value, nil
	case "date", "datetime":
		var parsed time.Time
		var err error
		for _, layout := range []string{time.DateOnly, time.RFC3339Nano, "2006-01-02T15:04:05.999999999", "2006-01-02T15:04"} {
			parsed, err = time.Parse(layout, value)
			if err == nil {
				break
			}
		}
		if err != nil {
			return nil, fmt.Errorf("invalid date or time")
		}
		if driver == "oracle" {
			return parsed, nil
		}
		if driver == "trino" {
			if param["type"] == "date" {
				return trino.Date(parsed.Year(), parsed.Month(), parsed.Day()), nil
			}
			if strings.HasSuffix(value, "Z") || strings.Contains(value[10:], "+") || strings.Contains(value[10:], "-") {
				return parsed, nil
			}
			return trino.Timestamp(parsed.Year(), parsed.Month(), parsed.Day(), parsed.Hour(), parsed.Minute(), parsed.Second(), parsed.Nanosecond()), nil
		}
		if param["type"] == "date" {
			return parsed.Format(time.DateOnly), nil
		}
		return strings.Replace(value, "T", " ", 1), nil
	default:
		return nil, fmt.Errorf("unsupported parameter type")
	}
}

// Use the drivers' parsers so database selection preserves credentials and
// connection options in URL, keyword, socket, ADO, and ODBC connection strings.
func openDatabase(config *SQLConfig, database string) (*sql.DB, error) {
	// Keep "oracle" as Granite's connection type; Oracle registers "oracledb".
	if config.Driver == "oracle" {
		return sql.Open("oracledb", config.DSN)
	}

	if database == "" {
		return sql.Open(config.Driver, config.DSN)
	}

	switch config.Driver {
	case "postgres":
		cfg, err := pq.NewConfig(config.DSN)
		if err != nil {
			return nil, err
		}
		cfg.Database = database
		connector, err := pq.NewConnectorConfig(cfg)
		if err != nil {
			return nil, err
		}
		return sql.OpenDB(connector), nil

	case "mysql":
		cfg, err := mysql.ParseDSN(config.DSN)
		if err != nil {
			return nil, err
		}
		cfg.DBName = database
		connector, err := mysql.NewConnector(cfg)
		if err != nil {
			return nil, err
		}
		return sql.OpenDB(connector), nil

	case "sqlserver":
		cfg, err := msdsn.Parse(config.DSN)
		if err != nil {
			return nil, err
		}
		cfg.Database = database
		return sql.OpenDB(mssql.NewConnectorConfig(cfg)), nil

	case "trino":
		u, err := url.Parse(config.DSN)
		if err != nil {
			return nil, err
		}
		params, err := url.ParseQuery(u.RawQuery)
		if err != nil {
			return nil, err
		}
		if catalog, schema, ok := strings.Cut(database, "."); ok {
			params.Set("catalog", catalog)
			params.Set("schema", schema)
		} else {
			params.Set("schema", database)
		}
		u.RawQuery = params.Encode()
		return sql.Open(config.Driver, u.String())

	default:
		// SQLite files are selected by the saved DSN.
		return sql.Open(config.Driver, config.DSN)
	}
}
