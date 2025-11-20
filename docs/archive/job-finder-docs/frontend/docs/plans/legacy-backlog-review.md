# Legacy Backlog Review Plan

**Source:** Consolidated from `DISCOVERED_TASKS.md` (2025-10-20 scan)  
**Systems Impacted:** job-finder-worker (queue), job-finder-BE (functions), future product roadmap  
**Owner:** PM / Platform leads  
**Goal:** Triage legacy technical debt and feature ideas into the current planning process (issues + project boards).

## Workstreams

### 1. Worker Technical Debt
- Refactor long functions: `search_orchestrator.py::_process_listing`, `firestore_loader.py::_load_experiences`, `ai/matcher.py::analyze_job`.
- Break down the "God" class (`JobSearchOrchestrator`) into pipeline stages.
- Consolidate company info fetch logic (CompanyInfoFetcher vs CompaniesManager).
- **Action:** Create individual issues in `job-finder-worker` with scope & acceptance criteria.

### 2. Quality & Test Coverage
- Target >80% coverage across worker modules.
- Add docstrings, type hints, and tighten exception handling.
- **Action:** Bundle into a testing/quality epic in `job-finder-worker` (with subtasks for tests, linting, exception cleanup).

### 3. Future Feature Concepts
- Application tracking system (status timeline, reminders).
- Cover letter generation enhancements.
- Job recommendation email digest.
- UI for reviewing matches.
- **Action:** Evaluate against current roadmap; move viable items into product backlog (treated as new feature discovery).

### 4. Scale & Performance Ideas
- Batch AI analysis, parallel scraping, Redis caching, exponential backoff.
- **Action:** Document feasibility in `job-finder-worker` RFCs or spike issues.

### 5. Multi-User & Alerting Concepts
- API layer, auth/roles, subscription tiers, alert manager service.
- **Action:** Capture in product strategy docs; defer until multi-tenant goals resurface.

## Next Steps
1. Create tracked issues/epics for Workstreams 1–2 in `job-finder-worker`.
2. Review Feature/Scale concepts with Product to decide keep vs archive.
3. Update `PROJECT_TASK_LIST.md` or Jira with any live items; note status in this plan.
4. Delete `DISCOVERED_TASKS.md` once triage is logged.

## Status Log
- 2025-10-28: Plan drafted; issue creation pending.
