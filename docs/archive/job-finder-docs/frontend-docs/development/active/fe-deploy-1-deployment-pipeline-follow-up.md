# FE-DEPLOY-1 — Deployment Pipeline Follow-Up

- **Status**: Todo
- **Owner**: Worker B
- **Priority**: P1 (High Impact)
- **Labels**: priority-p1, repository-frontend, type-maintenance, status-todo

## What This Issue Covers

Ensure the GitHub Actions deployment workflows in this repository are healthy from a frontend perspective and backed by automated UI smoke checks. Everything should be reproducible with only the files under `job-finder-FE`.

## Tasks

1. **Understand Existing Workflows**
   - Review `.github/workflows/` (expect `deploy-staging.yml` and `deploy-production.yml`). Document each job, required secrets, and cache strategy in a new section of `docs/DEPLOYMENT_RUNBOOK.md`.
   - Use the “Run workflow” button in GitHub to dispatch a staging deploy. Record the commit SHA, generated URL, and attach logs to this issue (summary is fine if direct attachment impossible).
2. **Add UI Smoke Automation**
   - Extend the Playwright suite under `e2e/` with a lightweight smoke test that validates:
     - Homepage loads without console errors.
     - Auth icon renders and opens the modal (you can stub Firebase if necessary).
     - Job Finder page form renders and basic validation works.
   - Create a new Playwright project (e.g., `smoke`) configured in `playwright.config.ts`.
   - Update deployment workflows so the smoke suite runs immediately after deploy. If the suite fails, the workflow should fail.
3. **Document DNS Expectations**
   - Even without Terraform, list the expected staging and production hostnames (from `firebase.json` and `.firebaserc`).
   - Add a subsection “DNS Verification” in `docs/DEPLOYMENT_RUNBOOK.md` describing how to confirm Cloudflare records point to Firebase (e.g., using `dig` commands).
4. **Create Frontend Checklist**
   - Append to the runbook a short checklist for frontend reviewers covering: verifying deploy logs, running smoke tests locally (`npm run test:e2e -- --project smoke`), and confirming environment variables.

## Acceptance Criteria

- [ ] GitHub Actions deploy workflow has an accompanying description in `docs/DEPLOYMENT_RUNBOOK.md` and a recorded manual dispatch result.
- [ ] A Playwright smoke project exists and is invoked automatically by the deploy workflow.
- [ ] Deploy documentation contains DNS verification instructions based solely on files in this repo.
- [ ] `npm run lint`, `npm run test`, and `npm run test:e2e -- --project smoke` succeed locally.

## Useful Files

- `.github/workflows/`
- `playwright.config.ts`
- `e2e/` test directory
- `docs/DEPLOYMENT_RUNBOOK.md`
- `.firebaserc`, `firebase.json`
