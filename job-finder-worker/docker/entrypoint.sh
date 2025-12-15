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
