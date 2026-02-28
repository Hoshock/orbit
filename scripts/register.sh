#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BIN_PATH="$PROJECT_DIR/bin/crev"
LINK_PATH="$HOME/.local/bin/crev"

chmod +x "$BIN_PATH"
mkdir -p "$(dirname "$LINK_PATH")"

if [ -L "$LINK_PATH" ]; then
	rm "$LINK_PATH"
fi

ln -s "$BIN_PATH" "$LINK_PATH"
echo "crev registered at $LINK_PATH"
echo "Make sure ~/.local/bin is in your PATH"
