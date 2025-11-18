# Documentation Migration Tracker

**Repository:** job-finder-docs  
**Last Updated:** 2025-10-29  
**Owner:** _Unassigned (Codex authoring initial draft)_  

This tracker enumerates every Markdown document that currently lives inside `job-finder-docs` and records the intended destination, required action, and migration status. The end-state goal is for this repository to contain only cross-team planning artifacts (e.g., documents under `docs/plans/`) while all product- or service-specific documentation lives in the active service repositories (`app-monitor`, `job-finder-FE`, `job-finder-BE`, `job-finder-worker`, `job-finder-shared-types`).

## Status Legend

| Status        | Meaning                                                                 |
| ------------- | ----------------------------------------------------------------------- |
| Pending       | Identified but no migration work has started                            |
| In Progress   | Being reviewed, updated, or relocated                                   |
| Blocked       | Awaiting decision/clarification before work can continue                |
| Completed     | Document migrated/deleted and verified                                  |

## Root-Level Markdown Files

| Source Path | Destination Repo | Planned Action | Status | Notes |
| ----------- | ---------------- | -------------- | ------ | ----- |
| ACTIVE_TASKS.md | job-finder-docs (remove) | Delete after confirming history covers context | Completed | Removed 2025-10-28; info already centralized in `PROJECT_TASK_LIST.md` |
| API_CONTRACT_MISMATCHES.md | job-finder-FE | Split findings into FE issue doc | Completed | Relocated 2025-10-28 as `job-finder-FE/docs/development/api-contract-mismatches.md` |
| AUTOMATED_SETUP.md | job-finder-docs | Move into processes directory | Completed | Relocated 2025-10-28 as `docs/processes/github-project-automation.md` |
| BACKLOG.md | job-finder-docs (remove) | Delete once backlog captured in Jira/`PROJECT_TASK_LIST.md` | Completed | Removed 2025-10-28; backend migration phases already tracked in `docs/architecture/BACKEND_MIGRATION_PLAN.md` and `PROJECT_TASK_LIST.md` |
| CLAUDE_SHARED.md | job-finder-docs | Retain (planning context) | Completed | Moved 2025-10-28 to `docs/processes/team-context/shared-context.md` |
| CLAUDE_WORKER_A.md | job-finder-docs | Retain (planning context) | Completed | Moved 2025-10-28 to `docs/processes/team-context/backend-context.md` |
| CLAUDE_WORKER_B.md | job-finder-docs | Retain (planning context) | Completed | Moved 2025-10-28 to `docs/processes/team-context/frontend-context.md` |
| COMPLETED.md | job-finder-docs (remove) | Delete after confirming accomplishments documented elsewhere | Completed | Removed 2025-10-28; archival notes preserved in git history |
| COMPREHENSIVE_GAP_ANALYSIS.md | job-finder-docs → shared architecture repo | Extract architecture gaps into shared docs | Completed | Relocated 2025-10-28 as `docs/plans/comprehensive-gap-analysis.md` (serves as master backlog summary) |
| DEV_MONITOR_REVIEW_SUMMARY.md | app-monitor | Move into `app-monitor/docs/dev-monitor/` with updated terminology and links | Completed | Relocated 2025-10-28 as `app-monitor/docs/dev-monitor/APP_MONITOR_IMPLEMENTATION_REVIEW_SUMMARY.md` |
| CONTRIBUTING.md | job-finder-docs (remove) | Delete; each repo maintains its own contributing guide | Completed | Replaced 2025-10-29 with pointer advising contributors to use repo-specific guides (`docs/processes/NEW_WORKFLOW_SUMMARY.md`) |
| IMPLEMENTATION_SUMMARY.md | app-monitor | Move into app-monitor docs/dev-monitor | Completed | Relocated 2025-10-28 as `app-monitor/docs/dev-monitor/APP_MONITOR_IMPLEMENTATION_SUMMARY.md` with updated run instructions |
| DEV_SCRIPTING_REFACTOR_PLAN.md | app-monitor | Move into `app-monitor/docs/plans` with updated terminology | Completed | Relocated 2025-10-28 as `app-monitor/docs/plans/APP_MONITOR_SCRIPTING_REFACTOR_PLAN.md` |
| DEV_SCRIPTING_SESSION_SUMMARY.md | app-monitor | Move into `app-monitor/docs/dev-monitor` | Completed | Relocated 2025-10-28 as `app-monitor/docs/dev-monitor/APP_MONITOR_SCRIPTING_SESSION_SUMMARY.md` |
| DISCOVERED_TASKS.md | job-finder-docs (remove) | Delete after tasks merged into active backlog | Completed | Replaced with `docs/plans/legacy-backlog-review.md`; original removed 2025-10-28 |
| DNS_SETUP_ACTION_REQUIRED.md | job-finder-FE | Move under FE operations/active | Completed | Relocated 2025-10-28 as `job-finder-FE/docs/operations/active/dns-setup-action-required.md` |
| EXPERIENCE_PAGE_FIX_SUMMARY.md | job-finder-FE | Move into FE operations archive | Completed | Relocated 2025-10-28 as `job-finder-FE/docs/operations/completed/experience-page-fix-summary.md` |
| FIRESTORE_COMPLETE_SETUP.md | job-finder-BE | Move into BE docs/migration | Completed | Relocated 2025-10-28 as `job-finder-BE/docs/operations/firestore/firestore-complete-setup.md` |
| FIRESTORE_CONNECTION_FIX.md | job-finder-BE | Move into BE docs/migration | Completed | Relocated 2025-10-28 as `job-finder-BE/docs/operations/firestore/firestore-connection-fix.md` |
| FIRESTORE_DATA_RESTORATION.md | job-finder-BE | Move into BE docs/migration | Completed | Relocated 2025-10-28 as `job-finder-BE/docs/operations/firestore/firestore-data-restoration.md` |
| FIRESTORE_SCHEMA_CODIFICATION.md | job-finder-shared-types | Move into shared-types schema docs | Completed | Relocated 2025-10-28 as `job-finder-shared-types/docs/firestore-schema-codification.md` |
| FIRESTORE_SCHEMA_MIGRATION.md | job-finder-BE | Move into BE docs/migration | Completed | Relocated 2025-10-28 as `job-finder-BE/docs/operations/firestore/firestore-schema-migration.md` |
| FIRESTORE_SETUP_COMPLETE.md | job-finder-BE | Move into BE docs/migration | Completed | Relocated 2025-10-28 as `job-finder-BE/docs/operations/firestore/firestore-setup-complete.md` |
| FIRESTORE_SUBSCRIPTION_FIX.md | job-finder-FE | Move into FE docs/operations with context | Completed | Relocated 2025-10-28 as `job-finder-FE/docs/operations/completed/firestore-subscription-fix.md` |
| FIRESTORE_PERMISSIONS_ROOT_CAUSE.md | job-finder-FE | Archive in FE operations/completed | Completed | Relocated 2025-10-28 as `job-finder-FE/docs/operations/completed/firestore-permissions-root-cause.md` |
| GITHUB_PROJECT_SETUP_GUIDE.md | job-finder-docs | Move into processes as manual fallback | Completed | Relocated 2025-10-28 as `docs/processes/github-project-manual-setup.md` |
| LOGGING_ARCHITECTURE.md | Shared architecture repo | Split into app-monitor implementation + shared overview | Completed | Content merged into `docs/architecture/structured-logging-overview.md` and `app-monitor/docs/dev-monitor/structured-logging.md`; legacy doc removed 2025-10-28 |
| NPM_PUBLISHING_SETUP.md | job-finder-shared-types | Move into shared-types docs/publishing | Completed | Relocated 2025-10-28 as `job-finder-shared-types/docs/npm-publishing-setup.md` |
| PHASE_2_COMPLETE.md | job-finder-docs (remove) | Delete after capturing outcomes in roadmap | Completed | Archived 2025-10-28 under `docs/archive/completed/PHASE_2_COMPLETE.md` |
| PHASE_2_MAKEFILE_DEPRECATION.md | job-finder-docs | Move into app-monitor docs/history | Completed | Archived 2025-10-28 under `docs/archive/completed/PHASE_2_MAKEFILE_DEPRECATION.md` (records worker migration) |
| PHASE_3_COMPLETE.md | job-finder-docs (remove) | Delete after archiving milestone notes | Completed | Archived 2025-10-28 under `docs/archive/completed/PHASE_3_COMPLETE.md` |
| PHASE_3_SCRIPT_CONSOLIDATION.md | job-finder-docs | Move into app-monitor docs/dev-monitor | Completed | Archived 2025-10-28 under `docs/archive/completed/PHASE_3_SCRIPT_CONSOLIDATION.md` |
| PRIORITIZED_TASKS.md | job-finder-docs (remove) | Delete once priorities tracked elsewhere | Completed | Removed 2025-10-28; priorities maintained in `PROJECT_TASK_LIST.md` |
| PROJECT_MANAGEMENT_SUMMARY.md | job-finder-docs | Retain (planning reference) | Completed | Relocated 2025-10-28 as `docs/processes/project-management/system-summary.md` |
| PROJECT_TASK_LIST.md | job-finder-docs | Retain as authoritative backlog | Completed | Moved 2025-10-28 to `docs/plans/project-task-list.md`; root file now pointer + docs/plans/project-task-list-pointer.md |
| README.md | job-finder-docs | Rewrite to describe new planning-only repo | Completed | Rewritten 2025-10-29 to outline planning scope, key directories, and service repo links |
| SECURITY.md | job-finder-BE | Move into BE security documentation | Completed | Reauthored 2025-10-29 as `job-finder-BE/docs/security/security-policy.md`; removed legacy root file |
| SESSION_SUMMARY_2025-10-21.md | job-finder-docs (archive/delete) | Delete after extracting architecture notes | Completed | Retired 2025-10-29; key actions captured in `docs/processes/BRANCH_PROTOCOLS.md`, structured logging overview, and service runbooks |
| STRUCTURED_LOGGING_MIGRATION.md | shared architecture repo + service docs | Split high-level overview and push service specifics to owners | Completed | Stub now points to `docs/architecture/structured-logging-overview.md` and service runbooks |
| SCRIPTS_PANEL_FRONTEND_COMPLETE.md | app-monitor | Move into app-monitor docs/dev-monitor | Completed | Relocated 2025-10-28 as `app-monitor/docs/dev-monitor/APP_MONITOR_SCRIPTS_PANEL_FRONTEND_COMPLETE.md` |
| SCRIPTS_PANEL_IMPLEMENTATION.md | app-monitor | Move into app-monitor docs/dev-monitor | Completed | Relocated 2025-10-28 as `app-monitor/docs/dev-monitor/APP_MONITOR_SCRIPTS_PANEL_IMPLEMENTATION.md` |
| SYNC_PRODUCTION_DATA.md | job-finder-worker | Move into worker ops docs | Completed | Reauthored 2025-10-29 as `job-finder-worker/docs/operations/sync-production-data.md`; original root file removed |
| WORKTREE_SETUP.md | job-finder-docs (remove) | Delete; worktree approach deprecated | Completed | Deleted 2025-10-28 after merging workflow guidance into `docs/processes/BRANCH_PROTOCOLS.md`; .bak retained under dev-bots volumes for audit |

_Next section will catalog `/docs`, `/issues`, and service subdirectories. This initial draft focuses on root-level Markdown pending full expansion._

## `docs/` Directory (Initial Entries)

| Source Path | Destination Repo | Planned Action | Status | Notes |
| ----------- | ---------------- | -------------- | ------ | ----- |
| docs/DEV_MONITOR_REQUIREMENTS.md | app-monitor | Moved to `app-monitor/docs/dev-monitor/DEV_MONITOR_REQUIREMENTS.md` with updated issue references | Completed | Relocated 2025-10-28 as part of dev-monitor documentation migration |

## `docs/issues/` Directory

| Source Path | Destination Repo | Planned Action | Status | Notes |
| ----------- | ---------------- | -------------- | ------ | ----- |
| docs/issues/worker-cicd-1-setup-github-actions.md | job-finder-worker | Move into `job-finder-worker/docs/issues/` after verifying instructions are current | Completed | Copied 2025-10-29 to `job-finder-worker/docs/issues/worker-cicd-1-setup-github-actions.md`; legacy copy deleted |
| docs/issues/worker-doc-1-api-documentation.md | job-finder-worker | Move into `job-finder-worker/docs/issues/` (update links if structure differs) | Completed | Copied 2025-10-29 to `job-finder-worker/docs/issues/worker-doc-1-api-documentation.md`; legacy copy deleted |
| docs/issues/worker-sec-1-security-audit.md | job-finder-worker | Review, update for current security posture, then move | Completed | Copied 2025-10-29 to `job-finder-worker/docs/issues/worker-sec-1-security-audit.md`; validated references, deleted source |
| docs/issues/worker-test-1-improve-test-coverage.md | job-finder-worker | Review and migrate to worker issue docs | Completed | Copied 2025-10-29 to `job-finder-worker/docs/issues/worker-test-1-improve-test-coverage.md`; includes updated coverage targets |
| docs/issues/worker-workflow-1-add-test-requirements.md | job-finder-worker | Confirm deployment workflow details, then move | Completed | Copied 2025-10-29 to `job-finder-worker/docs/issues/worker-workflow-1-add-test-requirements.md`; safe deploy notes verified |

## `issues/` (App Monitor Issues)

| Source Path | Destination Repo | Planned Action | Status | Notes |
| ----------- | ---------------- | -------------- | ------ | ----- |
| issues/dev-monitor-*.md | app-monitor | Moved to `app-monitor/docs/issues/app-monitor-*.md` with terminology updated to App Monitor | Completed | 18 specs migrated 2025-10-28; accuracy review still required post-move |

## `dev-monitor/` Directory (Legacy App Monitor Docs)

| Source Path | Destination Repo | Planned Action | Status | Notes |
| ----------- | ---------------- | -------------- | ------ | ----- |
| dev-monitor/COMPLETE_IMPLEMENTATION.md | app-monitor | Verify content, update commands, move into `app-monitor/docs/dev-monitor/` | Completed | Relocated 2025-10-28 as `app-monitor/docs/dev-monitor/APP_MONITOR_COMPLETE_IMPLEMENTATION.md` (review overlap with implementation summary) |
| dev-monitor/CONFIG_FIX.md | app-monitor | Review accuracy (post-split config), migrate if still relevant | Completed | Relocated 2025-10-28 as `app-monitor/docs/dev-monitor/APP_MONITOR_CONFIG_FIX.md` |
| dev-monitor/FIREBASE_EMULATOR_WARNINGS.md | app-monitor | Validate warnings remain accurate, move into troubleshooting docs | Completed | Relocated 2025-10-28 as `app-monitor/docs/dev-monitor/APP_MONITOR_FIREBASE_EMULATOR_WARNINGS.md` |
| dev-monitor/ISSUES_CREATED.md | app-monitor | Confirm issue mapping covered in tracker, migrate or retire | Completed | Deleted 2025-10-28 (details now live in `app-monitor/docs/issues/app-monitor-test-*.md`) |
| dev-monitor/MULTI_PANEL_LOGS_IMPLEMENTATION.md | app-monitor | Update terminology and move alongside UI implementation docs | Completed | Relocated 2025-10-28 as `app-monitor/docs/dev-monitor/APP_MONITOR_MULTI_PANEL_LOGS_IMPLEMENTATION.md` |
| dev-monitor/README.md | app-monitor | Compare with current `app-monitor/README.md`, merge unique guidance then delete | Completed | Deleted 2025-10-28 (content already covered in `app-monitor/README.md` and `DEV_MONITOR_REQUIREMENTS.md`) |
| dev-monitor/SERVICE_STARTUP_FIX.md | app-monitor | Review for ongoing relevance, move if still useful | Completed | Relocated 2025-10-28 as `app-monitor/docs/dev-monitor/APP_MONITOR_SERVICE_STARTUP_FIX.md` |
| dev-monitor/TESTING_PLAN.md | app-monitor | Evaluate if testing plan still desired; migrate to docs/testing or delete | Completed | Relocated 2025-10-28 as `app-monitor/docs/dev-monitor/APP_MONITOR_TESTING_PLAN.md` |
| dev-monitor/TESTING_QUICKSTART.md | app-monitor | Update and move to `app-monitor/docs/dev-monitor/testing/` (or delete if obsolete) | Completed | Relocated 2025-10-28 as `app-monitor/docs/dev-monitor/APP_MONITOR_TESTING_QUICKSTART.md` |
| dev-monitor/WORKER_B_SESSION_COMPLETE.md | app-monitor | Determine if session recap needed; move to archive if kept | Completed | Deleted 2025-10-28 (info superseded by scripting + makefile plan docs) |

## `dev-monitor/docs/` Subdirectory

| Source Path | Destination Repo | Planned Action | Status | Notes |
| ----------- | ---------------- | -------------- | ------ | ----- |
| dev-monitor/docs/decision-tree.md | job-finder-worker | Move into `job-finder-worker/docs/` | Completed | Relocated 2025-10-28 as `job-finder-worker/docs/decision-tree.md` (worker queue reference) |
| dev-monitor/docs/decision-tree-implementation-plan.md | job-finder-worker | Move into worker docs alongside decision tree | Completed | Relocated 2025-10-28 as `job-finder-worker/docs/decision-tree-implementation-plan.md` |
| dev-monitor/docs/phase1-typescript-changes.md | job-finder-shared-types | Verify relevance, migrate or archive | Completed | Relocated 2025-10-28 as `job-finder-shared-types/docs/decision-tree-phase1-typescript.md` |
| dev-monitor/docs/issues/dev-monitor-ui-1-multi-panel-layout.md | app-monitor | Convert to `app-monitor/docs/issues/app-monitor-ui-1-multi-panel-layout.md` | Completed | Deleted 2025-10-28 after merging content into `app-monitor/docs/issues/app-monitor-ui-1-multi-panel-logs.md` |
| dev-monitor/docs/issues/dev-monitor-ui-2-source-selectors.md | app-monitor | Convert to `app-monitor/docs/issues/app-monitor-ui-2-source-selectors.md` | Completed | Relocated 2025-10-28 with updated metadata and paths |
| dev-monitor/docs/issues/dev-monitor-ui-3-copyable-panels.md | app-monitor | Convert to `app-monitor/docs/issues/app-monitor-ui-3-copyable-panels.md` | Completed | Relocated 2025-10-28 with updated metadata and file paths |
| dev-monitor/docs/issues/dev-monitor-context-1-implement-context-providers.md | app-monitor | Convert to `app-monitor/docs/issues/app-monitor-context-1-implement-context-providers.md` | Completed | Relocated 2025-10-28 with updated metadata |
| dev-monitor/docs/issues/dev-monitor-client-1-add-fe-log-source.md | app-monitor | Convert to `app-monitor/docs/issues/app-monitor-client-1-add-fe-log-source.md` | Completed | Relocated 2025-10-28 with updated paths and terminology |
| dev-monitor/docs/issues/dev-monitor-stdout-1-capture-stdout-streams.md | app-monitor | Convert to `app-monitor/docs/issues/app-monitor-stdout-1-capture-stdout-streams.md` | Completed | Relocated 2025-10-28 with updated paths |
