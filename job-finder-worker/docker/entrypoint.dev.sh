#!/bin/bash
set -e

# Worker command - defined once for consistency
WORKER_CMD="python /app/src/job_finder/flask_worker.py"

echo "========================================="
echo "Job Finder Worker - DEVELOPMENT MODE"
echo "========================================="
echo "Current time: $(date)"
echo "Environment: ${ENVIRONMENT:-development}"
echo "Hot Reload: ${ENABLE_HOT_RELOAD:-true}"
echo "Database: ${SQLITE_DB_PATH:-/data/sqlite/jobfinder.db}"
echo ""

# Ensure directories exist
mkdir -p /app/logs /app/data

# Check database exists
DB_PATH="${SQLITE_DB_PATH:-/data/sqlite/jobfinder.db}"
if [ ! -f "$DB_PATH" ]; then
    echo "WARNING: Database not found at $DB_PATH"
    echo "Run 'make dev-clone-db' to clone production database"
    echo ""
fi

# Function to start the Flask worker
start_worker() {
    echo "Starting Flask worker on port ${WORKER_PORT:-5555}..."
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
    exec watchmedo auto-restart \
        --directory=/app/src \
        --pattern='*.py' \
        --recursive \
        --kill-after=3 \
        -- $WORKER_CMD
else
    echo "Hot reload disabled, starting worker directly..."
    start_worker
fi
