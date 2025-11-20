# Project Task List (PM Master)

> **Single source of truth for planning.**
>
> **New Workflow**: Issue-based task tracking with worker selection
>
> - PM creates detailed GitHub issues in appropriate repositories
> - PM creates backing issue documents in `docs/issues/` directories
> - Workers select issues based on availability and expertise
> - All tasks tracked as GitHub issues with comprehensive specifications

Last updated: 2025-10-21 (16:30 UTC — Completed documentation cleanup and organization; moved scattered files to archive, removed temporary files, verified clean repository structure)

---

## Current Focus — P0 Critical (Do First)

- [x] **FE-RECOVERY-1 — Restore frontend hosting (staging)** (Owner: Worker A · Repos: `job-finder-FE`, `job-finder-BE`) — Completed 2025-10-19; see `CLAUDE_WORKER_A.md` and staging verification notes.
- [x] **FE-RECOVERY-2 — Automate deploy pipeline** (Owner: Worker A · Repo: `job-finder-FE`) — Completed 2025-10-19; see `DEPLOYMENT_RUNBOOK.md` & `GITHUB_SECRETS_SETUP.md`.
- [x] **FE-RECOVERY-3 — Production cutover readiness** (Owner: Worker A · Repos: `job-finder-FE`, `job-finder-BE`) — Completed 2025-10-19; refer to `PRODUCTION_CUTOVER_CHECKLIST.md`.
- [x] **PM-01 — Review & release oversight** (Owner: PM · [Issue](issues/pm-01-review-and-release-oversight.md)) — Completed 2025-10-20; artifacts published, stakeholder update sent, parity coordination paused pending directive.

- [ ] **FE-WORKFLOW-0 — Add E2E tests to production deployment** ([Issue](issues/fe-workflow-0-add-production-e2e.md)) — **CRITICAL PRODUCTION SAFETY ISSUE**: Production deploys with NO E2E tests while staging has them. Can deploy broken UI to production. Must add E2E tests to production workflow immediately. Estimated: 30 min.
- [ ] **WORKER-WORKFLOW-1 — Add test requirements to worker deployments** ([Issue](issues/worker-workflow-1-add-test-requirements.md)) — **CRITICAL PRODUCTION SAFETY ISSUE**: Deployments proceed even if tests fail. Worker can deploy broken code to staging/production since tests run independently from Docker builds. Must add test dependency to deployment workflows. Estimated: 30 min.
- [ ] **GAP-TEST-BE-1 — No test coverage for backend Cloud Functions** ([Issue](issues/gap-test-be-1-no-test-coverage.md)) — **CRITICAL PRODUCTION BLOCKER**: Backend has almost NO test coverage (only Firestore rules tests exist). Cannot verify Cloud Functions work before deploying. Creates critical risk of deploying broken code. Effort: 3-4 days. Owner: Worker B.
- [ ] **GAP-SEC-AUTH-1 — No API authentication on Cloud Functions** ([Issue](issues/gap-sec-auth-1-no-api-authentication.md)) — **CRITICAL SECURITY VULNERABILITY**: All Cloud Functions are publicly accessible with no authentication. Major security risk exposing sensitive user data. Must implement Firebase Auth verification and API key validation. Effort: 2 days. Owner: Worker A.
- [ ] **FE-BUG-2 — Environment verification** (Owner: Worker B · Repo: `job-finder-FE` · [Issue](job-finder-FE/docs/issues/fe-bug-2-environment-verification.md))
  - Status (2025-10-20 19:30 UTC): Pending DATA-QA-1 smoke outputs before finalizing env matrix.
  - Validate API calls across local emulators, staging, and production; document configuration.
- [ ] **BE-CICD-1 — Repair job-finder-BE CI/CD (PR #15)** (Owner: Worker B · Repo: `job-finder-BE` · [Issue](job-finder-BE/docs/issues/be-cicd-1-repair-pipeline.md))
  - Status (2025-10-20 19:30 UTC): Waiting on Worker A PR #13 merge; secrets ready for workflow tests.
  - Begin immediately after generator/content Firestore updates land.
  - Fix failing pipeline checks, ensure staging deploy workflow succeeds, and document root cause + remediation.
- [ ] **FA-2 — Cover letter generation verification** (Owner: Worker B · Repo: `job-finder-FE` · [Issue](job-finder-FE/docs/issues/fa-2-cover-letter-generation-verification.md))
  - Smoke test the cover letter builder across environments and update documentation with verification evidence.

_(Worker B remains on-call for bundle/error polish once hosting is restored; see P1 backlog below.)_

---

## Next Up — P1 High Impact (Start after P0)

**Worker A** _(Status sync: 2025-10-20 18:00 UTC — see `CLAUDE_WORKER_A.md`)_

- [x] **AUTH-UX-1 — Minimal login indicator & modal** — Completed 2025-10-19; see implementation details in `CLAUDE_WORKER_A.md`.
- [ ] **FE-RECOVERY-4 — Codify hosting & secrets via Terraform** ([Issue](job-finder-FE/docs/issues/fe-recovery-4-terraform-hosting-and-secrets.md)) — Capture Firebase Hosting sites, Cloudflare DNS, and deploy credentials in Terraform; move secrets into managed storage and document the workflow.
  - Note (2025-10-20): Cloudflare DNS completed manually after Terraform provider import failure; document hybrid approach in deliverables.
- [ ] **BE-SEC-1 — Firestore rules & indexes audit** ([Issue](job-finder-BE/docs/issues/be-sec-1-firestore-rules-and-indexes-audit.md)) — Apply migrated security rules/indexes to staging, add coverage, and ensure Cloud Functions access respects job-finder roles before production cutover.
- [ ] **DATA-QA-1 — Queue pipeline smoke & data integrity check** ([Issue](job-finder-worker/docs/issues/data-qa-1-queue-pipeline-smoke.md)) — Script a staging smoke that submits sample jobs through the Python worker, validates Cloud Functions responses, and checks Firestore for duplicates or scoring anomalies.
- [ ] **BUG-1 — Duplicate jobs in matches** ([Issue](job-finder-worker/docs/issues/bug-1-duplicate-jobs-in-matches.md)) — Improve URL normalization and add Firestore pre-checks in `scraper_intake.py`; acceptance is zero duplicate URLs.
- [ ] **BUG-2 — Timezone detection for global companies** ([Issue](job-finder-worker/docs/issues/bug-2-timezone-detection-global-companies.md)) — Default large companies to "unknown" unless team location specified; update scoring logic.
- [ ] **BUG-3 — Long company names truncated in logs** ([Issue](job-finder-worker/docs/issues/bug-3-long-company-names-logs.md)) — Expand structured logging fields to capture full names and add ellipsis handling.
- [ ] **BUG-4 — Inconsistent test file naming** ([Issue](job-finder-worker/docs/issues/bug-4-inconsistent-test-file-naming.md)) — Standardize test modules/functions and ensure suite passes.
- [ ] **MIG-1 — Backend migration follow-through** ([Issue](job-finder-BE/docs/issues/mig-1-backend-migration-follow-through.md)) — Close remaining Phase 1 items in `job-finder-BE` and prep Phase 2 hand-off.
- [ ] **MIG-4 — Migration QA & staging parity** ([Issue](issues/mig-4-migration-qa-and-staging-parity.md)) — Partner with PM to confirm staging mirrors production config after hosting recovery.

**Worker B** _(Status sync: 2025-10-20 18:00 UTC — see `CLAUDE_WORKER_B.md`)_

- [ ] **QA-INTEG-1 — Integration test suite with AI stubs** ([Issue](job-finder-BE/docs/issues/qa-integ-1-integration-suite-with-ai-stubs.md)) — Extend unit/integration coverage so CI exercises Cloud Functions entry points with AI/third-party calls stubbed or mocked; ensure pipelines run green without triggering paid traffic.
- [ ] **SEC-AUTH-1 — Firebase Auth & role mapping validation** ([Frontend Issue](job-finder-FE/docs/issues/sec-auth-1-frontend-authz-audit.md) · [Backend Issue](job-finder-BE/docs/issues/sec-auth-1-backend-authz-audit.md)) — Audit Auth claims, frontend feature gates, and backend callable permissions post-migration; add emulator-based coverage for editor/admin roles.
- [ ] **FE-PERF-1 — Direct Firestore integration for performance** ([Issue](job-finder-FE/docs/issues/fe-perf-1-direct-firestore-integration.md)) — Migrate frontend to connect directly to Firestore for read operations, eliminating Cloud Functions overhead for data fetching. Implement proper security rules, update frontend queries to use Firestore SDK, and document performance improvements. Dependencies: Requires BE-SEC-1 (Firestore rules audit) to be complete first.
- [ ] **BE-CLEANUP-1 — Deprecate and remove obsolete Cloud Functions** ([Issue](job-finder-BE/docs/issues/be-cleanup-1-remove-obsolete-functions.md)) — After FE-PERF-1 completes, identify and remove Cloud Functions that are no longer needed due to direct Firestore access. Update documentation, remove code, update deployment configs, and verify no dependencies remain. Dependencies: Requires FE-PERF-1 to be complete and deployed to staging first.
- [ ] **FE-BUG-1 — Bundle size optimization** ([Issue](job-finder-FE/docs/issues/fe-bug-1-bundle-size-optimization.md)) — Reduce main bundle below 500kb via code splitting and lazy loading.
- [ ] **FE-BUG-3 — Enhanced error handling** ([Issue](job-finder-FE/docs/issues/fe-bug-3-enhanced-error-handling.md)) — Add error boundaries, retry UX, and toast notifications.
- [ ] **FE-DEPLOY-1 — Frontend deployment pipeline follow-up** ([Issue](job-finder-FE/docs/issues/fe-deploy-1-deployment-pipeline-follow-up.md)) — Provide UI smoke validation and assist with Cloudflare DNS once Worker A restores automation.
- [ ] **MIG-2 — Generator & content services port** ([Issue](job-finder-BE/docs/issues/mig-2-generator-and-content-services-port.md)) — Move generator/content-items functions into `job-finder-BE` and restore templates.
- [ ] **MIG-3 — Frontend integration with new backend** ([Issue](job-finder-FE/docs/issues/mig-3-frontend-integration-with-new-backend.md)) — Point clients to migrated APIs and validate flows.
- [ ] **MIG-4 — Migration QA & staging parity** ([Issue](issues/mig-4-migration-qa-and-staging-parity.md)) — Coordinate validation passes with Worker A once FE recovery tasks complete.
- [ ] **FE-WORKFLOW-1 — Eliminate FE workflow duplication** ([Issue](issues/fe-workflow-1-eliminate-duplication.md)) — Consolidate deploy-staging/deploy-production workflows and remove duplicate quality checks. Eliminates 373 lines of duplication (46% reduction). Depends on: FE-WORKFLOW-0.
- [ ] **FE-WORKFLOW-2 — Fix FE CI efficiency** ([Issue](issues/fe-workflow-2-fix-ci-efficiency.md)) — Install dependencies once instead of 6 times per CI run. Share node_modules via artifacts. Reduces CI time by ~25% (~4 minutes).
- [ ] **FE-WORKFLOW-3 — Remove skip-tests option** ([Issue](issues/fe-workflow-3-remove-skip-tests.md)) — Remove dangerous skip-tests bypass from deployment workflows. Ensures all deployments require passing tests. Depends on: FE-WORKFLOW-0.
- [ ] **BE-WORKFLOW-1 — Eliminate BE workflow duplication** ([Issue](issues/be-workflow-1-eliminate-duplication.md)) — Consolidate staging/production deployment jobs to eliminate 346 lines of duplicated code (47% reduction). Refactor to single environment-based matrix job.
- [ ] **BE-WORKFLOW-2 — Optimize BE CI workflow** ([Issue](issues/be-workflow-2-optimize-ci.md)) — Add dependency caching, remove deprecated branch triggers, replace build with type-check. Reduces CI time from 3-4 min to ~2 min (40% faster).
- [ ] **BE-WORKFLOW-3 — Add BE post-deployment validation** ([Issue](issues/be-workflow-3-add-validation.md)) — Add smoke tests after deployments to verify functions are accessible. Improves deployment confidence from 70% to 95%.
- [ ] **WORKER-WORKFLOW-2 — Eliminate worker Docker workflow duplication** ([Issue](issues/worker-workflow-2-eliminate-duplication.md)) — Consolidate staging/production Docker workflows to eliminate 147 lines of duplicated code (45% reduction). Single workflow with environment-based logic. Depends on: WORKER-WORKFLOW-1.
- [ ] **GAP-TEST-FE-1 — No unit tests for React components** ([Issue](issues/gap-test-fe-1-no-unit-tests.md)) — Frontend has NO unit tests for React components, only E2E tests exist. Need comprehensive unit test suite with Vitest + React Testing Library. Target 70%+ component coverage. Effort: 2-3 days. Owner: Worker B.
- [ ] **GAP-TEST-WORKER-1 — Improve Python worker test coverage** ([Issue](issues/gap-test-worker-1-improve-test-coverage.md)) — Worker has low test coverage (< 50%). Need comprehensive unit and integration tests for job processing logic. Target 70%+ coverage. Effort: 2 days. Owner: Worker A. Depends on: WORKER-WORKFLOW-1.
- [ ] **GAP-DEVOPS-MON-1 — No centralized monitoring or alerting** ([Issue](issues/gap-devops-mon-1-no-monitoring-alerting.md)) — No monitoring or alerting across all services. Production issues only discovered when users complain. Need Sentry integration, Cloud Monitoring dashboards, and alerting policies. Effort: 3 days. Owner: Worker A.
- [ ] **GAP-INFRA-BACKUP-1 — No automated Firestore backups** ([Issue](issues/gap-infra-backup-1-no-firestore-backup.md)) — No Firestore backup strategy. Data loss would be catastrophic and unrecoverable. Need automated daily backups with retention policies and disaster recovery procedures. Effort: 2 days. Owner: Worker A.
- [ ] **GAP-DOC-API-1 — No API documentation for backend** ([Issue](issues/gap-doc-api-1-no-api-documentation.md)) — No API documentation for Cloud Functions. Frontend developers must read backend source code to understand endpoints. Need OpenAPI specification and documentation site. Effort: 2 days. Owner: Worker B.

---

## Backlog — P2 / P3 (Triage once migration stabilizes)

**Worker A:**

- TD-1 → TD-5 technical debt refactors (`search_orchestrator.py`, `firestore_loader.py`, `ai/matcher.py`, pipeline modularization, company info consolidation).
- SP-1 — Batch AI analysis pipeline research.
- SP-2 — Parallel scraping worker pool.
- SP-4 — Rate limiting with exponential backoff (await clarification).
- [ ] **TEST-STARTUP-WORKER** — Python Worker Docker startup tests ([Issue](issues/test-startup-worker-docker.md)) — Create automated tests for `docker compose -f docker-compose.dev.yml up` to verify Docker container startup, graceful shutdown, and restart behavior. Required for dev-monitor integration.
- [ ] **WORKER-WORKFLOW-3 — Add automated worker post-deployment validation** ([Issue](issues/worker-workflow-3-add-validation.md)) — Add automated smoke tests after worker deployments to verify queue processing. Catches broken deployments within minutes. Depends on: WORKER-WORKFLOW-1.

**Worker B:**

- FE-6 — Testing & quality improvements (unit coverage, Storybook, accessibility tooling).
- FE-7 — Monitoring & analytics instrumentation.
- FE-8 — Progressive Web App enhancements.
- [ ] **TEST-STARTUP-FE** — Frontend dev server startup tests ([Issue](issues/test-startup-fe-dev-server.md)) — Create automated tests for `npm run dev` to verify Vite dev server startup, graceful shutdown, port management, and restart behavior. Required for dev-monitor integration.
- [ ] **TEST-STARTUP-BE** — Backend emulator startup tests ([Issue](issues/test-startup-be-emulators.md)) — Create automated tests for Firebase emulators (`npm run serve`) to verify startup, graceful shutdown with data persistence, port management, and restart behavior. Required for dev-monitor integration.

**PM:**

- PM-02 — Technical debt review and documentation alignment post-migration.
- PM-03 — Portfolio cleanup follow-through and archival.
- OPS-OBS-1 — Monitoring & alerting enablement (backlog until post-launch)
- OPS-RUNBOOK-1 — Launch & DNS rollback playbook (defer until closer to public release)
- QA-E2E-1 — Comprehensive E2E smoke in CI (future consideration)
- **Dev Monitor Project** - ⚠️ **LOCAL DEVELOPMENT TOOL ONLY (never deployed)** - See `dev-monitor/COMPLETE_IMPLEMENTATION.md`
  - [x] DEV-MONITOR-1 — Project setup & architecture ✅ Complete
  - [x] DEV-MONITOR-2 — Process management backend ✅ Complete
  - [x] DEV-MONITOR-3 — Real-time log streaming backend ✅ Complete
  - [x] DEV-MONITOR-4 — Service panel UI components ✅ Complete
  - [x] DEV-MONITOR-5 — Logs viewer UI with filters ✅ Complete
  - [x] DEV-MONITOR-6 — Cloud logs integration ✅ Complete
  - [ ] **DEV-MONITOR-FIX-1 — Fix backend ESLint** ([Issue](issues/dev-monitor-fix-1-backend-eslint.md)) — OPTIONAL: Fix broken lint script. Not critical for local-only tool. Estimated: 30 min.
  - [ ] **DEV-MONITOR-FIX-6 — Add workspace scripts** ([Issue](issues/dev-monitor-fix-6-workspace-scripts.md)) — OPTIONAL: Convenience scripts to run both together. Estimated: 30 min.
  - [ ] **DEV-MONITOR-CONSOLIDATE-1 — Centralize all dev scripting in dev-monitor** ([Issue](issues/dev-monitor-consolidate-1-centralize-dev-scripts.md)) — Refactor all dev scripts to eliminate duplication and manage everything exclusively through dev-monitor. Audit scripts across all repos, consolidate common operations, add Scripts panel to UI, remove duplicates. Vision: dev-monitor as single interface for ALL local development. Effort: 2-3 days. Owner: Worker B. **Note**: This supersedes DEV-MONITOR-FIX-6.
  - [ ] **DEV-MONITOR-UI-1 — Multi-panel log viewer with drag & resize** ([Issue](issues/dev-monitor-ui-1-multi-panel-logs.md)) — Add ability to view multiple log sources simultaneously. Phase 1 (2 days): Fixed multi-panel layout with independent source selection and filtering. Phase 2 (1-2 days): Draggable, resizable panels with custom layouts. Total effort: 3-4 days. Owner: Worker B.
  - [ ] ~~DEV-MONITOR-FIX-2~~ — CI/CD workflow - **SKIP** (not needed for local tool)
  - [ ] ~~DEV-MONITOR-FIX-3~~ — Git hooks - **SKIP** (not needed for local tool)
  - [ ] ~~DEV-MONITOR-FIX-4~~ — Prettier - **SKIP** (not needed for local tool)
  - [ ] ~~DEV-MONITOR-FIX-5~~ — Testing - **SKIP** (not needed for local tool)
  - [ ] ~~DEV-MONITOR-SETUP~~ — Superseded by FIX issues (most marked as skip)

---

## Status & Communication Rules

- P0 items stay at the top until fully complete and merged to `staging`.
- Once a task lands on `main`, the PM marks it complete here and the owning worker updates their file.
- If a new urgent task appears, add it here first, then push to the relevant worker file.
- Retired lists (`ACTIVE_TASKS.md`, `PRIORITIZED_TASKS.md`) are archived; do not update them further.

---

## Recently Completed Highlights

- ✅ Architecture cleanup — Removed Portfolio references across repos (2025-10-20).
- ✅ Shared types package — TYPES-1, API-1, and PUBLISH-1 closed with npm v1.1.1 published (2025-10-20).
- ✅ Backend migration (Phase 0) — Repos/worktrees prepared and staging aligned (2025-10-19).

---

## Risk & Watchlist

- Migration sequencing: ensure Worker A and Worker B stay decoupled by working only against `staging` artifacts.
- Deployment readiness: frontend pipeline work must complete before public launch window.
- Technical debt items remain dormant until post-migration; keep stakeholders aware of deferred work.
