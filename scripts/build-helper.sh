#!/bin/sh
# Builds the NexusCore Swift helper (on-device speech + Apple Foundation Models). macOS only.
cd "$(dirname "$0")/.." || exit 0
if [ "$(uname)" != "Darwin" ]; then echo "NexusCore: skipped (not macOS)"; exit 0; fi
if ! command -v swiftc >/dev/null 2>&1; then
  echo "NexusCore: swiftc not found. Run: xcode-select --install  then: npm run build:helper"
  exit 0
fi
mkdir -p bin
if swiftc -O -swift-version 5 -parse-as-library native/NexusCore.swift -o bin/nexuscore \
     -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker native/Info.plist; then
  codesign --force --sign - --identifier com.apojidelegraphics.nexus.core bin/nexuscore 2>/dev/null || true
  echo "NexusCore: built bin/nexuscore"
else
  echo ""
  echo "  !!! NexusCore build FAILED (see the Swift errors above)."
  if [ -f bin/nexuscore ]; then echo "  !!! An older helper is still in bin/ — Calendar/Reminders won't work until this builds."; fi
  echo "  !!! Voice can still use OpenAI or ElevenLabs speech-to-text (Settings → Voice)."
  echo ""
fi
exit 0
