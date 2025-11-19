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
- ✅ Auth swap completed: GIS-based login verified by at least two allowlisted admins.
- ✅ Rollback path documented (section 4).

## 2. Day-of Steps
1. **Freeze**: Pause deploys to `main`. Announce cutover window in #job-finder.
2. **Final backup**: Run the `.backup` command from `sqlite-backup-runbook.md` and sync to B2.
3. **Flip traffic**:
   - Update Firebase Hosting rewrite (if needed) so FE API calls target the Cloudflared hostname.
   - Update worker env and restart container via Compose: `docker compose ... restart worker`.
4. **Enable read-only Firestore**: Push updated security rules to block writes while keeping reads for emergency fallback.
5. **Smoke tests**:
   - Frontend loads dashboard and job queue views.
   - Worker dequeues and completes a job.
   - Manual admin task (create/edit content item) persists in SQLite.
6. **Monitoring window**: 2 hours of elevated watch on Watchtower + Cloudflared logs, plus `sqlite3` checksum.

## 3. Post-Cutover (T+24h)
- Confirm no writes hit Firestore (use GCP metrics).
- Archive final Firestore export to B2 `firestore-archive/`.
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
