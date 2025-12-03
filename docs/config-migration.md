> Status: Draft
> Owner: Codex
> Last Updated: 2025-12-03

# Config Migration Plan – Consolidate Settings, Remove Legacy Configs, Fail Loudly

Date: 2025-12-02  
Owner: Codex (proposed)  
Scope: prod SQLite `job_finder_config` + worker, backend API, FE settings UI, shared types, tests, docs.

## Goals
1. **Fail loud:** No seeded defaults, no silent fallbacks for missing configs.
2. **Two phase configs only:**  
   - `prefilter-policy` → hard-reject before queue; uses structured gates (title, freshness, work arrangement, employment type, salary floor, rejected tech).  
   - `match-policy` → scoring after extraction; no prefilter logic.
3. **Consolidate settings:** Merge `queue-settings` into `worker-settings`; retire `queue-settings`.
4. **Remove legacy/unused:** Delete `title-filter`, `scoring-config`, `scheduler-settings`; eradicate Firestore code/docs.

## Target Config Shapes
- **prefilter-policy (authoritative for phase 1; current schema)**  
  ```json
  {
    "title": { "requiredKeywords": [...], "excludedKeywords": [...] },
    "freshness": { "maxAgeDays": <number> },
    "workArrangement": {
      "allowRemote": true,
      "allowHybrid": true,
      "allowOnsite": true
    },
    "employmentType": {
      "allowFullTime": true,
      "allowPartTime": true,
      "allowContract": true
    },
    "salary": { "minimum": 80000 },
    "technology": { "rejected": ["php", "wordpress"] }
  }
  ```
- **match-policy (authoritative for phase 2)** – unchanged scoring sections only: `minScore`, `weights`, `seniority`, `location`, `technology`, `salary`, `experience`, `freshness`, `roleFit`, `company`.
- **worker-settings (now includes former queue knobs)**  
  ```
  scraping: { maxHtmlSampleLength }
  textLimits: { maxIntakeTextLength, maxIntakeDescriptionLength, maxIntakeFieldLength,
               maxDescriptionPreviewLength, maxCompanyInfoTextLength,
               minCompanyPageLength, minSparseCompanyInfoLength }
  runtime: {
    processingTimeoutSeconds,
    taskDelaySeconds,
    pollIntervalSeconds,
    isProcessingEnabled,
    scrapeConfig: { target_matches?, max_sources?, source_ids? }
  }
  ```
  Dropped: rateLimitDelaySeconds, maxRetries, maxHtmlSampleLengthSmall, health.*, cache.*.

## Impacted Areas (code, tests, docs)
- **Shared types & guards**
  - `shared/src/config.types.ts`: remove `queue-settings`, `title-filter`, `scoring-config`, `scheduler-settings`; enforce new `prefilter-policy` shape (title, freshness.maxAgeDays, workArrangement, employmentType, salary.minimum, technology.rejected); expand `worker-settings.runtime`; update `JobFinderConfigId`, payload map, defaults removal; adjust comments.
  - `shared/src/guards.ts`: drop `isQueueSettings`; add/rename guard for new worker settings; tighten `isMatchPolicy`/`isPrefilterPolicy` to require all sections.
  - `shared/src/queue.types.ts`, `shared/README.md`, `shared/CHANGELOG.md`: align with new shapes; remove queue settings references.

- **Worker**
  - `src/job_finder/job_queue/config_loader.py`: remove `_seed_config`, `get_queue_settings`, defaults; make `get_worker_settings` fail-fast and return merged runtime fields; update `get_title_filter` removal; update callers to use `prefilter-policy` and `match-policy`.
  - `src/job_finder/filters/title_filter.py`: ensure it can be fed from `prefilter-policy.title`; remove direct config fetch.
  - `src/job_finder/scrape_runner.py`, `scraper_intake.py`, `job_queue/processors/*`, `ai/source_discovery.py`, `ai/matcher.py`, `settings.py`, `flask_worker.py`, `scripts/workers/queue_worker.py`, `cron/submit_scrape.py`: replace `queue-settings` loads with new `worker-settings.runtime`; adjust parameter names, logging; fail if missing.
  - `scripts/migrate_to_match_policy.py`: update to migrate `title-filter` → `prefilter-policy.title`; drop references to `scoring-config`; delete `queue-settings` handling.
  - Tests: `tests/queue/*`, `tests/scoring/*`, `tests/test_config_loader_ai.py`, `tests/test_company_pipeline.py`, `tests/cron/test_submit_scrape.py`, `tests/queue/test_job_pipeline_comprehensive.py` – update fixtures/mocks to new worker-settings shape and required config presence; remove queue-settings seeding.
  - Docs: `docs/worker/README.md`, `docs/worker/architecture/*`, `docs/worker/setup/*`, `docs/worker/architecture/queue-decision-tree.md`, `docs/worker/architecture/pre-filtering.md`, `docs/hybrid-scoring-migration-plan.md` – remove title-filter/queue-settings/seeding references; describe new prefilter-policy role and runtime settings.

- **Backend (API)**
  - `server/src/modules/config/config.routes.ts`: remove seedDefaults; drop `queue-settings` route; tighten validation to fail on missing; add `prefilter-policy` validation; update `worker-settings` schema; ensure `ai-settings` still merges provider availability only.
  - `server/src/modules/config/config.repository.ts`: no change to storage, but ensure missing returns 404 (no auto-create except maybe personal-info? decide).
  - `server/src/scheduler/cron.ts`: read `worker-settings.runtime.scrapeConfig`; remove `queue-settings` guard.
  - Any middleware/validators referencing `QueueSettings`.

- **Frontend**
  - `src/api/config-client.ts`: remove get/updateQueueSettings; add get/updateWorkerSettings (merged shape); remove defaults usage.
  - `pages/job-finder-config`: drop Queue tab; merge runtime settings into Worker tab or rename; update state hook `useConfigState`; adjust save/reset flows; ensure fail-fast when config missing (show error).
  - `pages/queue-management`: point to worker-settings.runtime fields for enable/disable & intervals.
  - Tests/fixtures: `__tests__`, `mockData.ts`, e2e specs (`tests/e2e/job-pipeline.e2e.test.ts`, `job-finder-FE/e2e/owner-config-and-prompts.spec.ts`, queue-management tests) – update mocks and expectations; remove queue defaults.
  - Remove any UI text referencing title-filter config; show prefilter-policy status instead.

- **Data & Migrations**
  - SQLite migration script: merge `queue-settings` into `worker-settings.runtime`, delete `queue-settings` row, delete `title-filter`, `scoring-config`, `scheduler-settings`; migrate `title-filter` keywords into `prefilter-policy.title`.
  - Normalize legacy `prefilter-policy` payloads to the new schema:
    - Map `strikeEngine.ageStrike.rejectDays` (else `strikeDays`) → `freshness.maxAgeDays`.
    - Map `remotePolicy.allowRemote/allowHybrid/allowOnsite` → `workArrangement` booleans.
    - Map `hardRejections.minSalaryFloor` → `salary.minimum`.
    - Derive `technology.rejected` from `technologyRanks` entries with rank `fail` (optionally include `strike` if we want stricter early rejects).
    - Preserve `title` keywords from existing prefilter or from `title-filter` if absent.
  - Backfill missing required fields during migration only (no runtime seeding); abort migration if required sections cannot be populated deterministically.
  - Ensure `job_finder_config` table schema unchanged; only data updates.

- **Firestore removal**
  - Delete or archive: `scripts/import-firestore-to-sqlite.js`; docs under `docs/backend/setup/testing-guide.md`, `docs/worker/setup/testing-guide.md`, `docs/worker/setup/docker-startup.md`, `docs/worker/architecture/queue-decision-tree.md` sections on Firestore.
  - Remove Firestore emulator refs, code samples, and tests (any remaining py tests referencing firestore).

## Migration Steps (execution order)
1. **Schema/types first**: update shared types & guards; remove defaults; bump consumers to new shapes.
2. **Worker config loader**: fail-fast behavior; new `worker-settings.runtime`; drop `queue-settings`/title-filter path.
3. **Refactor worker call sites** to new runtime fields; ensure logging/errors clear on missing config.
4. **Backend API**: remove seeding; drop queue-settings endpoints; add `prefilter-policy` validation; keep 404 on missing.
5. **Frontend**: adjust client methods, tabs, state, and tests; ensure missing config surfaces as UI error.
6. **Data migration**: one-off script to:
   - Copy title-filter keywords → `prefilter-policy.title` (only if title section empty).
   - Normalize legacy prefilter fields → new schema (see Data & Migrations).
   - Merge `queue-settings` into `worker-settings.runtime`.
   - Delete `queue-settings`, `title-filter`, `scoring-config`, `scheduler-settings` rows.
   - Verify `prefilter-policy` & `match-policy` exist post-migration; abort otherwise.
7. **Firestore cleanup**: remove scripts/docs/tests; confirm CI passes without Firestore deps.
8. **Validation pass**: run worker/BE/FE tests; manual smoke: enqueue scrape, process job, confirm prefilter rejects and scoring runs with new configs.
9. **Prod rollout checklist**: backup DB; run migration script; restart services; confirm no 500s on `/api/config/:id`; verify worker startup succeeds; spot-check logs for missing-config errors (should be none).

## Risks & Mitigations
- **Missing required configs after defaults removal** → mitigate by migration script that fails loudly and by pre-deploy validation checklist.
- **Runtime references to removed keys** → exhaustive code search already mapped; plan updates per file list above.
- **User-facing UI changes** → communicate tab rename/removal; ensure deep links updated.

## Deliverables
- Code changes across worker/BE/FE/shared per impact list.
- Migration script (one-off) plus DB backup instruction.
- Updated documentation (prefilter vs match, no Firestore, no seeding).
- Removal of legacy configs in prod SQLite.
