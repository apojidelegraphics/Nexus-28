#!/bin/sh
# Stand-in for macOS `say`: records args, "speaks" for a moment, lists voices with -v ?
if [ "$1" = "-v" ] && [ "$2" = "?" ]; then
  printf 'Albert              en_US    # Hello! My name is Albert.\nEddy (English (US)) en_US    # Hello! My name is Eddy.\nAmélie              fr_CA    # Bonjour\n'
  exit 0
fi
printf '%s\n' "$@" > "${FAKE_SAY_LOG:-/dev/null}"
sleep "${FAKE_SAY_SECS:-0.3}"
