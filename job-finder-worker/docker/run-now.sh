#!/bin/bash
# Helper script to manually trigger job search in production container
# Usage: docker exec job-finder-staging /app/docker/run-now.sh

echo "========================================"
echo "Manually Triggering Job Search"
echo "========================================"
echo "Started at: $(date)"
echo ""

# Source environment variables (needed when run from cron or minimal shell)
if [ -f /etc/environment ]; then
    set -a
    . /etc/environment
    set +a
fi

# Run the scheduler (same entrypoint cron uses)
cd /app
/usr/sbin/gosu node /app/docker/cron-submit-scrape.sh

echo ""
echo "========================================"
echo "Job Search Completed"
echo "Finished at: $(date)"
echo "========================================"
