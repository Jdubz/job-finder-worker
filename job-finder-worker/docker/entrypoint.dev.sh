#!/bin/bash
set -e

# Set PYTHONPATH dynamically to include node user's site-packages (consistent with production)
export PYTHONPATH="/app/src:/app:$(gosu node python3 -m site --user-site)"

echo "========================================="
echo "Job Finder Worker - DEVELOPMENT MODE"
echo "========================================="
echo "Current time: $(date)"
echo "Environment: ${ENVIRONMENT:-development}"
echo "Hot Reload: ${ENABLE_HOT_RELOAD:-true}"
echo "Database: ${SQLITE_DB_PATH:-/data/sqlite/jobfinder.db}"
echo ""

# Fix ownership of mounted volumes (runs as root initially)
# The node user (uid 1000) needs write access to data directories
echo "=== Fixing volume permissions ==="
chown -R node:node /data 2>/dev/null || true
chown -R node:node /app/data 2>/dev/null || true
chown -R node:node /app/logs 2>/dev/null || true

# LiteLLM connectivity check
echo "=== LiteLLM Proxy ==="
LITELLM_URL="${LITELLM_BASE_URL:-http://litellm:4000/v1}"
LITELLM_HEALTH="${LITELLM_URL%/v1}/health"
echo "Endpoint: $LITELLM_URL"
if curl -sf "$LITELLM_HEALTH" > /dev/null 2>&1; then
    echo "✓ LiteLLM proxy is reachable"
else
    echo "WARNING: LiteLLM proxy not reachable at $LITELLM_HEALTH (may still be starting)"
fi
echo "=== End LiteLLM Proxy ==="
echo ""

# Check database exists
DB_PATH="${SQLITE_DB_PATH:-/data/sqlite/jobfinder.db}"
if [ ! -f "$DB_PATH" ]; then
    echo "WARNING: Database not found at $DB_PATH"
    echo "Run 'make dev-clone-db' to clone production database"
    echo ""
fi

# Worker command - runs as node user
WORKER_CMD="gosu node python /app/src/job_finder/flask_worker.py"

# Function to start the Flask worker
start_worker() {
    echo "Starting Flask worker on port ${WORKER_PORT:-5555} as node user..."
    exec $WORKER_CMD
}

# Check if hot reload is enabled
if [ "${ENABLE_HOT_RELOAD:-true}" = "true" ]; then
    echo "========================================="
    echo "HOT RELOAD ENABLED"
    echo "========================================="
    echo "Watching /app/src for Python file changes..."
    echo "Worker will auto-restart on file save"
    echo ""

    # Use watchmedo to watch for changes and restart
    # - watches /app/src directory recursively
    # - only monitors .py files
    # - restarts the flask_worker.py process on changes
    # - kill-after 3 ensures clean shutdown
    # - runs as node user via gosu
    exec gosu node watchmedo auto-restart \
        --directory=/app/src \
        --pattern='*.py' \
        --recursive \
        --kill-after=3 \
        -- python /app/src/job_finder/flask_worker.py
else
    echo "Hot reload disabled, starting worker directly..."
    start_worker
fi
