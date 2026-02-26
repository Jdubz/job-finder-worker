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

# LiteLLM connectivity check
echo "=== LiteLLM Proxy ==="
LITELLM_URL="${LITELLM_BASE_URL:-http://litellm:4000}"
LITELLM_HEALTH="${LITELLM_URL}/health"
echo "Endpoint: $LITELLM_URL"
if curl -sf "$LITELLM_HEALTH" > /dev/null 2>&1; then
    echo "✓ LiteLLM proxy is reachable"
else
    echo "WARNING: LiteLLM proxy not reachable at $LITELLM_HEALTH (may still be starting)"
fi
echo "=== End LiteLLM Proxy ==="

# Drop privileges and run as node user
exec gosu node "$@"
