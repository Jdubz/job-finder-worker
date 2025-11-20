> Status: Active
> Owner: @jdubz
> Last Updated: 2025-11-19

# Production Migration Prep

_Last updated: November 19, 2025_

This document captures the groundwork for migrating Job Finder to a single-machine stack (API + worker + SQLite + Cloudflared) managed by Watchtower. It consolidates the schema plan, runtime configs, and secret-handling approach before code changes begin. All production services now run colocated on the host described below; there is no longer a NAS dependency or a staging environment.

## Environment + Branching Guardrails

- **Single prod env**: `job-finder-api.joshwentworth.com` is the only runtime surface. Firebase Hosting stays the frontend CDN but proxies API calls to this hostname.
- **Backwards compatibility**: Not required. We will attempt to capture as much Firestore data as possible before the cutover, but data loss is acceptable because the legacy app has no active users.
- **Deploy path**: Production deploys are pull-based. Watchtower (acting as the pull agent) monitors pinned tags and restarts containers when new images are pushed to the registry; no self-hosted GitHub runners or NAS-based workflows remain.
- **CI/CD separation**: GitHub Actions builds/pushes images only; everything else (env files, Docker lifecycle) is executed locally on the host with `docker compose -f infra/docker-compose.yml --env-file ../.env ...`. No `op run` wrapper is required once the secrets are written into `../.env`.
- **Monorepo**: `job-finder-worker` is the canonical public repository. All apps (`job-finder-BE`, `job-finder-FE`, worker, shared types, infra, docs) now live in this single repo with npm workspaces and Husky hooks enforcing lint/build gates on `staging` → `main` PRs.

## Host Inventory

- **OS / Kernel**: Ubuntu 24.04.3 LTS, kernel `6.14.0-35-generic` (`uname -a`).
- **CPU**: Intel i9-10900X, 10 cores / 20 threads @ 3.70 GHz boostable to 8.0 GHz (hyperthreading enabled).
- **Memory**: 62 GiB installed, ~53 GiB free under typical load (`free -h`).
- **Storage**: NVMe root (`/dev/nvme1n1p2`) 916 GB total with ~742 GB free (`df -h /`).
- **Implication**: Plenty of headroom to colocate Node API, Python worker, Cloudflared, Watchtower, and SQLite without resource contention; no staging partition is required.

## Repository & Shared Assets

- `job-finder-worker/` root now contains all apps plus shared code, infra, and docs. Git history from the former per-project repos has been consolidated into this public repo (staging → main workflow).
- Shared TypeScript definitions live under `shared/src` and are consumed via the `@shared/types` alias instead of an npm package. This keeps versioning in lockstep across API, worker, and frontend.
- Documentation from the legacy repos was migrated into `docs/` (plans, backend, frontend, worker). Future RFCs and migration notes should continue to land there for visibility.

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
| Firebase Auth users | `users` | Optional record of known admins for audit/logging. Stores a comma-separated `roles` field (defaults to `admin`). Preseeded rows exist for contact@joshwentworth.com and jess.castaldi@gmail.com. |

Key constraints:

- `PRAGMA foreign_keys=ON`, WAL mode, and `busy_timeout=5000` baked into the schema bootstrap.
- JSON columns are stored as TEXT (stringified JSON) to stay compatible with both `better-sqlite3` (backend) and `sqlite3` (worker).
- A helper view (`view_queue_ready`) mirrors the Firebase “pending queue” query to simplify worker polling.
- `users` table (optional) keeps metadata for approved admins + their comma-separated roles. GIS tokens are validated per request so no local sessions are stored.

### Data Migration Posture

- Snapshot existing Firestore collections via export scripts in `infra/sqlite/seeders/` prior to running `sqlite-migrator`. Keep dumps zipped with the migration runbook (no long-lived backup share).
- Snapshot existing Firestore collections via the `npm run --workspace infra/sqlite/seeders export:firestore` helper (source `../.env` or pass `--env-file ../.env` manually; no `op run` wrapper). Copy the JSON dumps from `infra/sqlite/seeders/output/` into the release artifacts folder before running `sqlite-migrator`.
- If any collection cannot be exported cleanly, proceed anyway—the system is effectively greenfield. The priority is to unblock new ingestion on SQLite, not to hold cutover for legacy gaps.
- Run sanity metrics (row counts, key checksums) but do not build bidirectional sync or compatibility layers.

## Compose Stack (prod)

File: `infra/docker-compose.yml`

- **api**: Runs `ghcr.io/jdubz/job-finder-api:latest` (future Node server). Shares `/srv/job-finder/data` for `jobfinder.db`. Depends on `sqlite-migrator` completion and exposes port 8080 internally; Cloudflared handles ingress.
- **worker**: Uses `ghcr.io/jdubz/job-finder-worker:latest` with queue + cron enabled. Reads `jobfinder.db` via the same bind mount; logs + configs remain on host under `/srv/job-finder/{logs,config,worker-data}`.
- **sqlite-migrator**: Short-lived container (same image as `api`) executing `node dist/scripts/migrate.js`, mounting `/srv/job-finder/sql/schema.sql`. This seeds/updates the DB before the long-lived services start.
- **cloudflared**: Consumes `infra/cloudflared/config.yml`, runs `tunnel ... run`, and forwards `job-finder-api.joshwentworth.com` to `api:8080`. Requires the tunnel creds JSON in `/srv/job-finder/cloudflared/${CLOUDFLARE_TUNNEL_ID}.json` plus env var injection via `../.env`.
- **watchtower**: Monitors all containers labelled `com.centurylinklabs.watchtower.enable=true`, polling every 5 minutes and only acting on the `latest` tags (per requirements). This replaces Portainer/self-hosted runners.

All three core services (API, worker, SQLite) now launch from this single compose file on the same host. Firebase Hosting remains external and simply points to the Cloudflared hostname.

**Host directories** (create before bringing the stack up):

```
/srv/job-finder/
  data/           # jobfinder.db + WAL files
  config/         # worker configs, env overlays
  logs/           # worker log exports
  worker-data/    # ad-hoc JSON/CSV outputs
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

## Authentication + Admin Access

- **Firebase Auth deprecation**: The Functions-based auth proxy and Firebase Auth SDK usage will be removed. The React frontend switches to Google Identity Services (GIS) OAuth and sends the resulting ID token to the Node API.
- **Admin roles**: The API derives authorization from the SQLite users table (seeded with contact@joshwentworth.com and jess.castaldi@gmail.com). Update roles via SQL migrations or ad-hoc statements—no environment-based allowlist is required once GIS tokens are verified.
- **Token verification**: The API verifies GIS tokens via Google’s JWKS endpoints. No Firebase project dependency remains besides the legacy storage bucket.
- **Session model**: Rely on GIS ID tokens + Google JWKS verification for every privileged request (optionally caching them for minutes in memory). No server-side session table is required; worker jobs still authenticate via service tokens stored in 1Password.
- **Frontend changes**: Replace Firebase Auth SDK imports with GIS script loader, update `shared/src/auth` helpers accordingly, and ensure Cloudflared exposes the `/auth/callback` route. Firebase Hosting remains the static hosting surface; only the API/worker stack moves off Firebase.
- **Secrets**: The Google OAuth client ID and AI provider keys live in the Job Finder development vault in 1Password while Cloudflare tunnel credentials remain on the host. There is no Firebase admin/service account dependency once GIS tokens + SQLite roles gate access.
- **Admin seed data**: The SQLite `users` table ships with rows for contact@joshwentworth.com and jess.castaldi@gmail.com (roles=admin). Update this list via SQL if new admins are added.

## Secrets & Env Strategy

- **Build/CI**: Most secrets already live in GitHub repo secrets. CI injects Google OAuth client IDs, Anthropic/OpenAI API keys, and the Cloudflare tunnel ID into API + worker builds when required.
- **Runtime**: `../.env` (one level above the monorepo) is still the canonical env file for the host. Compose services load it via `env_file`.
- **1Password**: Use the “Development” vault only as the source of truth. When values change, copy them into `/home/jdubz/Development/.env` (mirrored into `./.env`) and redeploy with `docker compose --env-file ../.env ...`. `op run` is no longer part of the deploy workflow.
- **Firebase artifacts**: Legacy service accounts stay archived solely for Firebase Hosting deploys. The gitignored `job-finder-FE/.firebase/serviceAccountKey.json` plus the `FIREBASE_SERVICE_ACCOUNT` CI secret cover that workflow; the runtime stack never stores or mounts `firebase-admin*.json`.

## Outstanding Items Before Cutover

1. **API refactor**: Build the Express/Fastify server plus migration runner referenced by `sqlite-migrator`.
2. **Worker SQLite adapters**: Implement read/write helpers referencing `/data/sqlite/jobfinder.db` and retire Firestore clients.
3. **Frontend networking**: Update FE envs (Firebase Hosting config) to use `https://job-finder-api.joshwentworth.com` for all API calls.
4. **Validation on deploys**: Every rollout must use the Watchtower pull model (CI builds/pushes images, the host pulls them) and follow the MIG-005 checklist: `docker compose ... ps`, Cloudflared log tail, GIS health probe, and `sqlite3 ... "pragma integrity_check;"`. Manual “docker run” or ad-hoc pushes are not allowed because the new architecture can only be updated safely via the label-gated Watchtower flow.
5. **Cutover checklist**: Document smoke tests + rollback (point DNS back to Firebase Functions) for go-live day.
6. **Auth swap**: Remove Firebase Auth clients, plumb GIS token verification, and wire the API to read roles from the SQLite users table instead of an env-based allowlist.
7. **Husky hooks**: Modernize hook scripts (drop `_/.husky.sh`) and ensure they lint/build all workspaces before PRs merge.
