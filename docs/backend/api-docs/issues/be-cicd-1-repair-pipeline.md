> Status: Archived
> Owner: @jdubz
> Last Updated: 2025-11-18

# BE-CICD-1 — Repair job-finder-BE CI/CD (PR #15)

- **Status**: Todo
- **Owner**: Worker B
- **Priority**: P0 (Critical)
- **Labels**: priority-p0, repository-backend, type-ci, status-todo

## What This Issue Covers
Diagnose and fix the failing GitHub Actions workflows in `job-finder-BE` so that linting, tests, and staged Firebase deploys run cleanly using only configuration and code in this repository. Capture everything needed for future maintainers inside the repo.

## Tasks
1. **Recreate the Breakage**
   - Review `.github/workflows/` (`ci.yml`, `deploy-staging.yml`, `deploy-production.yml`). Document the failing job, step, and error message in a table appended to this issue.
   - Check PR #15 run history via the GitHub UI and copy relevant log excerpts into `docs/issues/be-cicd-1-repair-pipeline.md` under a new “Historical Failures” heading.
   - Locally run `npm ci`, `npm run lint`, `npm run test`, and `npm run build` to mirror CI.
2. **Stabilize Tooling**
   - Ensure `.nvmrc` / `package.json` engines align with the Node version configured in workflows. If missing, add the file and reference it in the workflow `setup-node` steps.
   - Verify Firebase CLI installation occurs via the pinned version defined in `Makefile` or `package.json` scripts. Update workflows to use `firebase-tools@latest` only if the repo toolchain supports it.
3. **Secrets and Service Accounts**
   - Confirm required secrets (`FIREBASE_SERVICE_ACCOUNT`, `GOOGLE_APPLICATION_CREDENTIALS`, etc.) are referenced via `${{ secrets. ... }}` and add placeholders to `.github/workflows/README.md` (create file) documenting exact names/expected JSON structure.
   - Create `scripts/ci/print-required-secrets.ts` to list secrets the workflow expects; run it in CI as a preflight step so missing secrets fail fast with a clear message.
4. **Deploy Step Repair**
   - Update deploy workflow to call `npm run deploy:staging` (defined in `package.json` or create new script wrapping `firebase deploy --only functions`). Ensure the script reads project ID from `.firebaserc`.
   - Add staging dry-run support by introducing `firebase.json` targets if missing.
   - After code fixes, dispatch the staging workflow manually and capture the run URL in this issue.
5. **Documentation and Guardrails**
   - Append a remediation summary to `CICD_REVIEW.md` describing root cause, fix, and follow-up.
   - Update `README.md` with a short “CI troubleshooting” section linking to the new workflow docs.
   - If you add scripts or config files, include brief inline comments explaining why they exist.

## Acceptance Criteria
- [ ] Failure table and historical log excerpts documented in this issue file.
- [ ] Updated workflows pass (`npm run lint`, `npm run test`, `npm run build`, deploy steps) on the default branch.
- [ ] Manual staging dispatch succeeds; run URL noted in issue and artifacts attached if available.
- [ ] `scripts/ci/print-required-secrets.ts` exists and runs in CI prior to deploy steps.
- [ ] `CICD_REVIEW.md` and `README.md` updated with troubleshooting guidance.

## Test Commands
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run deploy:staging`

## Useful Files
- `.github/workflows/`
- `CICD_REVIEW.md`
- `.firebaserc`, `firebase.json`
- `package.json`, `Makefile`
