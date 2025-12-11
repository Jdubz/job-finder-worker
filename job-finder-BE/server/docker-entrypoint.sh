#!/bin/sh
set -e

# Fix ownership of mounted volumes (runs as root initially)
# The node user (uid 1000) needs write access to data directories
chown -R node:node /data

# Codex CLI auth
# Direct bind mount from host - no seeding or chown needed.
# Host and container share the same auth.json (UID 1000 matches).
# Use codex-safe wrapper (flock) to prevent OAuth refresh token races.
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

# Gemini CLI auth
# Direct bind mount from host - no seeding or chown needed.
# Host and container share the same oauth_creds.json (UID 1000 matches).
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
