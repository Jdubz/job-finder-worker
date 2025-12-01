#!/bin/bash
set -euo pipefail

# Ensure cron jobs get the same environment as the container
if [ -f /etc/environment ]; then
    set -a
    # shellcheck source=/etc/environment  # tell shellcheck not to follow this file during analysis
    . /etc/environment
    set +a
fi

# Defensive defaults so the cron run still works if env injection ever breaks
export ENVIRONMENT=${ENVIRONMENT:-production}
export SQLITE_DB_PATH=${SQLITE_DB_PATH:-/data/sqlite/jobfinder.db}
export PYTHONPATH=${PYTHONPATH:-/app/src:/app}
export PATH=${PATH:-/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin}

cd /app

exec /usr/local/bin/python -m job_finder.cron.submit_scrape "$@"
