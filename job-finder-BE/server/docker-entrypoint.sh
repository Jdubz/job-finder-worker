#!/bin/sh
set -e

# Fix ownership of mounted volumes (runs as root initially)
# The node user (uid 1000) needs write access to data directories
# Skip if already owned to reduce restart time on large volumes
if [ -n "${SKIP_CHOWN}" ] && [ "${SKIP_CHOWN}" != "false" ]; then
  echo "Skipping chown of /data (SKIP_CHOWN=${SKIP_CHOWN})"
else
  find /data ! -user node -exec chown node:node {} + || true
fi

# Codex CLI auth: always reseed runtime volume from read-only seed on start.
echo "=== Codex CLI Setup ==="
echo "Syncing codex seed into runtime volume..."
mkdir -p /home/node/.codex
if [ -f /home/node/.codex/auth.json ]; then
    echo "Codex auth already present; skipping reseed"
else
    echo "Reseeding Codex auth..."
    # The codex runtime lives on a named volume; deleting the mountpoint can fail with
    # 'Device or resource busy' and crash the container. Clear contents instead.
    find /home/node/.codex -mindepth 1 -maxdepth 1 -exec rm -rf {} +
    cp -a /codex-seed/. /home/node/.codex/
    chown -R node:node /home/node/.codex
fi
if [ -f /home/node/.codex/auth.json ]; then
    echo "✓ codex auth.json present"
else
    echo "ERROR: codex auth.json missing after seed sync"
    echo "AI document generation will fail!"
    exit 1
fi
echo "=== End Codex Setup ==="

# Gemini CLI auth: mount ~/.gemini from host (contains OAuth tokens for Google account)
# The mount must be read-write so gemini can refresh expired tokens
# Set GEMINI_REQUIRED=false to allow container start without Gemini (e.g., offline/dev).
GEMINI_REQUIRED=${GEMINI_REQUIRED:-false}
echo "=== Gemini CLI Setup ==="
echo "GEMINI_HOME=$GEMINI_HOME"

if [ -d "/home/node/.gemini" ]; then
    chown -R node:node /home/node/.gemini
    echo "Gemini config directory: EXISTS"
    ls -la /home/node/.gemini/ 2>/dev/null || true

    if [ -f "/home/node/.gemini/oauth_creds.json" ]; then
        echo "oauth_creds.json: EXISTS"
        echo "Checking gemini auth status..."
        if ! gosu node gemini auth status 2>/dev/null; then
            echo "WARNING: Gemini auth status failed (token may need refresh)"
            [ "$GEMINI_REQUIRED" = "true" ] && exit 1
        fi
    else
        echo "WARNING: /home/node/.gemini/oauth_creds.json NOT FOUND"
        [ "$GEMINI_REQUIRED" = "true" ] && exit 1
    fi
else
    echo "WARNING: /home/node/.gemini directory NOT MOUNTED"
    echo "AI features using Gemini CLI will not work"
    echo "Mount your ~/.gemini folder to /home/node/.gemini"
    [ "$GEMINI_REQUIRED" = "true" ] && exit 1
fi
echo "=== End Gemini Setup ==="

# Drop privileges and run as node user
exec gosu node "$@"
