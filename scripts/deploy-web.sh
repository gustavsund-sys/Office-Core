#!/bin/sh
set -eu
: "${VITE_GAME_SERVER_URL:?Set VITE_GAME_SERVER_URL to the deployed wss:// server URL}"
case "$VITE_GAME_SERVER_URL" in wss://*) ;; *) echo 'Production requires wss://' >&2; exit 1;; esac
unset VITE_AUTH_EMULATOR_URL
pnpm build
exec firebase deploy --only hosting --project officecore-ad307
