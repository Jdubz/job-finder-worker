> Status: Active
> Owner: @jdubz
> Last Updated: 2025-12-04

# API Scheduler (cron replacement)

## What changed
- All scheduled jobs now run inside the API process via a minute-aligned loop (no OS cron, no `node-cron`).
- Timezone is fixed to `America/Los_Angeles` in the API container; job hours are interpreted in that zone.
- Schedules and last-run timestamps live in the `job_finder_config` table under `cron-config`.

## Managed jobs
- `scrape`: enqueues scrape jobs using `worker-settings.runtime.scrapeConfig`.
- `maintenance`: POSTs to `WORKER_MAINTENANCE_URL`.
- `logrotate`: rotates and gzips API logs under `LOG_DIR`.

## Configuration
- Shape stored in `cron-config`:
  ```json
  {
    "jobs": {
      "scrape": { "enabled": true, "hours": [0,6,12,18], "lastRun": "..." },
      "maintenance": { "enabled": true, "hours": [0], "lastRun": "..." },
      "logrotate": { "enabled": true, "hours": [0], "lastRun": "..." }
    }
  }
  ```
- Edit via System Health → Cron Scheduler card (enable/disable, hours list, Run Now, see last run).
- Manual triggers remain at `/api/queue/cron/trigger/{scrape|maintenance|logrotate}` (admin-auth).

## Behavior
- Loop runs only when `NODE_ENV=production`.
- Checks every minute; runs a job once per listed hour, no backfill.
- On restart, uses `lastRun` to avoid re-running within the same hour.

## Deployment notes
- Ensure API container `TZ=America/Los_Angeles` (set in Dockerfile and compose templates).
- No host cron entries are required for application scheduling.
