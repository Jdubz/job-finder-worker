> Status: Draft
> Owner: @jdubz
> Last Updated: 2025-11-20

# Content Items Schema Migration Runbook

This document describes how to migrate legacy content items (from the pre-SQLite/union schema) into the unified nested model that now powers the resume UI. It covers preparation, executing the migration helper script, and verifying the new experience end-to-end.

---

## 1. Prerequisites
- Node.js 20+ with repo dependencies installed (`npm install` from the monorepo root).
- Access to the target SQLite database file (default: `infra/sqlite/jobfinder.db`) **and** a backup/snapshot before running destructive operations.
- Legacy export JSON (default: `docs/content-items-export.json`) that reflects the data to import.
- Primary user identifiers for the owner of the content:
  - `CONTENT_ITEMS_USER_ID` (or `--user-id` flag)
  - `CONTENT_ITEMS_USER_EMAIL` (or `--user-email` flag)
- Database access on the production host (if migrating live) plus SSH credentials for deployment.

---

## 2. Dry Run / Preview
1. From the repo root, run:
   ```bash
   node scripts/migrate-content-items.js \
     --input docs/content-items-export.json \
     --db infra/sqlite/jobfinder.db \
     --user-id "$CONTENT_ITEMS_USER_ID" \
     --user-email "$CONTENT_ITEMS_USER_EMAIL" \
     --dry-run
   ```
2. The script will:
   - Parse/import the export JSON.
   - Normalize fields into the new schema (title/role/location/website/dates/skills/markdown description/parent linkage).
   - Report the number of root + total nodes that would be migrated.
3. If the legacy export has structural issues (missing IDs, circular parents, malformed JSON), fix them before proceeding.

---

## 3. Execute the Migration
1. Take a backup of `infra/sqlite/jobfinder.db` (or the remote DB if running on production).
2. Run the migration script **without** `--dry-run`:
   ```bash
   node scripts/migrate-content-items.js \
     --input docs/content-items-export.json \
     --db infra/sqlite/jobfinder.db \
     --user-id "$CONTENT_ITEMS_USER_ID" \
     --user-email "$CONTENT_ITEMS_USER_EMAIL"
   ```
3. The script performs the following atomically:
   - Deletes existing rows in `content_items`.
   - Inserts normalized rows using legacy IDs (preserving parent/child ordering).
   - Copies over `createdAt/updatedAt/createdBy/updatedBy` metadata when present.
4. Successful runs log: `[content-items] Migrated <count> items into <dbpath>`.

---

## 4. Verification Checklist
### Backend
- `npm run lint:server`
- `npm run test --workspace job-finder-BE/server`
- Spot-check `SELECT * FROM content_items ORDER BY parent_id, order_index`.

### Frontend
- `npm run lint:frontend`
- `npm run test:unit --workspace job-finder-FE`
- `npm run build:frontend`
- Manually visit `/content-items` (admin UI):
  - Confirm root + child ordering matches expectations.
  - Enter edit mode for a few items to verify markdown rendering / optional fields.
  - Test inline add/delete/reorder flows.
  - Export JSON and re-import to ensure the workflow is round-trip safe.

---

## 5. Deployment
1. Commit the migration + schema changes on `staging`, open a PR into `main`, and wait for CI to pass.
2. After merging to `main`, monitor the `Deploy` GitHub Action (push-to-main trigger) to ensure backend + frontend redeploy.
3. If the workflow fails to trigger:
   - Manually dispatch the workflow from the Actions tab.
   - Verify `main` actually advanced (e.g., `git log origin/main -1`).
   - Check repository-level Actions permissions (organization policies can disable push-triggered workflows).

---

## 6. Troubleshooting
- **Script fails with “Unable to resolve userId”**: pass `--user-id` explicitly or add `userId` to the offending record in the export.
- **Missing parents**: ensure parent records appear earlier in the export or share consistent IDs (the script will treat missing parents as roots).
- **Firebase auth failures in UI**: confirm you are signed in before testing import/export (UI requires `user.id` and `user.email`).
- **GitHub Deploy workflow skipped**: confirm the push hit `refs/heads/main`. Merges into other long-lived branches will not deploy production anymore.

---

## 7. Rollback
If the migration produces bad data:
1. Restore the SQLite backup.
2. Redeploy the backend to pick up the restored DB.
3. Re-run verification tests.
