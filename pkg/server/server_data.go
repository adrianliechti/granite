package server

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
)

// getConnection retrieves a connection configuration by ID
func (s *Server) getConnection(id string) (*Connection, error) {
	filePath := filepath.Join(getDataDir(), "connections", id+".json")

	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, err
	}

	var conn Connection
	if err := json.Unmarshal(data, &conn); err != nil {
		return nil, err
	}

	conn.ID = id
	return &conn, nil
}

// saveConnection saves a connection configuration
func (s *Server) saveConnection(conn *Connection) error {
	dir := filepath.Join(getDataDir(), "connections")

	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	data, err := json.Marshal(conn)
	if err != nil {
		return err
	}

	filePath := filepath.Join(dir, conn.ID+".json")
	return os.WriteFile(filePath, data, 0644)
}

// deleteConnection deletes a connection configuration
func (s *Server) deleteConnection(id string) error {
	filePath := filepath.Join(getDataDir(), "connections", id+".json")
	return os.Remove(filePath)
}

// listConnections returns all connection configurations
func (s *Server) listConnections() ([]Connection, error) {
	dir := filepath.Join(getDataDir(), "connections")

	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return []Connection{}, nil
		}
		return nil, err
	}

	connections := make([]Connection, 0)

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		if filepath.Ext(entry.Name()) != ".json" {
			continue
		}

		id := strings.TrimSuffix(entry.Name(), ".json")

		conn, err := s.getConnection(id)
		if err != nil {
			continue
		}

		if info, err := entry.Info(); err == nil {
			modTime := info.ModTime()
			conn.UpdatedAt = &modTime
		}

		connections = append(connections, *conn)
	}

	return connections, nil
}

func getDataDir() string {
	home, err := os.UserHomeDir()

	if err != nil {
		return "data"
	}

	return filepath.Join(home, ".local", "share", "granite")
}
