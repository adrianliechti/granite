package server

import (
	"database/sql"
	"strconv"

	mssql "github.com/microsoft/go-mssqldb"
)

func rowsToJSON(rows *sql.Rows, maxRows int) ([]string, []map[string]any, bool, error) {
	columns, err := rows.Columns()

	if err != nil {
		return nil, nil, false, err
	}

	// SQL Server returns uniqueidentifier values as 16 raw bytes in its own
	// mixed byte order; send them as the GUID text SQL Server accepts back.
	guids := make([]bool, len(columns))
	if types, err := rows.ColumnTypes(); err == nil {
		for i, t := range types {
			guids[i] = t.DatabaseTypeName() == "UNIQUEIDENTIFIER"
		}
	}

	var result []map[string]any

	for rows.Next() {
		if maxRows > 0 && len(result) >= maxRows {
			return columns, result, true, nil
		}
		values := make([]any, len(columns))
		pointers := make([]any, len(columns))

		for i := range values {
			pointers[i] = &values[i]
		}

		if err := rows.Scan(pointers...); err != nil {
			return nil, nil, false, err
		}

		row := make(map[string]any)

		for i, col := range columns {
			val := values[i]

			switch v := val.(type) {
			case []byte:
				var id mssql.UniqueIdentifier
				if guids[i] && id.Scan(v) == nil {
					row[col] = id.String()
				} else {
					row[col] = string(v)
				}
			case int64:
				if v > 9007199254740991 || v < -9007199254740991 {
					row[col] = strconv.FormatInt(v, 10)
				} else {
					row[col] = v
				}
			default:
				row[col] = v
			}
		}

		result = append(result, row)
	}

	return columns, result, false, rows.Err()
}
