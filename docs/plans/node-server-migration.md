> Status: Active
> Owner: @jdubz
> Last Updated: 2025-11-19

# Node Server Migration Plan (Job Finder BE)

_Last updated: November 19, 2025_

## 1. Context & Goals
- Backend currently runs on Firebase Cloud Functions; persistence is moving to SQLite (see companion plan).
- Goal: host the API as a Node 20 server on the same physical machine that now runs the worker and SQLite, dropping Firebase Auth/App Check entirely in favor of Google Sign-In plus role checks sourced from the SQLite users table (no environment-based allowlist).
- Consolidate the four codebases (API, worker, frontend, shared types) into a single monorepo so schema/type changes, Docker builds, and deploys happen atomically.
- Staging environment is being removed; production will be the sole long-lived deployment and must support safe rollout tactics (feature flags, canaries). Backward compatibility with the non-functional Firebase app is not required—treat this as a greenfield deployment while opportunistically importing any data we can salvage.
- Requirements are light: handful of trusted users, so a single containerized Node server with SQLite is sufficient.

## 2. Target Architecture
- **Runtime**: Express (or Fastify) app running in a Node 20 container built from the existing codebase, orchestrated via a single host-managed `docker-compose.yml` that also defines SQLite and the worker.
- **Database**: SQLite `.db` file on a host bind mount (e.g., `/srv/job-finder/data/jobfinder.db`) shared across containers via Compose volumes; helper module `src/config/sqlite.ts` opens the file.
- **Auth**: Transition off Firebase Auth entirely—use Google Sign-In on the frontend and enforce authorization by reading roles from the SQLite users table. The backend validates Google ID tokens directly (no Firebase project) and refuses requests from accounts that lack the admin role. App Check is no longer required once Firebase Auth is removed.
- **Networking**: A Cloudflared tunnel terminates TLS for `job-finder-api.joshwentworth.com` (fronted by Firebase Hosting custom domain) and routes traffic to the local Compose network (`api` service). Internal `docker-compose` networking connects API + worker without NAS or Portainer.
- **Operations**: Watchtower (already in use on the host) tracks the `latest` tags for each container, pulls new images, and restarts the Compose-managed services—no self-hosted runners or NAS Portainer.
- **Secrets**: Runtime secrets (AI keys, Google OAuth client IDs, Cloudflare tunnel token) come from GitHub repo secrets during builds; the host keeps a single `../.env` file with values copied from the 1Password “Development” vault. Operators edit that file directly (no `op run` wrapper) and point Compose at it with `--env-file ../.env`. Firebase service-account JSON files are only needed for Firebase Hosting deploys (gitignored at `job-finder-FE/.firebase/serviceAccountKey.json` and mirrored into the `FIREBASE_SERVICE_ACCOUNT` CI secret); the Node stack never mounts them.
- **Logging/Monitoring**: Not prioritized for this phase; rely on container stdout/stderr for ad-hoc troubleshooting.

## 3. Migration Phases
### Phase 0 – Preparation
1. Catalog all exported Cloud Functions (currently `manageGenerator` plus future routes) and confirm there are no background triggers to port.
2. Decide directory layout inside the monorepo: keep `/server`, `/worker`, `/frontend`, and `/shared-types` as workspaces with shared tooling (ESLint, TS config, scripts) so CI can test/build everything together.
3. Secure GIS client IDs, Cloudflare tunnel credentials, and AI keys via GitHub repo secrets/1Password. Firebase admin/App Check assets are no longer required once GIS tokens plus SQLite roles gate access.

### Phase 1 – Code Restructure
1. Extract shared business logic (services, middleware, utils, types) into a backend core module so both Firebase Functions and the new server can run temporarily (if needed during overlap).
2. Build Express routing mirroring existing endpoints from `generator.ts` (generator flow, personal info CRUD, job match updates, content items, job queue endpoints, health route). Each handler should call the same services that now talk to SQLite.
3. Integrate middleware stack: request ID injection, CORS, rate limiters, Google ID token verification backed by the SQLite users table, logging.
4. Implement error handling consistent with current response helpers (`utils/response-helpers.ts`).

### Phase 2 – SQLite Integration
1. Implement SQLite helper (connection pooling via `better-sqlite3` or `sqlite3` with serialized access). Configure WAL mode and busy timeout at startup.
2. Update domain services to depend on the new SQLite stores (from the persistence plan). Ensure they can be injected into Express routes.
3. Add automated migrations (versioned SQL files + runner command). On server boot, run migrations before accepting traffic.
4. Write integration tests (Jest + Supertest) hitting the Express app with an in-memory SQLite DB to ensure parity with prior Firestore behavior.

### Phase 3 – Infrastructure & Deployment
1. Create Dockerfile for the Node server (multi-stage build: install, build TS, run `node dist/server.js`).
2. Author a single root-level `docker-compose.yml` (or `compose.prod.yml`) in the monorepo that defines:
   - `api`: Node server container, depends_on `sqlite-migrator`, mounts shared volume + secrets, exposes port 8080 internally.
   - `worker`: Python worker container built from `job-finder-worker`, shares SQLite volume and env.
   - `cloudflared`: official Cloudflare tunnel container with credentials file, forwarding `https://api.jobfinder.example` to `api:8080`.
   - `sqlite-migrator`: short-lived container that runs migrations before the API/worker start.
   Compose file should live alongside infra docs and be source-controlled so Watchtower-managed containers can be recreated deterministically with `docker compose up -d` when needed.
3. Add (or reuse) a Watchtower container within the Compose stack that:
   - Monitors the `api`, `worker`, and `cloudflared` containers for new `latest` tags in the configured registry.
   - Pulls updated images and gracefully restarts dependent services with the shared volumes mounted.
   - Writes lifecycle events to stdout for quick review (no external monitoring needed).
4. Configure Cloudflared: create tunnel, store credentials file under `/srv/job-finder/cloudflared`, define ingress rules mapping `api.jobfinder.com` to `http://api:8080`, and connect Firebase Hosting custom domain to Cloudflare DNS.
5. Update CI to build/publish both API and worker images to a registry accessible from the Watchtower host (GitHub Container Registry or Docker Hub). Tag releases so Watchtower knows when to pull.

### Phase 4 – Cutover
1. Launch the Compose stack on the production host behind Cloudflared, but keep Firebase Functions as a dark fallback for 24-48 hours. Run smoke tests via the tunnel endpoint.
2. Update production frontend environment variables (Firebase Hosting configs) and worker configs to call the Cloudflared URL. Since staging is removed, rely on feature flags and canary users for final validation.
3. Monitor host metrics (CPU, disk IO for SQLite), tail Cloudflared logs, and watch Watchtower/container logs for the first week; adjust resource limits if necessary.

### Phase 5 – Cleanup
1. After stable period, remove Firebase deployment scripts/emulator configs entirely (Firebase is no longer used for Auth/App Check/Storage).
2. Archive Firestore indexes/rules as reference, but strip them from CI.
3. Update documentation (README, OPS guides) to describe the single-machine Compose stack, Watchtower workflow, and Cloudflared routing.

## 4. Risk Mitigation
- **Cold starts**: Non-issue, since the container stays warm; still, keep the process manager (e.g., node-respawn) simple.
- **SQLite concurrency**: use WAL mode + busy timeout; queue high-write operations (job queue updates) within transactions to maintain integrity.
- **Auth parity**: write integration tests using GIS ID tokens to ensure role lookups from the users table work as expected and that non-admin accounts are rejected.
- **Rollback**: maintain Firebase Functions deployment for at least one release cycle; DNS/env flip can revert traffic quickly if issues appear.

## 5. Success Criteria
- Express server serves all legacy endpoints with passing integration tests.
- Frontend & worker configs reference the Cloudflared endpoint for the local API; Firestore SDK removed from FE bundle.
- SQLite `.db` file becomes the single source of truth, kept on the host data volume and validated via Watchtower-led deploy checks (no separate backup workflow).
- Firebase Functions decommissioned without impacting the handful of users.
