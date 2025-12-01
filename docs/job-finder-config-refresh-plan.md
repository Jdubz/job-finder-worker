# Job Finder Config & UX Remediation Plan

> Status: Draft
> Owner: Codex (pairing with jdubz)
> Last Updated: 2025-12-01

Date: 2025-12-01
Owner: Codex (pairing with jdubz)
Scope: Align backend/worker behavior, configs, and UI so every config key is live, visible, and applied per task; remove legacy data; improve match/location logic; modernize AI defaults; and refresh the configuration UI/preview experience.

## Objectives
- **Config immediacy:** Every task (scrape, prefilter, match) must re-load the latest configs before processing.
- **Single source of truth:** No legacy/dead config rows. All stored keys are rendered in UI and consumed in worker logic.
- **Correct location handling:** Use user city & timezone; apply nuanced timezone penalties and relocation rules for onsite/hybrid vs remote-first.
- **Tech & experience scoring:** Apply experience strikes and tech-rank weights in the match score (not just prefilter).
- **AI defaults & per-task agents:** Default provider is Gemini; allow per-agent/task provider/interface/model selection (worker, document generator, company discovery, match, etc.).
- **UI clarity & preview:** Clean layout, clear grouping, no wasted space; provide a screenshot generator using real config data for visual QA.

## Workstreams & Steps

### 1) Backend/Worker Config Hygiene
1. Add a lightweight config cache layer that reloads _before each task_ (or per batch item) for:
   - prefilter-policy, match-policy, queue-settings, scheduler-settings, ai-settings, worker-settings, personal-info.
2. Remove support for legacy rows (`job-match`, `job-filters`, `stop-list`, `technology-ranks`) and migrate data into canonical keys; add a one-time migrator that deletes or transforms old rows.
3. Ensure `/config/reload` refreshes: StrikeFilterEngine, QueueManager timeouts, scheduler poll interval, AI provider selections, and any task-delay settings.
4. Wire queue processing delay (`taskDelaySeconds`) into the worker loop if present.

### 2) Location & Timezone Rules (Match & Prefilter Alignment)
1. Store user city and timezone in `personal-info`; ensure FE collects both.
2. In match-policy dealbreakers, add:
   - `relocationAllowed` (bool)
   - `locationPenaltyPoints`, `relocationPenaltyPoints`, `ambiguousLocationPenaltyPoints` (already present)
   - `remoteFirstTolerance` flag to soften timezone penalties when company/job is remote-first unless explicit constraints appear.
3. Scoring rules:
   - Base per-hour penalty from user TZ to job TZ; cap via `hardTimezonePenalty` when exceeding `maxTimezoneDiffHours`.
   - If job is onsite/hybrid and `relocationAllowed` is false and city != user city → hard fail.
   - Hybrid/onsite within same city bypass relocation fail; hybrid in same timezone but different city uses normal penalties.
   - Remote-first jobs reduce or skip timezone penalties unless job text explicitly requires overlap hours.
4. Prefilter should share the same remote/relocation gates as scorer to avoid disagreement.

### 2b) Strike vs Hard-Reject Simplification
1. Adopt **strike-first** filtering: prefer strike accumulation with explicit thresholds; reserve hard rejects only for absolute dealbreakers (e.g., city mismatch when relocation disallowed, forbidden tech `fail`).
2. Consolidate stop lists (companies/keywords/domains) into one source of truth used by both prefilter and matcher; remove duplicate lists (`stopList`, `strikeEngine.hardRejections.*`) so each item is checked once and contributes strikes or a hard fail, not both.
3. Normalize salary logic: single check path that (a) hard-rejects commission-only when configured, (b) applies strike for low max salary, and (c) enforces minSalaryFloor only once.
4. Normalize timezone logic: one function that computes penalties/fails based on user city/timezone, relocation flag, remote-first tolerance, and explicit overlap requirements; reuse in prefilter and matcher to avoid double counting.
5. Document the scoring order: stop-list → hard-fail rules (minimal) → strike accumulation (all dimensions) → final threshold decision.

### 3) Tech & Experience Scoring
1. Reintroduce `experienceStrike` but apply in match scoring (not prefilter). Map to configurable points that subtract from score when required YOE exceeds candidate YOE or when titles imply junior/senior mismatch.
2. Use `technologyRanks` (strike/fail) inside matcher scoring: subtract points for strike tech; hard-reject on fail tech; add small bonus for required/preferred tech presence.
3. Keep prefilter tech checks minimal (only fail techs and blatant mismatches) to avoid double penalties.

### 4) AI Configuration
1. Default provider selection to **Gemini** across tasks when DB is missing.
2. Support per-task agent selection (worker match, document generator, company discovery, scraping assist, prompt analysis). `ai-settings` schema: `{ taskName: { selected, options? } }` with fallbacks.
3. Normalize legacy `selected` to task-specific entries during load; persist upgraded shape.

### 5) UI / UX Improvements
1. Render every config key that exists in the canonical schemas; no hidden/unrendered fields. Add sections for location penalties, relocation flag, taskDelaySeconds, tech strike weights, experience strike weights, per-task AI agents.
2. Improve layout:
   - Responsive tab bar (scrollable on small screens), reduce empty gutters, align forms into 2–3 column grids with clear section headers.
   - Per-section Save/Reset with sticky action bar on scroll.
   - Show “Last updated” and “Updated by” per config card.
3. Add a screenshot generator: button to capture the current config page state (using Playwright or html-to-image) and download/share for QA.
4. Surface validation helptext for timezone/city and relocation semantics.

### 6) Testing & Verification
1. Unit tests for config loader to confirm per-task reload and legacy-pruning migration.
2. Integration tests for worker reload endpoint to ensure new settings apply to the next processed item.
3. Matcher tests covering timezone penalties, relocation fail, remote-first softening, tech strike/fail impacts, experience strike impact.
4. FE component tests for form serialization to ensure no keys are dropped and defaults round-trip.
5. Visual regression via screenshot generator snapshot in CI (optional if headless allowed).

### 7) Migration & Rollout
1. Write a DB migration to drop legacy rows and upgrade `ai-settings` shape; back up prior payloads to a JSON file.
2. Add feature flag (env) to enable per-task reload; default ON in prod.
3. Deploy BE first (routes + worker), then FE; validate by saving configs and confirming immediate effect on next queue item.

## Deliverables
- Updated worker code (config reload, location/tech/experience scoring, AI defaults per task).
- Updated BE config routes/migrations (legacy removal, schema upgrades).
- Updated FE config UI with full key coverage, improved layout, screenshot generator, and tooltips.
- Test suite additions (unit + integration + FE).

## Open Questions
- Do we need a maximum reload frequency to avoid DB thrash, or is per-item acceptable? (default to per-item until performance data says otherwise.)
- For remote-first tolerance, should penalties drop to zero or just reduce (e.g., 50%)? (propose 50% reduction unless explicit overlap hours.)
