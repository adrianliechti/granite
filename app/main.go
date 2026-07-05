package main

import (
	"log"
	"os"

	"github.com/adrianliechti/granite/pkg/config"
	"github.com/adrianliechti/granite/pkg/server"

	shell "github.com/adrianliechti/go-shell"
)

func main() {
	cfg, err := config.New()

	if err != nil {
		log.Fatal(err)
	}

	srv, err := server.New(cfg)

	if err != nil {
		log.Fatal(err)
	}

	err = shell.Run(shell.Options{
		Title:   "Granite",
		Handler: srv,

		Width:  1280,
		Height: 800,

		MinWidth:  640,
		MinHeight: 400,

		Debug: os.Getenv("GRANITE_DEBUG") != "",
	})

	if err != nil {
		log.Fatal(err)
	}
}
