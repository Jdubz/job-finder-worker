#!/bin/bash
set -e

# Set PYTHONPATH dynamically to include node user's site-packages (avoids hardcoding Python version)
# Use gosu to get the correct path for the node user who will run the Python processes
export PYTHONPATH="/app/src:/app:$(gosu node python3 -m site --user-site)"

echo "========================================="
echo "Job Finder Worker Container Starting"
echo "========================================="
echo "Current time: $(date)"
echo "Timezone: $TZ"
echo "Environment: $ENVIRONMENT"
echo "Queue Mode: ${ENABLE_QUEUE_MODE:-false}"
echo ""

# Fix ownership of mounted volumes (runs as root initially)
# The node user (uid 1000) needs write access to data directories
echo "=== Fixing volume permissions ==="
chown -R node:node /data 2>/dev/null || true
chown -R node:node /app/data 2>/dev/null || true
chown -R node:node /app/logs 2>/dev/null || true

# LiteLLM connectivity check (retry up to 30s)
echo "=== LiteLLM Proxy ==="
LITELLM_URL="${LITELLM_BASE_URL:-http://litellm:4000}"
LITELLM_HEALTH="${LITELLM_URL%/v1}/health/readiness"
echo "Endpoint: $LITELLM_URL"
LITELLM_WAIT=0
LITELLM_MAX_WAIT=30
LITELLM_READY=false
while [ "$LITELLM_WAIT" -lt "$LITELLM_MAX_WAIT" ]; do
    if curl -sf "$LITELLM_HEALTH" > /dev/null 2>&1; then
        LITELLM_READY=true
        break
    fi
    echo "  Waiting for LiteLLM... (${LITELLM_WAIT}s)"
    sleep 2
    LITELLM_WAIT=$((LITELLM_WAIT + 2))
done
if [ "$LITELLM_READY" = "true" ]; then
    echo "✓ LiteLLM proxy is reachable (after ${LITELLM_WAIT}s)"
else
    echo "WARNING: LiteLLM proxy not reachable at $LITELLM_HEALTH after ${LITELLM_MAX_WAIT}s (worker will retry internally)"
fi
echo "=== End LiteLLM Proxy ==="

# Ensure logs directory exists with proper ownership
mkdir -p /app/logs
chown -R node:node /app/logs

# Run the selected worker as the foreground process via exec.
# This replaces the shell with the worker, so the worker becomes PID 1's
# direct child (or PID 1 itself if no init). Combined with `init: true` in
# docker-compose, this ensures proper signal delivery and zombie reaping.
if [ "${ENABLE_FLASK_WORKER:-true}" = "true" ]; then
    echo ""
    echo "========================================="
    echo "Starting Flask Worker (Port 5555)"
    echo "========================================="
    echo "Health endpoint: http://localhost:5555/health"
    echo "Status endpoint: http://localhost:5555/status"
    echo "========================================="
    echo ""

    # exec replaces this shell — Flask worker becomes the main process.
    # Python logging is configured in flask_worker.py and writes under /app/logs;
    # stdout/stderr go to docker logs via the container runtime.
    exec gosu node /usr/local/bin/python -u /app/src/job_finder/flask_worker.py

elif [ "${ENABLE_QUEUE_MODE}" = "true" ]; then
    echo ""
    echo "========================================="
    echo "Starting Queue Worker Daemon (Legacy)"
    echo "========================================="
    echo ""

    exec gosu node /usr/local/bin/python -u /app/scripts/workers/queue_worker.py

else
    echo ""
    echo "Container is running in IDLE mode (no worker enabled)."
    echo "========================================="
    exec sleep infinity
fi
