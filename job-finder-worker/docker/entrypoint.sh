#!/bin/bash
set -e

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

# Codex CLI auth
# We treat the runtime volume as replaceable and always copy from the read-only
# seed so restarts pick up the newest token without interactive login.
echo "=== Codex CLI Setup ==="
echo "Syncing codex seed into runtime volume..."
# The codex runtime lives on a named volume; deleting the mountpoint can fail
# with 'Device or resource busy'. Clear its contents instead.
mkdir -p /home/node/.codex
find /home/node/.codex -mindepth 1 -maxdepth 1 -exec rm -rf {} +
cp -a /codex-seed/. /home/node/.codex/
chown -R node:node /home/node/.codex
if [ -f /home/node/.codex/auth.json ]; then
    echo "✓ codex auth.json present"
else
    echo "ERROR: codex auth.json missing after seed sync"
    exit 1
fi
echo "=== End Codex Setup ==="

# Gemini CLI auth: mount ~/.gemini from host (contains OAuth tokens for Google account)
# The mount must be read-write so gemini can refresh expired tokens
GEMINI_REQUIRED=${GEMINI_REQUIRED:-false}
echo "=== Gemini CLI Setup ==="
echo "GEMINI_HOME=${GEMINI_HOME:-/home/node/.gemini}"

if [ -d "/home/node/.gemini" ]; then
    chown -R node:node /home/node/.gemini
    echo "Gemini config directory: EXISTS"
    ls -la /home/node/.gemini/ 2>/dev/null || true

    if [ -f "/home/node/.gemini/oauth_creds.json" ]; then
        echo "oauth_creds.json: EXISTS"
        echo "Checking gemini auth status..."
        if ! gosu node gemini auth status 2>/dev/null; then
            echo "WARNING: Gemini auth status check failed (token may need refresh)"
            [ "$GEMINI_REQUIRED" = "true" ] && exit 1
        else
            echo "✓ Gemini authenticated"
        fi
    else
        echo "WARNING: /home/node/.gemini/oauth_creds.json not found"
        [ "$GEMINI_REQUIRED" = "true" ] && exit 1
    fi
else
    echo "WARNING: /home/node/.gemini directory not mounted"
    echo "AI features using Gemini CLI will not work"
    echo "Mount your ~/.gemini folder to /home/node/.gemini"
    [ "$GEMINI_REQUIRED" = "true" ] && exit 1
fi
echo "=== End Gemini Setup ==="

# Start Flask worker if enabled (default mode)
if [ "${ENABLE_FLASK_WORKER:-true}" = "true" ]; then
    echo ""
    echo "========================================="
    echo "Starting Flask Worker (Port 5555)"
    echo "========================================="
    echo "Flask worker provides HTTP API for job processing"
    echo "Health endpoint: http://localhost:5555/health"
    echo "Status endpoint: http://localhost:5555/status"
    echo ""

    # Ensure logs directory exists with proper ownership
    mkdir -p /app/logs
    chown -R node:node /app/logs

    # Start Flask worker in background as node user
    gosu node /usr/local/bin/python /app/src/job_finder/flask_worker.py >> /app/logs/flask_worker.log 2>&1 &
    FLASK_WORKER_PID=$!

    # Wait a moment and check if it started
    sleep 3
    if ps -p $FLASK_WORKER_PID > /dev/null; then
        echo "✓ Flask worker started successfully (PID: $FLASK_WORKER_PID)"
        echo "✓ Health check: curl http://localhost:5555/health"
    else
        echo "✗ ERROR: Flask worker failed to start!"
        exit 1
    fi

    echo ""
    echo "Container is running in FLASK WORKER mode:"
    echo "  - Flask Worker (port 5555) - HTTP API for job processing"
    echo "  - Cron scheduling handled by API container"
    echo "========================================="
elif [ "${ENABLE_QUEUE_MODE}" = "true" ]; then
    echo ""
    echo "========================================="
    echo "Starting Queue Worker Daemon (Legacy)"
    echo "========================================="
    echo "Queue worker will process jobs from SQLite queue"
    echo ""

    # Ensure logs directory exists with proper ownership
    mkdir -p /app/logs
    chown -R node:node /app/logs

    # Start queue worker in background as node user
    gosu node /usr/local/bin/python /app/scripts/workers/queue_worker.py >> /app/logs/queue_worker.log 2>&1 &
    QUEUE_WORKER_PID=$!

    # Wait a moment and check if it started
    sleep 2
    if ps -p $QUEUE_WORKER_PID > /dev/null; then
        echo "✓ Queue worker started successfully (PID: $QUEUE_WORKER_PID)"
    else
        echo "✗ ERROR: Queue worker failed to start!"
        exit 1
    fi

    echo ""
    echo "Container is running in QUEUE WORKER mode (legacy):"
    echo "  - Queue Worker (continuous) - Processes queue items"
    echo "  - Cron scheduling handled by API container"
    echo "========================================="
else
    echo ""
    echo "Container is running in IDLE mode:"
    echo "  - Queue disabled (ENABLE_QUEUE_MODE=false)"
    echo "  - Flask disabled (ENABLE_FLASK_WORKER=false)"
    echo "  - No automatic processing will occur"
    echo "========================================="
fi

echo ""
echo "Monitor logs:"
if [ "${ENABLE_FLASK_WORKER:-true}" = "true" ]; then
    echo "  - Flask worker: tail -f /app/logs/flask_worker.log"
    echo "  - Health check: curl http://localhost:5555/health"
fi
if [ "${ENABLE_QUEUE_MODE}" = "true" ]; then
    echo "  - Queue worker: tail -f /app/logs/queue_worker.log"
fi
echo "========================================="
echo ""

# Tail logs (this keeps container running and shows output)
if [ "${ENABLE_FLASK_WORKER:-true}" = "true" ]; then
    # Tail just Flask worker log
    exec tail -f /app/logs/flask_worker.log
elif [ "${ENABLE_QUEUE_MODE}" = "true" ]; then
    # Tail just queue worker log
    exec tail -f /app/logs/queue_worker.log
else
    # Neither enabled - just keep container alive
    echo "No active processes to monitor. Container will sleep indefinitely."
    exec sleep infinity
fi
