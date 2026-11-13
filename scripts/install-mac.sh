#!/bin/sh
# Builds Nexus '28.app, installs it to /Applications, and ad-hoc signs it (no Apple Developer account needed).
set -e
cd "$(dirname "$0")/.."
APP_NAME="Nexus '28.app"
DEST="/Applications/$APP_NAME"

echo "▸ Building the Swift helper…"
npm run build:helper
echo "▸ Building $APP_NAME (this takes a minute)…"
npx electron-builder --mac --dir

SRC=$(ls -d dist/mac*/"$APP_NAME" 2>/dev/null | head -1)
if [ -z "$SRC" ]; then echo "✗ Build finished but $APP_NAME wasn't found in dist/."; exit 1; fi

echo "▸ Installing to /Applications…"
pkill -f "$DEST/Contents/MacOS" 2>/dev/null || true
sleep 1
rm -rf "$DEST"
cp -R "$SRC" /Applications/

echo "▸ Ad-hoc signing…"
# Clear quarantine/extended attributes first, then sign: stripping attributes after signing can break the seal.
xattr -cr "$DEST"
codesign --force --deep --sign - "$DEST"
if codesign --verify --deep --strict "$DEST" 2>/dev/null; then echo "  ✓ signature valid"; else echo "  ⚠ signature check failed:"; codesign --verify --deep --strict --verbose=2 "$DEST"; fi

echo "✓ Installed $DEST"
echo "  If the window is ever blank, the reason is in: ~/Library/Logs/Nexus/main.log"
open "$DEST"
