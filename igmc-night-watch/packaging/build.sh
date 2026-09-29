#!/usr/bin/env bash
# Builds "IGMC Night Watch Setup.exe" and the release zip.
# Needs: Go 1.24+, NSIS (makensis), zip. Run from anywhere.
# Copyright (c) 2026 NIKJYAR Studios. All rights reserved.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
GAME="$HERE/../IGMC_Night_Watch_6_Missions_HYPER_REAL_INTERIOR_V6.html"
BUILD="$HERE/build"
rm -rf "$BUILD"; mkdir -p "$BUILD"

cd "$HERE/launcher"
export GOTOOLCHAIN=local
go run ./seal "$GAME" .                       # game.bin + key_gen.go, fresh key every build
if [ -x "$HOME/go/bin/go-winres" ]; then "$HOME/go/bin/go-winres" make --in winres/winres.json --arch amd64; fi
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -H windowsgui -buildid=" -o "$BUILD/IGMC Night Watch.exe" .

cd "$HERE"
makensis -V2 -DBUILD="build" installer.nsi

cd "$BUILD"
mkdir -p zip
cp "IGMC Night Watch Setup.exe" "$HERE/README.txt" "$HERE/LICENSE.txt" zip/
( cd zip && zip -q -9 -X "../IGMC_Night_Watch_NIKJYAR_Studios.zip" "IGMC Night Watch Setup.exe" README.txt LICENSE.txt )
rm -rf zip
ls -la "$BUILD"
