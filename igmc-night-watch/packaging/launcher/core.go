// IGMC: Night Watch launcher
// Copyright (c) 2026 NIKJYAR Studios. All rights reserved.

package main

import (
	"bytes"
	"compress/gzip"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	_ "embed"
	"encoding/hex"
	"errors"
	"io"
	"net"
	"net/http"
	"strconv"
	"time"
)

// The game ships sealed inside the executable: gzip, then AES-256-GCM. It is
// only ever opened in memory and handed to the game window over a loopback
// socket, so there is no readable copy of it in the install folder.
//
//go:embed game.bin
var sealed []byte

// Ports tried in order. The first one is used whenever it is free, so the
// page keeps the same origin from one launch to the next and saved games
// (browser local storage, which is per origin) are still there.
var ports = []int{38471, 38472, 38473, 38474}

func unseal() ([]byte, error) {
	key := sealKey()
	defer func() {
		for i := range key {
			key[i] = 0
		}
	}()
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	if len(sealed) < gcm.NonceSize() {
		return nil, errors.New("game data is damaged")
	}
	plain, err := gcm.Open(nil, sealed[:gcm.NonceSize()], sealed[gcm.NonceSize():], []byte("NIKJYAR Studios · IGMC Night Watch"))
	if err != nil {
		return nil, errors.New("game data is damaged or has been tampered with")
	}
	zr, err := gzip.NewReader(bytes.NewReader(plain))
	if err != nil {
		return nil, err
	}
	defer zr.Close()
	return io.ReadAll(zr)
}

type server struct {
	ln    net.Listener
	token string
	url   string
	srv   *http.Server
}

func listen() (net.Listener, int, error) {
	var last error
	for _, p := range ports {
		ln, err := net.Listen("tcp", "127.0.0.1:"+strconv.Itoa(p))
		if err == nil {
			return ln, p, nil
		}
		last = err
	}
	return nil, 0, last
}

// serve answers only the one secret path of this launch, only on the loopback
// address, and only to requests that name 127.0.0.1 as their host (which
// shuts out other web pages trying to reach it through DNS rebinding).
func serve(game []byte) (*server, error) {
	ln, port, err := listen()
	if err != nil {
		return nil, err
	}
	tok := make([]byte, 16)
	if _, err := rand.Read(tok); err != nil {
		ln.Close()
		return nil, err
	}
	s := &server{ln: ln, token: hex.EncodeToString(tok)}
	host := "127.0.0.1:" + strconv.Itoa(port)
	s.url = "http://" + host + "/" + s.token + "/"
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.Host != host || (r.Method != http.MethodGet && r.Method != http.MethodHead) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		if r.URL.Path != "/"+s.token+"/" {
			http.NotFound(w, r)
			return
		}
		h := w.Header()
		h.Set("Content-Type", "text/html; charset=utf-8")
		h.Set("Cache-Control", "no-store")
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Server", "NIKJYAR Studios")
		http.ServeContent(w, r, "index.html", time.Time{}, bytes.NewReader(game))
	})
	s.srv = &http.Server{Handler: mux, ReadHeaderTimeout: 10 * time.Second}
	go s.srv.Serve(ln)
	return s, nil
}

func (s *server) close() { s.srv.Close() }
