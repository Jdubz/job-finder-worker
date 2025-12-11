#!/bin/sh
set -e

# Fix ownership of mounted volumes (runs as root initially)
# The node user (uid 1000) needs write access to data directories.
# Skip full chown when not needed to speed up restarts.
if [ -n "${SKIP_CHOWN}" ] && [ "${SKIP_CHOWN}" != "false" ]; then
  echo "Skipping chown of /data (SKIP_CHOWN=${SKIP_CHOWN})"
else
  find /data ! -user node -exec chown node:node {} + || true
fi

# Codex CLI auth (bind mounted from host; use codex-safe wrapper for flock serialization)
echo "=== Codex CLI Setup ==="
if [ -f /home/node/.codex/auth.json ]; then
    echo "✓ codex auth.json present (bind mount from host)"
    echo "  Using codex-safe wrapper for flock serialization"
else
    echo "ERROR: codex auth.json not found"
    echo "  Ensure ~/.codex is bind-mounted from host"
    exit 1
fi
echo "=== End Codex Setup ==="

# Gemini CLI auth (bind mounted from host)
echo "=== Gemini CLI Setup ==="
if [ -f /home/node/.gemini/oauth_creds.json ]; then
    echo "✓ gemini oauth_creds.json present (bind mount from host)"
else
    echo "ERROR: gemini oauth_creds.json not found"
    echo "  Ensure ~/.gemini is bind-mounted from host"
    exit 1
fi
echo "=== End Gemini Setup ==="

# Drop privileges and run as node user
exec gosu node "$@"
