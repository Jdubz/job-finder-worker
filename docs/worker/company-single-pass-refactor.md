# Company Single-Pass Pipeline Refactor

> Status: In Progress
> Owner: @jdubz
> Last Updated: 2025-11-28
- **Goal:** Collapse company processing into a single queue item (fetch → extract → analyze → save) so every company submission yields a hydrated record and optional source discovery without inter-item spawning.

## Problem
- Current granular pipeline (COMPANY_FETCH/EXTRACT/ANALYZE/SAVE) spawns new queue items and is blocked by loop-prevention on the same URL/type, leaving companies stuck after FETCH.
- Pipeline_state and company_sub_task add complexity, duplicate queue rows, and increase failure surface.

## Scope (hard cut)
- Remove company_sub_task and pipeline_state usage for companies across worker, shared types, and API.
- Single-pass processing inside one queue item; no per-step spawning.
- Only allowable spawn: SOURCE_DISCOVERY when a job board is detected and not already present.
- No backward compatibility needed for old rows/endpoints.

## Work Plan
1) **Worker refactor**
   - Replace multi-step CompanyProcessor with single `process_company` that performs fetch → extract → analyze → save and spawns source discovery when needed.
   - Remove company sub-task routing in QueueItemProcessor and spawn helpers in QueueManager.
   - Simplify Company queue intake to create a single item (no sub_task, no pipeline_state).
2) **Shared types + API**
   - Remove `company_sub_task` from queue types and API schemas; adjust job-queue routes/service/repo to omit it.
   - Update FE/consumer types through shared package export.
3) **Tests**
   - Update worker tests for single-pass flow and add coverage for source discovery spawn and failure paths.
   - Update API route/service tests to reflect the new queue shape.
4) **Docs & cleanup**
   - Delete legacy code paths and references to the granular pipeline.
   - Note deprecation of pipeline_state/columns for companies (DB may retain columns until a future migration).

## Progress Log
- 2025-11-28 17:55 UTC: Plan drafted and recorded.
- 2025-11-28 18:25 UTC: Implemented single-pass company processing (worker, shared types, API/FE queue UI), removed company_sub_task plumbing, updated tests (pytest: tests/test_company_pipeline.py), rebuilt shared dist.
- 2025-11-28 20:45 UTC: Fixed dev harness watch (removed sub_task column), validated dev worker mounts host Codex creds.
- 2025-11-28 21:15 UTC: Updated Codex provider to new `codex exec --json` flow with ChatGPT-friendly models (default gpt-5-codex), retried on unsupported models, refreshed AI config defaults/options and tests; reran dev company task to capture failure reason (CLI subcommand mismatch).
- 2025-11-28 21:35 UTC: Retested in dev with Codex CLI; Redis company task succeeded (about/culture/mission/industry/HQ/size/timezone/job board + source discovery). MongoDB initially failed due to Codex exit code 1 despite returning content—provider now parses output even on non-zero exit, and MongoDB rerun succeeded with full hydration and source discovery.
