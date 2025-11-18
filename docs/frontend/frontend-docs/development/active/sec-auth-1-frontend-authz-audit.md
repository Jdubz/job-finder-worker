# SEC-AUTH-1 — Frontend Auth & Role Mapping Validation

- **Status**: Todo
- **Owner**: Worker B
- **Priority**: P1 (High Impact)
- **Labels**: priority-p1, repository-frontend, type-security, status-todo

## What This Issue Covers

Audit every place the frontend reads Firebase Auth state or custom claims, make sure UI gating matches the backend contract, and provide tooling/tests that prove the behaviors using only files inside `job-finder-FE`.

## Tasks

1. **Catalog Role Gates**
   - Review `src/context/auth/` (especially `AuthProvider.tsx`), `src/components/navigation/TopNav.tsx`, and any `useHasRole` helpers to list all places roles influence rendering.
   - Update this issue with a table mapping UI component → required role → claim key used → notes (e.g., viewer/editor/admin).
   - Highlight any direct string checks that should be centralized in a helper.
2. **Centralize Role Helpers**
   - Create or update `src/utils/auth/roles.ts` to expose typed guards (e.g., `isEditor(userClaims)`). Ensure every component imports from this module instead of repeating logic.
   - Add unit tests under `src/tests/utils/roles.test.ts` validating the helpers against sample claim payloads.
3. **Emulator Test Harness**
   - Configure Firebase Auth emulator usage for Playwright and React Testing Library: extend `scripts/emulator/start.sh` or create `scripts/auth/start-emulator.ts` to seed users defined in `docs/auth/sample-users.json` (new file).
   - Add Playwright scenarios under `e2e/auth/` verifying viewer sees read-only UI, editor sees document builder/edit actions, and admin sees queue management pages.
   - Document commands in `README.md` (e.g., `npm run test:e2e -- --project auth-emulator`).
4. **Runtime Verification**
   - Using `.env.staging`, sign in with each seeded user and confirm UI states. Record findings (with screenshots or console log excerpts) in a section titled “Staging Verification Notes” at the bottom of this issue.
   - Ensure unauthorized states display clear messaging: update components under `src/components/auth/` to show toasts or inline alerts when access is denied. Coordinate with FE-BUG-3 if shared components are needed.
5. **Documentation**
   - Create `docs/auth/role-mapping.md` detailing role definitions, impacted routes/components, emulator seeding steps, and troubleshooting tips.
   - Link the doc from `README.md` and `docs/ARCHITECTURE.md` so new contributors can discover the auth model quickly.

## Acceptance Criteria

- [ ] Role gating table completed within this issue and all checks point to helpers in `src/utils/auth/roles.ts`.
- [ ] Unit and E2E tests covering viewer/editor/admin run successfully in CI (`npm run test`, `npm run test:e2e -- --project auth-emulator`).
- [ ] Staging verification notes recorded with evidence of each role behaving correctly.
- [ ] `docs/auth/role-mapping.md`, `README.md`, and `docs/ARCHITECTURE.md` reflect the finalized auth model.
- [ ] Unauthorized states surface user-facing feedback without console errors.

## Test Commands

- `npm run test -- roles`
- `npm run test:e2e -- --project auth-emulator`
- `npm run lint`

## Useful Files

- `src/context/auth/`
- `src/utils/auth/roles.ts`
- `e2e/auth/`
- `docs/auth/`
