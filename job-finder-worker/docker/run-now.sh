#!/bin/bash
# Helper script to manually trigger job search in production container
# Usage: docker exec job-finder-staging /app/docker/run-now.sh

echo "========================================"
echo "Manually Triggering Job Search"
echo "========================================"
echo "Started at: $(date)"
echo ""

# Run the scheduler - cron-submit-scrape.sh handles environment loading internally
cd /app
/usr/sbin/gosu node /app/docker/cron-submit-scrape.sh

echo ""
echo "========================================"
echo "Job Search Completed"
echo "Finished at: $(date)"
echo "========================================"
