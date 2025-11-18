> Status: Archived
> Owner: @jdubz
> Last Updated: 2025-11-18

# BE-SEC-1 — Firestore Rules & Indexes Audit

- **Status**: ✅ COMPLETED 2025-10-20
- **Owner**: Worker A
- **Priority**: P1 (High Impact)
- **Labels**: priority-p1, repository-backend, type-security, status-completed

## What This Issue Covers
Audit and update Firestore security rules and index definitions stored in this repo so they match the migrated data model. Deploy changes to staging, verify via emulator tests, and document everything so contributors can repeat the process without leaving `job-finder-BE`.

## Tasks
1. **Inventory Current State**
   - Export the live staging rules/indexes using `firebase firestore:rules:download --project <staging>` and `firebase firestore:indexes:list --format=json` (reference `.firebaserc` for project IDs). Save exports to `tmp/firestore/staging/` (gitignored) to compare with repo versions.
   - Diff exports against `firestore.rules` and `firestore.indexes.json`. Note discrepancies in a table appended to this issue.
2. **Update Rules**
   - Review new collections referenced in code (`functions/src/modules/jobMatches`, `functions/src/modules/generator`, etc.) and ensure rules guard them appropriately. Use typed data from `src/types/` to define field-level permissions.
   - Refactor the rules file to group policies by collection with comments referencing the corresponding TypeScript modules.
   - Add tests under `functions/test/firestore/rules.test.ts` using the Firebase emulator SDK asserting allow/deny behavior for viewer/editor/admin claims.
3. **Rebuild Index Definitions**
   - Identify queries in the code (search for `.orderBy` and `.where` in `functions/src`). Cross-check with `firestore.indexes.json` to ensure each compound query has an index.
   - Add missing indexes and include reasoning in `FIRESTORE_INDEXES.md` (e.g., “supports generator history pagination”).
   - Create `docs/security/index-verification.md` summarizing how to run `firebase firestore:indexes:list` and compare results.
4. **Automate Verification**
   - Add an npm script `test:firestore-rules` to `functions/package.json` that runs emulator tests. Wire the script into GitHub Actions so PRs fail if rules regress.
   - Include a `scripts/firestore/validate-indexes.ts` helper that reads `firestore.indexes.json` and warns about duplicate or unused entries.
5. **Deploy to Staging**
   - Run `npm run deploy:firestore:staging` (add script if missing) which executes `firebase deploy --only firestore:rules,firestore:indexes --project <staging>`.
   - After deployment, capture the CLI output and note the timestamp + commit SHA in this issue under “Staging Deployment Log”.

## Acceptance Criteria
- [ ] Discrepancy table committed in this issue showing before/after state.
- [ ] `firestore.rules` and `firestore.indexes.json` updated to match migrated schema with inline comments.
- [ ] Emulator tests added for viewer/editor/admin guardrails and wired into CI (`npm run test:firestore-rules`).
- [ ] `FIRESTORE_INDEXES.md` and `docs/security/index-verification.md` describe deployment + rollback steps.
- [ ] Staging deployment executed and logged here with command output summary.

## Test Commands
- `npm run lint`
- `npm run test`
- `npm run test:firestore-rules`
- `npm run deploy:firestore:staging`

## Useful Files
- `firestore.rules`
- `firestore.indexes.json`
- `FIRESTORE_INDEXES.md`
- `functions/src/` and `functions/test/`
