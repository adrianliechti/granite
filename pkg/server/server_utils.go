package server

import (
	"database/sql"
	"net/url"
	"strings"
)

// modifyDSNForDatabase modifies a DSN to connect to a specific database
func modifyDSNForDatabase(driver, dsn, database string) string {
	if database == "" {
		return dsn
	}

	switch driver {
	case "postgres":
		// PostgreSQL DSN format: postgres://user:pass@host:port/dbname?params
		if u, err := url.Parse(dsn); err == nil {
			u.Path = "/" + database
			return u.String()
		}

	case "mysql":
		// MySQL DSN format: user:pass@tcp(host:port)/dbname?params
		parts := strings.Split(dsn, "/")
		if len(parts) >= 2 {
			// Keep everything before the last slash and replace dbname
			prefix := strings.Join(parts[:len(parts)-1], "/")
			suffix := parts[len(parts)-1]
			// Check if there are query params
			if idx := strings.Index(suffix, "?"); idx >= 0 {
				return prefix + "/" + database + suffix[idx:]
			}
			return prefix + "/" + database
		}

	case "sqlserver":
		// SQL Server DSN format: sqlserver://user:pass@host:port?database=dbname
		if u, err := url.Parse(dsn); err == nil {
			q := u.Query()
			q.Set("database", database)
			u.RawQuery = q.Encode()
			return u.String()
		}

	case "sqlite":
		// SQLite uses file paths, no database switching needed
		return dsn

	case "oracle":
		// Oracle TNS or EZConnect format - typically doesn't switch databases this way
		return dsn
	}

	return dsn
}

func rowsToJSON(rows *sql.Rows) ([]string, []map[string]any, error) {
	columns, err := rows.Columns()

	if err != nil {
		return nil, nil, err
	}

	var result []map[string]any

	for rows.Next() {
		values := make([]any, len(columns))
		pointers := make([]any, len(columns))

		for i := range values {
			pointers[i] = &values[i]
		}

		if err := rows.Scan(pointers...); err != nil {
			return nil, nil, err
		}

		row := make(map[string]any)

		for i, col := range columns {
			val := values[i]

			if b, ok := val.([]byte); ok {
				row[col] = string(b)
			} else {
				row[col] = val
			}
		}

		result = append(result, row)
	}

	return columns, result, rows.Err()
}
