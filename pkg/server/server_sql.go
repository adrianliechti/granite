package server

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"errors"
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
		if errors.Is(err, errQueryTimeout) {
			writeError(w, http.StatusGatewayTimeout, "Query timed out")
			return
		}
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

	db, err := openDatabase(config, req.Database, req.Schema)
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

// errQueryTimeout marks a query stopped by the request's own timeout, as opposed
// to deadlines inside a driver, such as a connect timeout to an unreachable host.
var errQueryTimeout = errors.New("query timed out")

// withQueryTimeout bounds ctx by a request timeout in milliseconds; 0 means none.
func withQueryTimeout(ctx context.Context, timeoutMS int) (context.Context, context.CancelFunc, error) {
	if timeoutMS < 0 || timeoutMS > 300_000 {
		return nil, nil, fmt.Errorf("query timeout must be between 0 and 300000 milliseconds")
	}
	if timeoutMS == 0 {
		return ctx, func() {}, nil
	}
	ctx, cancel := context.WithTimeoutCause(ctx, time.Duration(timeoutMS)*time.Millisecond, errQueryTimeout)
	return ctx, cancel, nil
}

// queryError reports why a statement failed: errQueryTimeout when the request's
// timeout stopped it, the context's error when the request was otherwise
// canceled, and the driver's error in every other case.
func queryError(ctx context.Context, err error) error {
	if ctx.Err() == nil {
		return err
	}
	if errors.Is(context.Cause(ctx), errQueryTimeout) {
		return errQueryTimeout
	}
	return ctx.Err()
}

func executeOnConnection(ctx context.Context, db sqlExecutor, req SQLRequest, query bool) (*SQLResponse, error) {
	ctx, cancel, err := withQueryTimeout(ctx, req.TimeoutMS)
	if err != nil {
		return nil, err
	}
	defer cancel()
	return executeStatement(ctx, db, req, query)
}

func executeStatement(ctx context.Context, db sqlExecutor, req SQLRequest, query bool) (*SQLResponse, error) {
	if query {
		rows, err := db.QueryContext(ctx, req.Query, req.Params...)
		if err != nil {
			return nil, queryError(ctx, err)
		}
		defer rows.Close()

		columns, data, truncated, err := rowsToJSON(rows, req.MaxRows)
		if err != nil {
			return nil, queryError(ctx, err)
		}
		return &SQLResponse{Columns: columns, Rows: data, Truncated: truncated}, nil
	}

	result, err := db.ExecContext(ctx, req.Query, req.Params...)
	if err != nil {
		return nil, queryError(ctx, err)
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

// openDatabase opens a pool scoped to a request's database and schema. The
// database is the driver's first level above schemas (a catalog in Trino). Empty
// values keep the connection's own defaults, so nothing overrides what the DSN,
// the role, or the server configured. The drivers' own parsers keep credentials
// and options intact in URL, keyword, socket, ADO, and ODBC connection strings.
func openDatabase(config *SQLConfig, database, schema string) (*sql.DB, error) {
	if strings.ContainsRune(schema, '\x00') {
		return nil, fmt.Errorf("invalid schema name")
	}

	switch config.Driver {
	case "postgres":
		cfg, err := pq.NewConfig(config.DSN)
		if err != nil {
			return nil, err
		}
		if database != "" {
			cfg.Database = database
		}
		connector, err := pq.NewConnectorConfig(cfg)
		if err != nil {
			return nil, err
		}
		if schema == "" {
			return sql.OpenDB(connector), nil
		}
		// Put the schema first and keep the rest of the connection's search path,
		// so extensions and types installed in public (or wherever the role's
		// path points) still resolve. A session setting rather than a startup
		// parameter works behind PgBouncer too.
		return sql.OpenDB(sessionConnector{connector, func(ctx context.Context, conn driver.Conn) error {
			return execSession(ctx, conn, `SELECT set_config('search_path', CASE current_setting('search_path') WHEN '' THEN $1 ELSE $1 || ', ' || current_setting('search_path') END, false)`,
				pq.QuoteIdentifier(schema))
		}}), nil

	case "oracle":
		// Keep "oracle" as Granite's connection type; Oracle registers "oracledb".
		// An Oracle connection reaches a single database (the service's PDB).
		if schema == "" {
			return sql.Open("oracledb", config.DSN)
		}
		if strings.ContainsRune(schema, '"') {
			return nil, fmt.Errorf("invalid schema name")
		}
		connector, err := connectorFor("oracledb", config.DSN)
		if err != nil {
			return nil, err
		}
		return sql.OpenDB(sessionConnector{connector, func(ctx context.Context, conn driver.Conn) error {
			return execSession(ctx, conn, `ALTER SESSION SET CURRENT_SCHEMA = "`+schema+`"`)
		}}), nil

	case "trino":
		u, err := url.Parse(config.DSN)
		if err != nil {
			return nil, err
		}
		params, err := url.ParseQuery(u.RawQuery)
		if err != nil {
			return nil, err
		}
		catalog := database
		// Links and favorites from before catalogs and schemas were separate
		// levels name both in the database, as "catalog.schema".
		if schema == "" {
			if before, after, ok := strings.Cut(database, "."); ok {
				catalog, schema = before, after
			}
		}
		if catalog != "" {
			params.Set("catalog", catalog)
		}
		if schema != "" {
			params.Set("schema", schema)
		}
		u.RawQuery = params.Encode()
		return sql.Open(config.Driver, u.String())
	}

	// SQL Server cannot change a session's default schema, and MySQL and SQLite
	// have no schema level below the database: their tables are qualified instead.
	if schema != "" {
		return nil, fmt.Errorf("schema selection is not supported for %s", config.Driver)
	}

	switch config.Driver {
	case "mysql":
		if database == "" {
			return sql.Open(config.Driver, config.DSN)
		}
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
		if database == "" {
			return sql.Open(config.Driver, config.DSN)
		}
		cfg, err := msdsn.Parse(config.DSN)
		if err != nil {
			return nil, err
		}
		cfg.Database = database
		return sql.OpenDB(mssql.NewConnectorConfig(cfg)), nil

	default:
		// SQLite files are selected by the saved DSN.
		return sql.Open(config.Driver, config.DSN)
	}
}

// sessionConnector runs setup on every new connection, so a session setting
// such as the schema holds for each statement, including batches that share
// one connection. Every request opens its own pool, so settings never leak
// into other requests.
type sessionConnector struct {
	driver.Connector
	setup func(context.Context, driver.Conn) error
}

func (c sessionConnector) Connect(ctx context.Context) (driver.Conn, error) {
	conn, err := c.Connector.Connect(ctx)
	if err != nil {
		return nil, err
	}
	if err := c.setup(ctx, conn); err != nil {
		conn.Close()
		return nil, err
	}
	return conn, nil
}

// execSession runs a setup statement on a raw driver connection.
func execSession(ctx context.Context, conn driver.Conn, query string, args ...any) error {
	values := make([]driver.NamedValue, len(args))
	for i, arg := range args {
		values[i] = driver.NamedValue{Ordinal: i + 1, Value: arg}
	}
	if execer, ok := conn.(driver.ExecerContext); ok {
		_, err := execer.ExecContext(ctx, query, values)
		if !errors.Is(err, driver.ErrSkip) {
			return err
		}
	}
	stmt, err := conn.Prepare(query)
	if err != nil {
		return err
	}
	defer stmt.Close()
	execer, ok := stmt.(driver.StmtExecContext)
	if !ok {
		return fmt.Errorf("driver cannot run session setup")
	}
	_, err = execer.ExecContext(ctx, values)
	return err
}

// connectorFor returns the connector of a driver registered with database/sql.
func connectorFor(name, dsn string) (driver.Connector, error) {
	db, err := sql.Open(name, dsn)
	if err != nil {
		return nil, err
	}
	drv := db.Driver()
	db.Close()
	if opener, ok := drv.(driver.DriverContext); ok {
		return opener.OpenConnector(dsn)
	}
	return dsnConnector{dsn, drv}, nil
}

type dsnConnector struct {
	dsn    string
	driver driver.Driver
}

func (c dsnConnector) Connect(context.Context) (driver.Conn, error) { return c.driver.Open(c.dsn) }
func (c dsnConnector) Driver() driver.Driver                        { return c.driver }
