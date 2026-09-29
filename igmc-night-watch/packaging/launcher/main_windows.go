// IGMC: Night Watch launcher for Windows
// Copyright (c) 2026 NIKJYAR Studios. All rights reserved.

//go:build windows

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"time"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

const title = "IGMC: Night Watch — NIKJYAR Studios"

func msg(text string, icon uint32) {
	windows.MessageBox(0, windows.StringToUTF16Ptr(text), windows.StringToUTF16Ptr(title), icon|windows.MB_OK|windows.MB_SETFOREGROUND)
}

// a Chromium browser to host the game window: Edge ships with Windows 10 and
// 11, Chrome and Brave are taken if Edge is missing
func findBrowser() string {
	for _, exe := range []string{"msedge.exe", "chrome.exe", "brave.exe"} {
		for _, root := range []registry.Key{registry.CURRENT_USER, registry.LOCAL_MACHINE} {
			k, err := registry.OpenKey(root, `SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\`+exe, registry.QUERY_VALUE)
			if err != nil {
				continue
			}
			p, _, err := k.GetStringValue("")
			k.Close()
			if err == nil && fileExists(p) {
				return p
			}
		}
	}
	var cands []string
	for _, env := range []string{"ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA"} {
		base := os.Getenv(env)
		if base == "" {
			continue
		}
		cands = append(cands,
			filepath.Join(base, `Microsoft\Edge\Application\msedge.exe`),
			filepath.Join(base, `Google\Chrome\Application\chrome.exe`),
			filepath.Join(base, `BraveSoftware\Brave-Browser\Application\brave.exe`))
	}
	for _, c := range cands {
		if fileExists(c) {
			return c
		}
	}
	return ""
}

func fileExists(p string) bool { st, err := os.Stat(p); return err == nil && !st.IsDir() }

func main() {
	// one copy at a time
	name, _ := windows.UTF16PtrFromString(`Local\NIKJYAR_Studios_IGMC_Night_Watch`)
	h, err := windows.CreateMutex(nil, false, name)
	if err == windows.ERROR_ALREADY_EXISTS {
		msg("IGMC: Night Watch pehle se chal raha hai.\nThe game is already running.", windows.MB_ICONINFORMATION)
		return
	}
	if h != 0 {
		defer windows.CloseHandle(h)
	}

	browser := findBrowser()
	if browser == "" {
		msg("Microsoft Edge ya Google Chrome nahi mila.\nPlease install Microsoft Edge or Google Chrome and start the game again.", windows.MB_ICONERROR)
		return
	}
	game, err := unseal()
	if err != nil {
		msg("Game files kharab hain — dobara install karo.\nThe game files are damaged: "+err.Error(), windows.MB_ICONERROR)
		return
	}
	srv, err := serve(game)
	if err != nil {
		msg("Game start nahi ho paya.\nCould not start the game: "+err.Error(), windows.MB_ICONERROR)
		return
	}
	defer srv.close()

	// its own browser profile: saves live here, and nothing of the player's
	// normal browsing (extensions, tabs, sign-in) touches the game window
	profile := filepath.Join(os.Getenv("LOCALAPPDATA"), "NIKJYAR Studios", "IGMC Night Watch", "Profile")
	os.MkdirAll(profile, 0o755)
	args := []string{
		"--app=" + srv.url,
		"--user-data-dir=" + profile,
		"--start-fullscreen",
		"--no-first-run",
		"--no-default-browser-check",
		"--disable-sync",
		"--disable-extensions",
		"--disable-translate",
		"--disable-features=Translate,msEdgeTranslate,msImplicitSignin,msEdgeSidebarV2,msHubApps,EdgeCollections,msShoppingExp,msEdgeShoppingUI",
		"--autoplay-policy=no-user-gesture-required",
		"--force_high_performance_gpu",
		"--disable-background-timer-throttling",
		"--disable-renderer-backgrounding",
		"--window-name=" + title,
	}
	cmd := exec.Command(browser, args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: false}
	start := time.Now()
	if err := cmd.Start(); err != nil {
		msg("Game window nahi khul paya.\nCould not open the game window: "+err.Error(), windows.MB_ICONERROR)
		return
	}
	cmd.Wait()
	// if the browser handed the window to a copy that was already running,
	// keep answering long enough for the page to load there
	if time.Since(start) < 5*time.Second {
		time.Sleep(90 * time.Second)
	}
}
