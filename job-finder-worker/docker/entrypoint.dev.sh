#!/bin/bash
set -e

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

# Codex CLI auth check
echo "=== Codex CLI Setup ==="
echo "CODEX_HOME=${CODEX_HOME:-/home/node/.codex}"
if [ -d "/home/node/.codex" ]; then
    chown -R node:node /home/node/.codex
    echo "Codex config directory: EXISTS"
    if [ -f "/home/node/.codex/auth.json" ]; then
        echo "auth.json: EXISTS"
        if gosu node codex login status 2>/dev/null; then
            echo "✓ Codex authenticated"
        else
            echo "WARNING: Codex login status check failed"
        fi
    else
        echo "WARNING: auth.json not found"
    fi
else
    echo "WARNING: Codex directory not mounted"
fi
echo "=== End Codex Setup ==="
echo ""

# Gemini CLI auth check
echo "=== Gemini CLI Setup ==="
echo "GEMINI_HOME=${GEMINI_HOME:-/home/node/.gemini}"
if [ -d "/home/node/.gemini" ]; then
    chown -R node:node /home/node/.gemini
    echo "Gemini config directory: EXISTS"
    if [ -f "/home/node/.gemini/oauth_creds.json" ]; then
        echo "oauth_creds.json: EXISTS"
        if gosu node gemini auth status 2>/dev/null; then
            echo "✓ Gemini authenticated"
        else
            echo "WARNING: Gemini auth status check failed"
        fi
    else
        echo "WARNING: oauth_creds.json not found"
    fi
else
    echo "WARNING: Gemini directory not mounted"
fi
echo "=== End Gemini Setup ==="
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
