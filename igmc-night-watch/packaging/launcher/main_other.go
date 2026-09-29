// Copyright (c) 2026 NIKJYAR Studios. All rights reserved.

//go:build !windows

package main

import (
	"fmt"
	"os"
	"os/signal"
)

// Off Windows the launcher only unseals and serves the game, which is how
// the build checks that what went into the executable comes back out whole.
func main() {
	game, err := unseal()
	if err != nil {
		fmt.Fprintln(os.Stderr, "unseal:", err)
		os.Exit(1)
	}
	srv, err := serve(game)
	if err != nil {
		fmt.Fprintln(os.Stderr, "serve:", err)
		os.Exit(1)
	}
	fmt.Println(srv.url, len(game))
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt)
	<-c
	srv.close()
}
