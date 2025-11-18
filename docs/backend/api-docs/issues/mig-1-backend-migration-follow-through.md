# MIG-1 — Backend Migration Follow-Through (Phase 1 Closure)

- **Status**: Todo
- **Owner**: Worker A
- **Priority**: P1 (High Impact)
- **Labels**: priority-p1, repository-backend, type-migration, status-todo

## What This Issue Covers
Close out Phase 1 of the backend migration by reconciling documentation, removing legacy code, and proving staging is running the migrated services. Everything should be verifiable using only files under `job-finder-BE`.

## Tasks
1. **Review Migration Tracker**
   - Open `PRIORITY_4_PROGRESS.md` and copy remaining checkboxes into a table at the bottom of this issue with columns: item, file/code reference, status, follow-up issue (if any).
   - Resolve items directly when possible; for anything that cannot be finished here, create a new issue in `docs/issues/` and link it in both places.
2. **Codebase Cleanup**
   - Search `functions/src/` for `TODO`, `portfolio`, or `legacy`. Remove unused modules and update references to align with the new architecture.
   - Ensure configuration files (`.runtimeconfig.json.example`, `.env.example`, `firebase.json`) reflect current service names and project IDs.
   - Add concise comments near complex migration logic so Phase 2 owners understand why it exists.
3. **Staging Sync**
   - Run `npm run deploy:staging` (create script if missing) to push latest Cloud Functions.
   - Execute the smoke commands documented in `docs/testing/smoke-checklist.md` (create if missing) covering job queue, generator, and content endpoints via `functions/test/smoke/*`.
   - Record outputs (status codes, response snippets) in a “Staging Verification” section of this issue.
4. **Documentation Refresh**
   - Update `MIGRATION_DECISIONS.md` with final architecture rationale and reference commit SHAs for key changes.
   - Author `docs/migration/phase-1-summary.md` summarizing completed milestones, outstanding risks, and required monitoring.
   - Link the new summary from `README.md` under a “Migration Status” heading.
5. **Phase 2 Handoff Kit**
   - Create `docs/migration/phase-2-checklist.md` outlining prerequisites for the next phase: tests that must remain passing, monitoring alerts to watch, deploy steps, and contacts.
   - Include pointers to relevant scripts/tests so a new contributor can follow them without outside context.

## Acceptance Criteria
- [ ] Migration tracker table appended to this issue with statuses updated.
- [ ] Legacy references removed from `functions/src/` and configuration files reflect new architecture.
- [ ] Staging deploy executed; smoke results documented in this issue.
- [ ] `MIGRATION_DECISIONS.md`, `README.md`, and new docs under `docs/migration/` updated.
- [ ] `docs/migration/phase-2-checklist.md` committed and reviewed with PM.
- [ ] `npm run lint`, `npm run test`, and deploy scripts succeed locally.

## Test Commands
- `npm run lint`
- `npm run test`
- `npm run deploy:staging`
- `npm run smoke`

## Useful Files
- `PRIORITY_4_PROGRESS.md`
- `MIGRATION_DECISIONS.md`
- `docs/migration/`
- `functions/src/`
