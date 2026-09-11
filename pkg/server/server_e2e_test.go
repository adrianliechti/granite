package server

import (
	"flag"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/adrianliechti/granite/pkg/config"
)

var databaseE2E = flag.Bool("database-e2e", false, "run browser tests against the databases in connection.txt")

func TestDatabaseE2E(t *testing.T) {
	if !*databaseE2E {
		t.Skip("start the databases in connection.txt, then run npm run test:e2e")
	}
	dataDir := t.TempDir()
	t.Setenv("GRANITE_DATA_DIR", dataDir)
	server, err := New(&config.Config{})
	if err != nil {
		t.Fatal(err)
	}
	backend := httptest.NewServer(server)
	defer backend.Close()

	cmd := exec.CommandContext(t.Context(), "node", "--test", "tests/database.e2e.mjs")
	cmd.Dir = filepath.Join("..", "..")
	cmd.Env = append(os.Environ(), "GRANITE_TEST_URL="+backend.URL, "GRANITE_TEST_SQLITE="+filepath.Join(dataDir, "test.sqlite"))
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		t.Fatal(err)
	}
}
