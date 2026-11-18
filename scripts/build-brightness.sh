#!/bin/sh
# Builds bin/apoji-brightness (real display brightness for the screen dimmer). macOS only; shared by Nexus '28 and
# Apoji Admin. Universal (Apple silicon + Intel). If it can't build, the dimmer just uses its dark layer.
cd "$(dirname "$0")/.." || exit 0
if [ "$(uname)" != "Darwin" ]; then echo "apoji-brightness: skipped (not macOS)"; exit 0; fi
if ! command -v swiftc >/dev/null 2>&1; then echo "apoji-brightness: swiftc not found (xcode-select --install); the dimmer will use its dark layer."; exit 0; fi
mkdir -p bin
if [ -f bin/apoji-brightness ] && [ bin/apoji-brightness -nt native/Brightness.swift ]; then echo "apoji-brightness: up to date"; exit 0; fi
T=$(mktemp -d)
if swiftc -O native/Brightness.swift -target arm64-apple-macos12 -o "$T/a" && swiftc -O native/Brightness.swift -target x86_64-apple-macos12 -o "$T/x"; then
  lipo -create "$T/a" "$T/x" -output bin/apoji-brightness
elif swiftc -O native/Brightness.swift -o bin/apoji-brightness; then :
else echo "apoji-brightness: build FAILED (the dimmer will use its dark layer)"; rm -rf "$T"; exit 0; fi
rm -rf "$T"
codesign --force --sign - bin/apoji-brightness 2>/dev/null || true
echo "apoji-brightness: built bin/apoji-brightness"
exit 0
