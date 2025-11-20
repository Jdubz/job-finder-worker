> Status: Draft
> Owner: @backend
> Last Updated: 2025-11-19

# Firebase Decommissioning Plan

_Last updated: November 19, 2025_

This plan covers MIG-008: removing residual Firebase dependencies once the Cloudflared + SQLite stack has been stable for at least one week.

## 1. Scope
- Firebase Hosting stays for static assets; everything else (Functions, Firestore, Auth, App Check, emulator configs) should be archived and removed from CI.
- The repo must retain historical references (docs, exports) but no longer ship deploy scripts or service account files for Firebase runtime workloads.

## 2. Cleanup Tasks
1. **Functions**
   - Delete the Cloud Functions project resources via `firebase functions:delete --force`.
   - Remove `functions/` directories, npm scripts, and CI jobs referencing Firebase deployments.
2. **Firestore**
   - Export final collections for archival (`gcloud firestore export gs://jobfinder-archive/...`).
   - Delete composite indexes + security rules from the repo.
3. **Auth/App Check**
   - Remove Firebase Auth client SDK imports from all FE bundles (should already be replaced by GIS).
   - Delete App Check configuration and service tokens from `.env` + 1Password vault once confirmed unused.
4. **Emulator/Tooling**
   - Remove `.firebaserc`, `firebase.json`, emulator configs, and associated npm scripts.
   - Update documentation to reference the SQLite development workflow instead of `firebase emulators:start`.
5. **Secrets**
   - Ensure Firebase service accounts live only in GitHub/1Password for hosting deploys. The lone checked-out copy should be the gitignored `job-finder-FE/.firebase/serviceAccountKey.json`, which the Firebase CLI consumes for Hosting deploys. Remove any host-mounted copies (`/srv/job-finder/secrets/*`) and document where the archival JSON files live in the shared vault; the Node API/worker never mount these files.

## Inventory – November 19, 2025
- **Repo configs**: Firebase Hosting still relies on `job-finder-FE/firebase.json` + `.firebaserc` (and the gitignored `.firebase/serviceAccountKey.json`). All other Firebase configs have been removed.
- **Functions**: ✅ `job-finder-BE/functions/` and all related deploy scripts/rules have been deleted; backend now only ships the Express API (`server/`).
- **Runtime adapters**: ✅ `job-finder-BE/server/src/config/firebase.ts` + `server/src/middleware/app-check.ts` were removed with the auth swap. `firebase-auth.ts` now validates GIS tokens + SQLite roles.
- **Frontend remnants**: `job-finder-FE/src/config/firebase.ts` is still present for Firebase Hosting auth/App Check; plan to remove once GIS-only auth lands on the FE.
- **Worker artifacts**: ✅ `job-finder-worker/firebase.json` removed; `.firebase/static-sites-257923-firebase-adminsdk.json` remains gitignored on the FE only.
- **Emulator data**: Remove `job-finder-BE/.firebase/emulator-data/firebase-export-metadata.json` and any other emulator outputs once Firestore read-only fallback is retired.

## 3. Acceptance Criteria
- CI no longer installs Firebase CLI or runs `firebase deploy`.
- `git grep firebase` only returns references in historical docs/archive directories.
- Watchtower/Compose remains the single deployment mechanism.
- An ops note confirming the deletion of the Firebase project is stored in `docs/archive/2025-11/`.

## Progress Log – November 19, 2025
- ✅ Removed the legacy `job-finder-BE/functions` workspace plus its Firebase configs/scripts (firestore rules, deploy helpers, `.firebaserc`, etc.). Backend `job-finder-BE` now only contains the Express API (`server/`).
- ✅ Deleted `job-finder-worker/firebase.json`; Firebase Hosting is now the sole remaining consumer of a service account JSON (gitignored at `job-finder-FE/.firebase/serviceAccountKey.json` and mirrored via the `FIREBASE_SERVICE_ACCOUNT` secret).
- ✅ Pruned `job-finder-BE/.firebase/**` emulator exports and the legacy `job-finder-BE/scripts/` directory (all of those scripts depended on Firestore emulators or Firebase deploy tooling).
- ✅ Moved backend Firebase deployment/emulator runbooks (`PRODUCTION_DEPLOYMENT*.md`, `GRANT_DEPLOY_PERMISSIONS.md`, `EMULATORS.md`) into `docs/archive/2025-11/backend/` so the active docs only describe the new Express/SQLite stack.
- ✅ Frontend authentication now uses Google Identity Services (AuthContext, BaseApiClient, Login/AuthModal) and the Firebase SDK dependency was removed; remaining work is to finish GIS-based tests/docs per `MIG-008A`.

## 4. Timeline
- Earliest start: 7 days after successful cutover (per `cutover-checklist.md`).
- Target completion: January 5, 2026 (matches MIG-008 deadline).
- Responsible engineer should open a PR that removes the files listed above and references this plan.

### Prep Branch
- Branch name: `feature/mig-008-cleanup`
- Base commit: `main` once MIG-007 post-cutover verification is signed off
- Include scoped commits for:
  1. Removing Cloud Functions + Firebase CLI scripts
  2. Pruning Firestore rule/index files + emulator configs
  3. Updating documentation (`README.md`, runbooks) to drop Firebase references
  4. Adding an ops note under `docs/archive/2025-11/firebase-project-deletion.md`
