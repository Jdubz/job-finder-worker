# FE-PERF-1 — Direct Firestore Integration for Performance

- **Status**: Todo
- **Owner**: Worker B
- **Priority**: P1 (High Impact)
- **Labels**: priority-p1, repository-frontend, type-performance, status-todo
- **Dependencies**: Requires BE-SEC-1 (Firestore rules & indexes audit) to be complete first

## Why This Matters

Currently, the frontend makes requests to Cloud Functions for data fetching operations, which adds latency and increases costs. By connecting directly to Firestore for read operations, we can:
- Reduce response times by eliminating the Cloud Functions hop
- Lower operational costs (Firestore reads are cheaper than Cloud Functions invocations)
- Improve real-time data sync capabilities
- Simplify the data flow architecture

This change will enable us to deprecate obsolete Cloud Functions in BE-CLEANUP-1.

## Approach

1. **Identify Read-Only Operations**
   - Audit all API calls in `src/` to identify which operations are purely read-based (GET operations that don't modify data).
   - Create a list of Cloud Functions currently used for data fetching with their corresponding Firestore collections/queries.
   - Document findings in `docs/migration/firestore-direct-access-plan.md`.

2. **Implement Firestore SDK Integration**
   - Update `src/config/firebase.ts` to initialize Firestore SDK with proper configuration for all environments (local emulators, staging, production).
   - Create utility hooks/functions in `src/lib/firestore/` for common query patterns (e.g., `useJobMatches`, `useUserProfile`, `useDocumentTemplates`).
   - Implement proper error handling, loading states, and retry logic.

3. **Update Security Rules** (Coordinate with BE-SEC-1)
   - Work with Worker A to ensure Firestore security rules allow direct frontend access with proper authentication checks.
   - Verify rules respect user roles (viewer/editor/admin) and data ownership.
   - Test rules thoroughly in local emulator before staging deployment.

4. **Migrate Components Incrementally**
   - Start with non-critical, read-only features (e.g., viewing job matches, browsing templates).
   - Replace API calls with direct Firestore queries one component at a time.
   - Keep Cloud Functions as fallback during transition period.
   - Add feature flags if needed to control rollout.

5. **Performance Monitoring**
   - Add performance tracking for Firestore queries using Firebase Performance Monitoring.
   - Document baseline metrics before migration in `docs/perf/firestore-direct-baseline.md`.
   - Compare response times after migration and document improvements.

6. **Testing & Validation**
   - Add unit tests for new Firestore utility functions.
   - Update integration tests to work with Firestore emulator instead of mocked API calls.
   - Perform smoke tests across all environments (local, staging, production).
   - Verify real-time updates work correctly where implemented.

## Deliverables

- `docs/migration/firestore-direct-access-plan.md` — List of operations to migrate with migration strategy.
- `src/lib/firestore/` — Reusable Firestore query utilities and hooks.
- Updated `src/config/firebase.ts` with Firestore initialization.
- Migrated components using direct Firestore access instead of Cloud Functions.
- `docs/perf/firestore-direct-baseline.md` and `docs/perf/firestore-direct-results.md` — Performance comparison.
- Updated tests covering new Firestore integration.
- Documentation in README or relevant docs explaining the new data access pattern.

## Acceptance Criteria

- [ ] Migration plan document created listing all operations to migrate.
- [ ] Firestore SDK properly configured for all environments (local/staging/production).
- [ ] Security rules verified to allow proper frontend access (coordinate with BE-SEC-1).
- [ ] At least one major feature migrated to direct Firestore access and working in all environments.
- [ ] Performance metrics documented showing improvement over Cloud Functions approach.
- [ ] Tests updated and passing (`npm run test`, `npm run test:integration`).
- [ ] No breaking changes to existing functionality.
- [ ] Code review completed and PR approved by PM.

## Dependencies & Coordination

- **MUST COMPLETE FIRST**: BE-SEC-1 (Firestore rules & indexes audit)
- **ENABLES**: BE-CLEANUP-1 (Deprecate obsolete Cloud Functions)
- **COORDINATE WITH**: Worker A on security rules and data model understanding

## Helpful Files

- `src/config/firebase.ts` — Firebase configuration
- `src/lib/api/` — Current API call patterns to migrate
- `src/hooks/` — Custom hooks that may need Firestore versions
- `src/pages/**` — Components that fetch data
- `firestore.rules` (in job-finder-BE) — Security rules to coordinate on

## Test Commands

- `npm run dev` — Test with local emulators
- `npm run test` — Run unit tests
- `npm run test:integration` — Run integration tests
- `npm run build` — Verify production build
- `npm run lint` — Check code quality
