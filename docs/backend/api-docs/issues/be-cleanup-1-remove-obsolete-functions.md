# BE-CLEANUP-1 — Deprecate and Remove Obsolete Cloud Functions

- **Status**: Todo
- **Owner**: Worker B
- **Priority**: P1 (High Impact)
- **Labels**: priority-p1, repository-backend, type-cleanup, status-todo
- **Dependencies**: Requires FE-PERF-1 (Direct Firestore integration) to be complete and deployed to staging

## Why This Matters

After migrating the frontend to access Firestore directly (FE-PERF-1), several Cloud Functions will become obsolete. Removing them will:
- Reduce deployment size and cold start times
- Lower operational costs (no unnecessary function invocations)
- Simplify the codebase and reduce maintenance burden
- Eliminate potential security surface area
- Improve code clarity by removing unused code

This cleanup is critical for maintaining a lean, efficient backend architecture.

## Approach

1. **Identify Obsolete Functions**
   - Review the migration plan from FE-PERF-1 to identify which Cloud Functions are replaced by direct Firestore access.
   - Check function invocation metrics in Firebase Console to confirm functions are no longer being called.
   - Create a list in `docs/migration/obsolete-functions-list.md` with function names, their purpose, and migration status.
   - Verify with Worker B that all frontend code has been migrated away from these functions.

2. **Deprecation Period**
   - Add deprecation warnings to the identified functions (log warnings when called).
   - Deploy to staging and monitor for 1-2 weeks to catch any unexpected usage.
   - Document any remaining calls and work with Worker B to migrate them.
   - Update API documentation to mark functions as deprecated.

3. **Update Tests**
   - Identify tests that depend on the obsolete functions.
   - Remove or update tests to reflect the new direct Firestore architecture.
   - Ensure remaining tests still provide adequate coverage.

4. **Remove Function Code**
   - Delete the obsolete function implementations from `functions/src/`.
   - Remove their exports from `functions/src/index.ts`.
   - Remove any related utility functions, types, or helpers that are no longer needed.
   - Update TypeScript types and interfaces to remove references.

5. **Update Configuration & Documentation**
   - Remove function entries from deployment configurations.
   - Update `functions/package.json` if any dependencies were only used by removed functions.
   - Update API documentation to remove references to deprecated endpoints.
   - Update `README.md` and architecture docs to reflect the new data access pattern.
   - Create migration guide in `docs/migration/cloud-functions-removal-guide.md` for reference.

6. **Deploy & Verify**
   - Deploy to staging first and verify no errors.
   - Monitor logs for 24-48 hours to catch any issues.
   - Run full test suite to ensure no regressions.
   - Deploy to production after successful staging verification.

## Deliverables

- `docs/migration/obsolete-functions-list.md` — Complete list of functions to remove with justification.
- `docs/migration/cloud-functions-removal-guide.md` — Migration guide documenting the cleanup.
- Removed function code from `functions/src/`.
- Updated `functions/src/index.ts` with removed exports.
- Updated tests reflecting the new architecture.
- Updated API documentation removing deprecated endpoints.
- Updated `README.md` and architecture docs.
- Cleaned up dependencies in `functions/package.json` if applicable.
- Deployment logs showing successful cleanup in staging and production.

## Acceptance Criteria

- [ ] Obsolete functions list created and verified with Worker B.
- [ ] Deprecation warnings deployed to staging and monitored for 1-2 weeks with no unexpected usage.
- [ ] All obsolete function code removed from codebase.
- [ ] Tests updated and passing (`npm run test`, `npm run test:integration`).
- [ ] API documentation updated to remove deprecated endpoints.
- [ ] Successfully deployed to staging without errors.
- [ ] Monitored staging for 24-48 hours with no issues.
- [ ] Successfully deployed to production.
- [ ] Bundle size and cold start metrics improved (document in issue).
- [ ] Code review completed and PR approved by PM.

## Safety Checklist

Before removing any function, verify:
- [ ] Function is not called by any frontend code (coordinate with Worker B).
- [ ] Function is not called by job-finder-worker (Python worker).
- [ ] Function is not called by scheduled jobs or background tasks.
- [ ] Function is not documented as a public API endpoint used by external systems.
- [ ] Function invocation count in Firebase Console is zero or near-zero for past 2 weeks.
- [ ] No other Cloud Functions depend on this function.

## Dependencies & Coordination

- **MUST COMPLETE FIRST**: FE-PERF-1 (Direct Firestore integration) deployed to staging
- **COORDINATE WITH**: Worker B to verify all frontend migrations are complete
- **VERIFY WITH**: Worker A if any worker (Python) dependencies exist

## Helpful Files

- `functions/src/index.ts` — Function exports
- `functions/src/` — Function implementations
- `functions/test/` — Tests to update
- `docs/migration/firestore-direct-access-plan.md` (from FE-PERF-1) — Reference for what was migrated
- Firebase Console — Function invocation metrics

## Test Commands

- `npm run lint` — Check code quality
- `npm run test` — Run unit tests
- `npm run test:integration` — Run integration tests
- `npm run build` — Verify build succeeds
- `npm run deploy:staging` — Deploy to staging
- `npm run deploy:production` — Deploy to production

## Rollback Plan

If issues are discovered after deployment:
1. Keep a backup branch with the old functions before deletion.
2. Document how to quickly re-deploy previous version if needed.
3. Have monitoring alerts in place to catch errors quickly.
4. Plan the cleanup during low-traffic period to minimize impact.
