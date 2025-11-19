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
   - Rotate or delete Firebase service accounts stored in 1Password. Document the archival path for the last remaining JSON file under `/srv/job-finder/secrets/archive/`.

## 3. Acceptance Criteria
- CI no longer installs Firebase CLI or runs `firebase deploy`.
- `git grep firebase` only returns references in historical docs/archive directories.
- Watchtower/Compose remains the single deployment mechanism.
- An ops note confirming the deletion of the Firebase project is stored in `docs/archive/2025-11/`.

## 4. Timeline
- Earliest start: 7 days after successful cutover (per `cutover-checklist.md`).
- Target completion: January 5, 2026 (matches MIG-008 deadline).
- Responsible engineer should open a PR that removes the files listed above and references this plan.
