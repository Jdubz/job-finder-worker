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

# Claude CLI auth check (uses CLAUDE_CODE_OAUTH_TOKEN env var)
# Note: Only claude.cli is supported for CLI interface. gemini.api uses the Google Generative AI SDK.
echo "=== Claude CLI Setup ==="
if [ -n "${CLAUDE_CODE_OAUTH_TOKEN}" ]; then
    echo "✓ CLAUDE_CODE_OAUTH_TOKEN is set"
else
    echo "WARNING: CLAUDE_CODE_OAUTH_TOKEN not set"
    echo "  Claude CLI will not be available for document generation"
fi
echo "=== End Claude Setup ==="

# Gemini API auth check (uses GEMINI_API_KEY or GOOGLE_API_KEY)
echo "=== Gemini API Setup ==="
if [ -n "${GEMINI_API_KEY}" ] || [ -n "${GOOGLE_API_KEY}" ]; then
    echo "✓ Gemini API key is set"
else
    echo "WARNING: GEMINI_API_KEY/GOOGLE_API_KEY not set"
    echo "  Gemini API will not be available"
fi
echo "=== End Gemini Setup ==="

# Drop privileges and run as node user
exec gosu node "$@"
