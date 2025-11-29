#!/bin/bash
# Helper script to manually trigger job search in production container
# Usage: docker exec job-finder-staging /app/docker/run-now.sh

echo "========================================"
echo "Manually Triggering Job Search"
echo "========================================"
echo "Started at: $(date)"
echo ""

# Run the scheduler (same entrypoint cron uses)
cd /app
/usr/sbin/gosu node /home/node/.local/bin/python -m job_finder.cron.submit_scrape

echo ""
echo "========================================"
echo "Job Search Completed"
echo "Finished at: $(date)"
echo "========================================"
