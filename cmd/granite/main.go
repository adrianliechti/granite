package main

import (
	"context"

	"github.com/adrianliechti/granite/pkg/config"
	"github.com/adrianliechti/granite/pkg/server"
)

func main() {
	cfg, err := config.New()

	if err != nil {
		panic(err)
	}

	srv, err := server.New(cfg)

	if err != nil {
		panic(err)
	}

	if err := srv.ListenAndServe(context.Background(), "localhost:7777"); err != nil {
		panic(err)
	}
}
