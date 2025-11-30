#!/bin/bash
# Production runner for Flask Job Queue Worker
set -e

echo "🚀 Starting Job Queue Worker (Production Mode)"
echo "==============================================="

# Change to script directory
cd "$(dirname "$0")"

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "❌ Virtual environment not found!"
    echo "   Please run: python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt"
    exit 1
fi

# Activate virtual environment
source venv/bin/activate

# Set production environment variables
export FLASK_ENV=production
export WORKER_PORT=${WORKER_PORT:-5555}
export WORKER_HOST=${WORKER_HOST:-0.0.0.0}
export QUEUE_WORKER_LOG_FILE=${QUEUE_WORKER_LOG_FILE:-logs/worker.log}
export PYTHONPATH="${PWD}/src:${PYTHONPATH}"

# Force the worker to use the production SQLite db unless explicitly overridden
export SQLITE_DB_PATH=${SQLITE_DB_PATH:-/srv/job-finder/jobfinder.db}
if [ ! -f "$SQLITE_DB_PATH" ]; then
  echo "❌ SQLITE_DB_PATH ($SQLITE_DB_PATH) not found. Point to the prod db before starting." >&2
  exit 1
fi

# Require at least one AI provider key in the environment
if [ -z "${ANTHROPIC_API_KEY:-}" ] && [ -z "${OPENAI_API_KEY:-}" ]; then
  echo "❌ Missing AI provider key: set ANTHROPIC_API_KEY or OPENAI_API_KEY (fetch from 1Password)." >&2
  exit 1
fi

# Create logs directory
mkdir -p logs

echo "📋 Configuration:"
echo "   Environment: PRODUCTION"
echo "   Port: $WORKER_PORT"
echo "   Host: $WORKER_HOST"
echo "   Log File: $QUEUE_WORKER_LOG_FILE"
echo ""

# Start the Flask worker with production settings
echo "🔄 Starting worker..."
exec python3 -m job_finder.flask_worker
