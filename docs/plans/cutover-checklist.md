> Status: Draft
> Owner: @migration-team
> Last Updated: 2025-11-19

# Production Cutover Checklist

_Last updated: November 19, 2025_

This document implements MIG-007. It enumerates the steps required to transition traffic from Firebase Functions/Firestore to the new Node API + SQLite stack fronted by Cloudflared.

## 1. Preconditions (T‑7 days)
- ✅ MIG-005 (deploy hardening) signed off; host directories + Compose stack verified per `deploy-hardening.md`.
- ✅ Frontend `.env.production` references `https://job-finder-api.joshwentworth.com` and is deployed to Firebase Hosting staging preview.
- ✅ Worker config file under `/srv/job-finder/config/config.production.yaml` points at the Cloudflared URL.
- ✅ Auth swap completed: GIS-based login verified by at least two admins present in the SQLite `users.roles` table.
- ✅ Rollback path documented (section 4).

## 2. Day-of Steps
1. **Freeze**: Pause deploys to `main`. Announce cutover window in #job-finder.
2. **Flip traffic**:
   - Update Firebase Hosting rewrite (if needed) so FE API calls target the Cloudflared hostname.
   - Update worker env and restart container via Compose: `docker compose ... restart worker`. Rely on Watchtower for new images; use the manual restart only if config files under `/srv/job-finder/config` changed.
3. **Enable read-only Firestore**: Push updated security rules to block writes while keeping reads for emergency fallback.
4. **Smoke tests**:
   - Frontend loads dashboard and job queue views.
   - Worker dequeues and completes a job.
   - Manual admin task (create/edit content item) persists in SQLite.
5. **Monitoring window**: 2 hours of elevated watch on Watchtower + Cloudflared logs, plus `sqlite3` checksum.

## 3. Post-Cutover (T+24h)
- Confirm no writes hit Firestore (use GCP metrics).
- Update README + user docs to reference the new API URL only.
- Schedule MIG-008 cleanup (Firebase assets) no sooner than 7 days after stable cutover.

## 4. Rollback Plan
1. Re-enable Firebase Functions by restoring the previous Hosting rewrite and worker configs.
2. Switch Firestore security rules back to read/write for admins.
3. Run `firebase deploy --only functions,hosting` from the legacy repo snapshot if needed (documentation in `docs/archive/`).
4. Keep the SQLite instance intact; if rollback happened due to data issues, capture the failing queries and investigate offline before retrying cutover.

## 5. Sign-off Template
- **Approver**: @jdubz (platform)
- **Observers**: @frontend, @worker
- **Window**: YYYY-MM-DD HH:MM–HH:MM PT
- **Checklist owner**: Person running through section 2 must check off each step in the shared doc and paste results in #job-finder.

## 6. Execution Prep – November 19, 2025
- **Tentative window**: 2025-12-02 10:00–12:00 PT. @jdubz will run the checklist, @frontend + @worker remain on-call in #job-finder. Adjust if MIG-005 slips beyond 2025-11-26.
- **Watchtower validation**:
  ```bash
  docker compose -f infra/docker-compose.yml --env-file ../.env ps
  docker logs -f job-finder-watchtower
  ```
  Confirm Watchtower polled for new `ghcr.io/jdubz/job-finder-{api,worker}:latest` digests and restarted the services before continuing.
- **Hosting rewrite + worker restart**:
  ```bash
  # 1) Update firebase.json rewrite target to https://job-finder-api.joshwentworth.com
  firebase deploy --only hosting --project job-finder
  docker compose -f infra/docker-compose.yml --env-file ../.env restart worker
  ```
- **Firestore read-only rules push**:
  ```bash
  firebase deploy --only firestore:rules --project job-finder
  ```
- **Smoke test helpers**:
  ```bash
  curl -H "Authorization: Bearer ${GIS_TOKEN}" https://job-finder-api.joshwentworth.com/health
  python job-finder-worker/scripts/queue/submit_test_job.py --config /srv/job-finder/config/config.production.yaml
  ```
- **Open blockers**:
  1. Push the rebuilt worker image (config-path + SQLite env detection) to GHCR so Watchtower can pick it up; local Compose verified the fix on 2025-11-19 21:10 UTC.
