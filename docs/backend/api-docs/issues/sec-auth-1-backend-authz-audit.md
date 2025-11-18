> Status: Archived
> Owner: @jdubz
> Last Updated: 2025-11-18

# SEC-AUTH-1 — Backend Auth & Role Mapping Validation

- **Status**: Todo
- **Owner**: Worker A
- **Priority**: P1 (High Impact)
- **Labels**: priority-p1, repository-backend, type-security, status-todo

## What This Issue Covers
Ensure backend Cloud Functions enforce the correct role-based permissions by documenting claim usage, adding automated checks, and providing tooling for emulator/staging verification. All outputs stay within `job-finder-BE`.

## Tasks
1. **Map Roles to Endpoints**
   - Review `functions/src/middleware/auth/` and identify helpers like `requireViewer`, `requireEditor`, `requireAdmin`.
   - For each HTTP/callable function in `functions/src/modules/`, list the required role and note how the middleware is applied. Capture results in `docs/security/role-matrix.md` (new file) using a table format.
   - Flag any functions missing middleware so they can be fixed in subsequent steps.
2. **Enforce Consistent Middleware Usage**
   - Update functions lacking explicit checks to use the shared middleware (avoid duplicating logic). Ensure request contexts include the decoded claims for downstream business logic.
   - Add inline comments in complex handlers explaining why specific role checks are required.
3. **Automated Tests**
   - Expand `functions/test/auth/` to include integration tests that call each protected endpoint with:
     - No auth
     - Viewer claims
     - Editor claims
     - Admin claims
   - Use the Firebase emulator to seed users via a new script `scripts/emulator/seed-auth-claims.ts` that reads fixtures from `functions/test/fixtures/auth-users.json`.
4. **Staging Verification Script**
   - Create `scripts/auth/verify-claims-staging.ts` that reads the staging Firestore/Functions endpoints from `.firebaserc`, impersonates each role via service account, and prints which endpoints succeed/fail.
   - Run the script against staging and summarize results (timestamp, command, output) in this issue.
5. **Documentation**
   - Author `docs/security/role-mapping.md` explaining each role, how to update claims, and how frontend should interpret them.
   - Link the doc from `README.md` and cross-reference with the frontend SEC-AUTH-1 issue.

## Acceptance Criteria
- [ ] `docs/security/role-matrix.md` lists every function and its required role with no “unknown” gaps.
- [ ] Middleware applied consistently across modules; unauthorized requests fail with clear error messages.
- [ ] Emulator tests covering viewer/editor/admin run via `npm run test:auth` and pass in CI.
- [ ] `scripts/emulator/seed-auth-claims.ts` and `scripts/auth/verify-claims-staging.ts` exist with usage instructions in their headers.
- [ ] `docs/security/role-mapping.md` and `README.md` updated; staging verification output recorded in this issue.

## Test Commands
- `npm run lint`
- `npm run test`
- `npm run test:auth`

## Useful Files
- `functions/src/middleware/auth/`
- `functions/src/modules/`
- `functions/test/auth/`
- `docs/security/`
