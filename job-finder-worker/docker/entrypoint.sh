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

# Codex CLI auth: mount ~/.codex from host (contains OAuth tokens for ChatGPT Pro)
# The mount must be read-write so codex can refresh expired tokens
# Uses same approach as API container for consistency
CODEX_REQUIRED=${CODEX_REQUIRED:-false}
echo "=== Codex CLI Setup ==="
echo "CODEX_HOME=${CODEX_HOME:-/home/node/.codex}"

if [ -d "/home/node/.codex" ]; then
    chown -R node:node /home/node/.codex
    echo "Codex config directory: EXISTS"
    ls -la /home/node/.codex/ 2>/dev/null || true

    if [ -f "/home/node/.codex/auth.json" ]; then
        echo "auth.json: EXISTS"
        echo "Checking codex login status..."
        if ! gosu node codex login status 2>/dev/null; then
            echo "WARNING: Codex login status check failed (token may need refresh)"
            [ "$CODEX_REQUIRED" = "true" ] && exit 1
        else
            echo "✓ Codex authenticated"
        fi
    else
        echo "WARNING: /home/node/.codex/auth.json not found"
        [ "$CODEX_REQUIRED" = "true" ] && exit 1
    fi
else
    echo "WARNING: /home/node/.codex directory not mounted"
    echo "AI features using Codex CLI will not work"
    echo "Mount your ~/.codex folder to /home/node/.codex"
    [ "$CODEX_REQUIRED" = "true" ] && exit 1
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

# Check if cron should be enabled (default: true for backward compatibility)
ENABLE_CRON=${ENABLE_CRON:-true}

if [ "${ENABLE_CRON}" = "true" ]; then
    # Save environment variables for cron
    echo "Saving environment variables for cron..."
    printenv > /etc/environment

    # Show cron schedule
    echo "Cron schedule:"
    cat /etc/cron.d/job-finder-cron | grep -v '^#' | grep -v '^$'
    echo ""

    # Calculate next run time
    CURRENT_HOUR=$((10#$(date +%H)))
    CURRENT_MIN=$((10#$(date +%M)))
    NEXT_RUN_HOUR=$(( (CURRENT_HOUR / 6 + 1) * 6 ))
    if [ $NEXT_RUN_HOUR -ge 24 ]; then
        NEXT_RUN_HOUR=0
    fi

    echo "Next scheduled run: $(printf "%02d:00" $NEXT_RUN_HOUR)"
    echo ""

    # Start cron
    echo "Starting cron daemon..."
    cron

    # Check if cron is running
    if pgrep cron > /dev/null; then
        echo "✓ Cron daemon started successfully"
    else
        echo "✗ ERROR: Cron daemon failed to start!"
        exit 1
    fi
else
    echo "Cron disabled (ENABLE_CRON=false)"
    echo "Job scraping will only run via manual queue submissions"
    echo ""
fi

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
    gosu node /home/node/.local/bin/python /app/src/job_finder/flask_worker.py >> /app/logs/flask_worker.log 2>&1 &
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
    if [ "${ENABLE_CRON}" = "true" ]; then
        echo "Container is running in HYBRID mode:"
        echo "  1. Cron (every 6h) - Scrapes sources and adds to queue"
        echo "  2. Flask Worker (port 5555) - HTTP API for job processing"
    else
        echo "Container is running in FLASK-ONLY mode:"
        echo "  - Cron disabled (manual queue submissions only)"
        echo "  - Flask Worker (port 5555) - HTTP API for job processing"
    fi
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
    gosu node /home/node/.local/bin/python /app/scripts/workers/queue_worker.py >> /app/logs/queue_worker.log 2>&1 &
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
    if [ "${ENABLE_CRON}" = "true" ]; then
        echo "Container is running in DUAL-PROCESS mode:"
        echo "  1. Cron (every 6h) - Scrapes sources and adds to queue"
        echo "  2. Queue Worker (continuous) - Processes queue items"
    else
        echo "Container is running in QUEUE-ONLY mode:"
        echo "  - Cron disabled (manual queue submissions only)"
        echo "  - Queue Worker (continuous) - Processes queue items"
    fi
    echo "========================================="
else
    echo ""
    if [ "${ENABLE_CRON}" = "true" ]; then
        echo "Container is running in LEGACY mode (direct processing)"
        echo "Queue mode disabled. Use ENABLE_QUEUE_MODE=true to enable."
    else
        echo "Container is running in IDLE mode:"
        echo "  - Cron disabled (ENABLE_CRON=false)"
        echo "  - Queue disabled (ENABLE_QUEUE_MODE=false)"
        echo "  - No automatic processing will occur"
    fi
    echo "========================================="
fi

echo ""
echo "Monitor logs:"
if [ "${ENABLE_CRON}" = "true" ]; then
    echo "  - Cron output: tail -f /var/log/cron.log"
fi
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
if [ "${ENABLE_FLASK_WORKER:-true}" = "true" ] && [ "${ENABLE_CRON}" = "true" ]; then
    # Tail both cron and Flask worker logs
    exec tail -f /var/log/cron.log /app/logs/flask_worker.log
elif [ "${ENABLE_FLASK_WORKER:-true}" = "true" ]; then
    # Tail just Flask worker log
    exec tail -f /app/logs/flask_worker.log
elif [ "${ENABLE_QUEUE_MODE}" = "true" ] && [ "${ENABLE_CRON}" = "true" ]; then
    # Tail both cron and queue worker logs
    exec tail -f /var/log/cron.log /app/logs/queue_worker.log
elif [ "${ENABLE_QUEUE_MODE}" = "true" ]; then
    # Tail just queue worker log
    exec tail -f /app/logs/queue_worker.log
elif [ "${ENABLE_CRON}" = "true" ]; then
    # Tail just cron log
    exec tail -f /var/log/cron.log
else
    # Neither enabled - just keep container alive
    echo "No active processes to monitor. Container will sleep indefinitely."
    exec sleep infinity
fi
