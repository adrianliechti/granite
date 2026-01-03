package server

import (
	"database/sql"
)

func rowsToJSON(rows *sql.Rows) ([]string, []map[string]interface{}, error) {
	columns, err := rows.Columns()

	if err != nil {
		return nil, nil, err
	}

	var result []map[string]interface{}

	for rows.Next() {
		values := make([]interface{}, len(columns))
		pointers := make([]interface{}, len(columns))

		for i := range values {
			pointers[i] = &values[i]
		}

		if err := rows.Scan(pointers...); err != nil {
			return nil, nil, err
		}

		row := make(map[string]interface{})

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
