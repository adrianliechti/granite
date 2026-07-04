package main

import (
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"

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

	background := &options.RGBA{R: 255, G: 255, B: 255, A: 255}

	if isDarkMode() {
		background = &options.RGBA{R: 10, G: 10, B: 10, A: 255}
	}

	opts := &options.App{
		Title: "Granite",

		Width:  1280,
		Height: 800,

		BackgroundColour: background,

		// The granite server has no WebSocket upgrades, so it can be used
		// directly as the AssetServer handler instead of spawning a
		// separate TCP listener and navigating the webview to it.
		AssetServer: &assetserver.Options{
			Handler: srv,
		},
	}

	if err := wails.Run(opts); err != nil {
		panic(err)
	}
}
