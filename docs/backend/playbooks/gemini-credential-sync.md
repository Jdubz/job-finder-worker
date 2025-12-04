> Status: Active
> Owner: @jdubz
> Last Updated: 2025-12-04

# Gemini credential sync (host → seed)

The production containers seed `~/.gemini` from `/srv/job-finder/gemini-seed/.gemini` on first boot, then store refreshed tokens in the named volumes `gemini-home-api` and `gemini-home-worker`. If those seeds get stale, the health page will show `gemini: CLI health check timed out` because `gemini auth status` prompts for login inside the container.

## How to sync

```bash
# from repo root on the host
./scripts/sync_gemini_credentials.sh
```

What it does:
- Copies only `~/.gemini/oauth_creds.json` into `/srv/job-finder/gemini/.gemini` and `/srv/job-finder/gemini-seed/.gemini` with locked-down permissions (0700 dir, 0600 file).
- Seeds are picked up automatically by the API/worker entrypoints if the live volume is empty.
- Containers will continue to refresh tokens in their volumes once the seed is valid.

## Automation option (cron)

Add a cron entry on the host (runs daily at 07:10):

```cron
10 7 * * * /path/to/job-finder-bot/scripts/sync_gemini_credentials.sh >> /var/log/gemini-sync.log 2>&1
```

Adjust the path/time as needed.

## Why this matters

The Gemini CLI opens a browser flow when tokens expire. Running `gemini auth login` on the host and mirroring `oauth_creds.json` into the seeds/volumes keeps the containers authenticated so `/cli/health` stays green.
