# Job Finder Worker – Production Testing Guide

This doc summarizes how the Python worker is wired, how to run it safely against production data, and how to manage credentials/config.

## Runtime Architecture (current)
- **Process:** Single-threaded Flask worker (`src/job_finder/flask_worker.py`) with a poll loop reading the SQLite-backed `job_queue` table.
- **Storage:** SQLite DB shared with the rest of the stack (prod path expected at `/srv/job-finder/jobfinder.db`). Access is via `JobStorage`, `CompaniesManager`, and `JobSourcesManager`.
- **Queue:** `QueueItemProcessor` routes items by type (JOB, COMPANY, SCRAPE, SOURCE_DISCOVERY, SCRAPE_SOURCE) and updates item status + pipeline stages in SQLite.
- **AI matching:** `AIJobMatcher` with provider/model + thresholds loaded from `job_finder_config` (`ai-settings`). Defaults are Claude Sonnet 4, min score 70, intake generation on.
- **Config source of truth:** `job_finder_config` table (stop list, filters, AI, scheduler). YAML config file is optional and rarely used.
- **Logging:** Structured logs to `logs/worker.log` by default (rotate externally).

## Prod Data Smoke-Test Checklist
1) **Secrets**
   - Fetch from 1Password (personal vault):
     - `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY` if switching providers)
     - Google service account JSON used for scraping or API access (referenced in `Development/.env`). Export its path as `GOOGLE_APPLICATION_CREDENTIALS` if needed.
   - Load into the environment of the worker host (systemd unit or shell). Do *not* commit secrets.

2) **Database**
   - Set `JF_SQLITE_DB_PATH=/srv/job-finder/jobfinder.db` (already defaulted in `run_prod.sh`). Ensure the file is present and writable by the worker user.
   - Optional: work from a copy for dry-runs (`cp /srv/job-finder/jobfinder.db /srv/job-finder/jobfinder-canary.db` and point the env var to it).

3) **Start the worker (manual mode)**
   ```bash
   cd job-finder-worker
   source venv/bin/activate  # after pip install -r requirements.txt
   ./run_prod.sh
   # health check
   curl -s http://localhost:5555/health
   ```
   The worker will only process what is already in `job_queue`. To avoid auto-scheduling, do not enqueue SCRAPE items via any scheduler yet.

4) **Manual scrape trigger (limited targets)**
   - Insert specific SCRAPE/SCRAPE_SOURCE items or call:
     ```bash
     python run_job_search_unified.py --max-sources 3 --target-matches 5 --source-ids <uuid,...>
     ```
   - Keep `max-sources` and `target-matches` small for initial prod runs.

5) **Observe & verify**
   - Tail `logs/worker.log`.
   - Inspect queue counts: `sqlite3 $JF_SQLITE_DB_PATH 'select status, count(*) from job_queue group by 1;'`.
   - Spot-check `job_matches` for duplicates and match scores.

## Secrets Handling (1Password -> host env)
- Sign in to 1Password CLI: `op signin` (requires your device auth).
- Export keys to the shell (example):
  ```bash
  export ANTHROPIC_API_KEY=$(op read op://Personal/job-finder-worker/ANTHROPIC_API_KEY)
  export GOOGLE_APPLICATION_CREDENTIALS=/srv/job-finder/gcp-sa.json
  op read op://Personal/job-finder-worker/gcp-sa.json > $GOOGLE_APPLICATION_CREDENTIALS
  chmod 600 $GOOGLE_APPLICATION_CREDENTIALS
  ```
- For production services, prefer storing these in the host’s secrets store or systemd unit env file instead of `.env` files.

## Source Config JSON (schema proposal)
`job_sources.config_json` should carry scraper hints captured during discovery. Proposed shape:
```json
{
  "entry": {
    "type": "greenhouse|rss|lever|workday|custom",
    "url": "https://boards.greenhouse.io/example",
    "board_token": "example",                // greenhouse
    "rss": { "url": "https://.../feed" },   // rss
    "pagination": { "param": "page", "start": 1, "limit": 5 }
  },
  "parsing": {
    "list_selector": "div.opening a",
    "title_selector": "h1",
    "location_selector": "span.location",
    "description_selector": "div.description",
    "custom_fields": { "employmentType": "#type" }
  },
  "filters": {
    "include_keywords": ["engineer", "remote"],
    "exclude_keywords": ["senior"],
    "locations_whitelist": ["Remote", "Portland"],
    "min_salary": 120000
  },
  "dedupe": { "keys": ["url", "title", "location"], "hash_body": true },
  "auth": { "type": "none|cookie|header", "value": "" },
  "notes": "Found via discovery; needs human validation"
}
```
These fields are backward-compatible (unknown keys are ignored by current scrapers). Agents should populate at least `entry.type`, `entry.url`, and any selectors/pagination required.

## Safety Guardrails
- `run_prod.sh` now hard-requires `JF_SQLITE_DB_PATH` to exist and an AI key to be present before starting.
- Avoid multiple worker processes on the same SQLite file to prevent lock contention.
- No automatic scrape scheduling is enabled; only enqueue SCRAPE/SCRAPE_SOURCE manually during testing.

## Next Steps (recommended)
- Add logrotate config for `logs/worker.log` (daily, keep 7, compress).
- Wire up acceptance tests that run against a prod-DB copy with read-only mode.
- Implement scraper selection logic that consumes the proposed `config_json` schema and adds coverage for Lever/Workday.
