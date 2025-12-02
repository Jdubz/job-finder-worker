#!/bin/bash
# Helper script to manually trigger job search in production container
# Usage: docker exec job-finder-staging /app/docker/run-now.sh

echo "========================================"
echo "Manual Scrape Trigger (deprecated)"
echo "========================================"
echo "Started at: $(date)"
echo ""
echo "Cron-based scheduling now lives in the API container."
echo "Submit a scrape via API: POST /api/queue/scrape"
echo "See API container logs for status."
echo ""
echo "Finished at: $(date)"
echo "========================================"
