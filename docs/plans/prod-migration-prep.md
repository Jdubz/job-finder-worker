# Production Migration Prep

_Last updated: November 17, 2025_

This document captures the groundwork for migrating Job Finder to a single-machine stack (API + worker + SQLite + Cloudflared) managed by Watchtower. It consolidates the schema plan, runtime configs, and secret-handling approach before code changes begin.

## Host Inventory

- **OS / Kernel**: Ubuntu 24.04.3 LTS, kernel `6.14.0-35-generic` (`uname -a`).
- **CPU**: Intel i9-10900X, 10 cores / 20 threads @ 3.70 GHz boostable to 8.0 GHz (hyperthreading enabled).
- **Memory**: 62 GiB installed, ~53 GiB free under typical load (`free -h`).
- **Storage**: NVMe root (`/dev/nvme1n1p2`) 916 GB total with ~742 GB free (`df -h /`).
- **Implication**: Plenty of headroom to colocate Node API, Python worker, Cloudflared, Watchtower, and SQLite without resource contention; no staging partition is required.

## Firestore → SQLite Mapping

The new schema lives in `infra/sqlite/schema.sql`. Highlights:

| Firestore Collection | SQLite Table | Notes |
| --- | --- | --- |
| `content-items` | `content_items` | Stores normalized metadata per row plus `body_json` for type-specific payloads. Hierarchies maintained via `parent_id`. |
| `experience-entries`, `experience-blurbs` | `experience_entries`, `experience_blurbs` | Preserved for worker backfills even though the FE now favors `content-items`. |
| `companies` | `companies` | Adds `name_lower` unique index and keeps scoring/tier fields. |
| `job-queue` | `job_queue` | Enforces status/type enums, unique URL constraint, and metadata JSON column for worker payloads. |
| `job-matches` | `job_matches` | Includes `resume_intake_json` (single ATS keyword source), plus indexes on company + priority. |
| `generator-documents` | `generator_documents` | Generic `payload_json` keyed by `document_type` (requests, responses, personal info, templates). |
| `job-finder-config` | `job_finder_config` | Stores doc ID + JSON blob (stop-list, queue settings, AI config, etc.). |
| `job-sources` | `job_sources` | Tracks source config/status/metrics with indexes on status + company linkage. |
| `contact-submissions` | `contact_submissions` | Persists contact form pipeline metadata/transactions for the API. |

Key constraints:

- `PRAGMA foreign_keys=ON`, WAL mode, and `busy_timeout=5000` baked into the schema bootstrap.
- JSON columns are stored as TEXT (stringified JSON) to stay compatible with both `better-sqlite3` (backend) and `sqlite3` (worker).
- A helper view (`view_queue_ready`) mirrors the Firebase “pending queue” query to simplify worker polling.

## Compose Stack (prod)

File: `infra/docker-compose.yml`

- **api**: Runs `ghcr.io/jdubz/job-finder-api:latest` (future Node server). Shares `/srv/job-finder/data` for `jobfinder.db`, `/srv/job-finder/backups` for `.backup` exports, and mounts `firebase-admin.json` from `/srv/job-finder/secrets`. Depends on `sqlite-migrator` completion. Exposes port 8080 internally; Cloudflared handles ingress.
- **worker**: Uses `ghcr.io/jdubz/job-finder-worker:latest` with queue + cron enabled. Reads `jobfinder.db` via the same bind mount and reuses the Firebase service account. Logs + configs remain on host under `/srv/job-finder/{logs,config,worker-data}`.
- **sqlite-migrator**: Short-lived container (same image as `api`) executing `node dist/scripts/migrate.js`, mounting `/srv/job-finder/sql/schema.sql`. This seeds/updates the DB before the long-lived services start.
- **cloudflared**: Consumes `infra/cloudflared/config.yml`, runs `tunnel ... run`, and forwards `job-finder-api.joshwentworth.com` to `api:8080`. Requires the tunnel creds JSON in `/srv/job-finder/cloudflared/${CLOUDFLARE_TUNNEL_ID}.json` plus env var injection via `../.env`.
- **watchtower**: Monitors all containers labelled `com.centurylinklabs.watchtower.enable=true`, polling every 5 minutes and only acting on the `latest` tags (per requirements). This replaces Portainer/self-hosted runners.

**Host directories** (create before bringing the stack up):

```
/srv/job-finder/
  data/           # jobfinder.db + WAL files
  backups/        # sqlite .backup outputs synced off-site
  config/         # worker configs, env overlays
  logs/           # worker log exports
  worker-data/    # ad-hoc JSON/CSV outputs
  secrets/
    firebase-admin.json
  cloudflared/
    config.yml (symlink/copy from infra/cloudflared)
    <tunnel-id>.json
  sql/
    schema.sql (copy of infra/sqlite/schema.sql for runtime migrations)
```

## Cloudflared + DNS

- Template at `infra/cloudflared/config.yml` targets `job-finder-api.joshwentworth.com` → `http://api:8080`.
- Use a named tunnel with ID stored in `.env` (`CLOUDFLARE_TUNNEL_ID`) and drop the credentials JSON into `/srv/job-finder/cloudflared/<ID>.json`.
- Firebase Hosting stays the frontend CDN; just add a Cloudflare CNAME for `job-finder-api.joshwentworth.com` that points to the tunnel endpoint, then configure FE API calls to hit that hostname.

## Secrets & Env Strategy

- **Build/CI**: Most secrets already live in GitHub repo secrets. CI should inject them into Docker builds for the API + worker images (e.g., `FIREBASE_PROJECT_ID`, `MAILGUN_API_KEY`).
- **Runtime**: `../.env` (one level above the monorepo) is still the canonical env file for the host. Compose services load it via `env_file`.
- **1Password**: Any secrets that must stay off GitHub (service account JSON, Mailgun prod key, API creds) are fetched during deployment with `op run --env-file ../.env -- docker compose ...` or `op read > /srv/job-finder/secrets/firebase-admin.json`. This keeps long-lived keys out of the repo.

## Outstanding Items Before Cutover

1. **API refactor**: Build the Express/Fastify server plus migration runner referenced by `sqlite-migrator`.
2. **Worker SQLite adapters**: Implement read/write helpers referencing `/data/sqlite/jobfinder.db` and retire Firestore clients.
3. **Frontend networking**: Update FE envs (Firebase Hosting config) to use `https://job-finder-api.joshwentworth.com` for all API calls.
4. **Automated backups**: Add a cron/systemd timer on the host that runs `sqlite3 jobfinder.db ".backup /srv/job-finder/backups/jobfinder-$(date +%F).db"` followed by the remote sync (e.g., `rclone` to Backblaze/S3).
5. **Cutover checklist**: Document smoke tests + rollback (point DNS back to Firebase Functions) for go-live day.
