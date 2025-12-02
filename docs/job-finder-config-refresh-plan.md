# Job Finder Config & UX Remediation Plan

> Status: Draft
> Owner: Codex (pairing with jdubz)
> Last Updated: 2025-12-01

Scope: Align backend/worker behavior, configs, and UI so every config key is live, visible, and applied per task; remove legacy data; improve match/location logic; modernize AI defaults; and refresh the configuration UI/preview experience.

## Objectives
- **Config immediacy:** Every task (scrape, prefilter, match) reloads fresh configs before processing the next item.
- **Single source of truth:** No legacy/dead config rows; one consolidated stop list; every stored key is rendered in UI and consumed in worker logic.
- **Correct location handling:** Use user city & timezone; timezone penalties apply only to remote roles; onsite/hybrid outside user city hard-reject unless relocation is allowed (then apply relocation penalty).
- **Tech & experience scoring:** Apply experience strikes and tech-rank weights in the match score (prefilter only enforces absolute fail-tech and minimal gates).
- **AI defaults & per-task agents:** Default provider Gemini; per-task provider/interface/model selection (match, company discovery, doc gen, scraping assist, etc.).
- **UI clarity & preview:** Full-key coverage, clear grouping, minimal wasted space; screenshot generator with real data for QA.

## Workstreams & Steps

### Progress log
- 2025-12-01: Updated shared types (personal-info city/timezone/relocationAllowed; match dealbreaker penalty fields), default AI provider to Gemini; started backend runtime reload path (JobProcessor refreshes configs/providers per item) and queue/task delay defaults. Further steps pending: unified stop list, strike-first refactor, relocation/TZ helper, FE/full UI changes, migrations, and tests.
- 2025-12-01: Consolidation work in progress: stop-list now treated as single source; strike engine updated to apply stop-list as strikes, reserved hard rejects remain for explicit hardRejections. Defaults seeded for relocation penalties in shared types. Gemini defaults wired in config loader and per-item refresh scaffolded. Next: relocate TZ/city helper, migration to drop legacy rows, matcher tech/experience scoring shift, FE coverage, screenshot tool.
- 2025-12-01: Direct DB patches applied (ai-settings → Gemini per-task, queue taskDelaySeconds, match location penalties, personal city/timezone/relocationAllowed); location/relocation helper added; taskDelaySeconds applied in worker loop; matcher now applies tech ranks + experience strikes; salary floor moved to strike; FE surfaces new fields and preserves AI tasks on save. Pending: per-task AI UI, screenshot generator, tests for new logic, final strike clean-up.
- 2025-12-02: Matcher scoring tests now mock AI providers and isolate tech/experience strike math (no real LLM calls); ensures regression coverage without costly provider traffic.

### New instructions (Dec 1, 2025)
- Migrations may directly edit the SQLite DB JSON payloads (no schema migration needed); site downtime is acceptable during edits.
- Remove all implicit defaults at runtime: missing configs must fail loudly to surface schema/key mismatches. The only defaults that remain are for type definitions, not runtime fallbacks.

### 1) Backend/Worker Config Hygiene
1. Reload configs **per item** (or batch item) for: prefilter-policy, match-policy, queue-settings, scheduler-settings, ai-settings, worker-settings, personal-info. Avoid stale in-memory copies.
2. Remove legacy rows (`job-match`, `job-filters`, `stop-list`, `technology-ranks`) and migrate data into canonical keys; add one-time migrator that deletes old rows after backup.
3. `/config/reload` must rebuild: StrikeFilterEngine, matcher inputs, QueueManager timeout, scheduler poll interval, AI providers, `taskDelaySeconds`.
4. Apply `taskDelaySeconds` from queue-settings in worker loop.

### 2) Location & Timezone Rules (Match & Prefilter Alignment)
1. Store user city and timezone in `personal-info`; ensure FE collects both.
2. In match-policy dealbreakers, add:
   - `relocationAllowed` (bool)
   - `locationPenaltyPoints`, `relocationPenaltyPoints`, `ambiguousLocationPenaltyPoints` (already present)
   - `remoteFirstTolerance` flag to soften timezone penalties when company/job is remote-first unless explicit constraints appear.
3. Scoring rules:
   - Remote roles only: per-hour penalty from user TZ to job TZ; cap via `hardTimezonePenalty` beyond `maxTimezoneDiffHours`; remote-first jobs still use this rule but are eligible for a reduced penalty if explicitly configured later.
   - Onsite/Hybrid: if city ≠ user city and `relocationAllowed` is false → hard reject. If `relocationAllowed` is true → apply `relocationPenaltyPoints` (configurable) once; no duplicate penalties.
   - Hybrid/onsite within same city bypass relocation fail; timezone penalties apply only to remote roles.
4. Prefilter shares the same city/relocation gates and uses the shared TZ helper to avoid duplicate logic.

### 3) Strike vs Hard-Reject Simplification
1. Adopt **strike-first** filtering: prefer strike accumulation with explicit thresholds; reserve hard rejects only for absolute dealbreakers (e.g., city mismatch when relocation disallowed, forbidden tech `fail`).
2. Consolidate stop lists (companies/keywords/domains) into one source of truth used by both prefilter and matcher; remove duplicate lists (`stopList` vs `hardRejections.*`).
3. Normalize salary logic: one path that (a) hard-rejects commission-only if configured, (b) applies strike for low max salary, (c) enforces `minSalaryFloor` once.
4. Normalize timezone logic: one helper that computes penalties/fails based on user city/timezone and relocation flag; reuse in prefilter and matcher.
5. Document the scoring order: stop-list → hard-fail rules (minimal) → strike accumulation (all dimensions) → final threshold decision.

### 4) Tech & Experience Scoring
1. Apply `experienceStrike` in match scoring (not prefilter). Configurable points for YOE gaps or seniority mismatch.
2. Use `technologyRanks` in matcher scoring: strikes subtract points; `fail` triggers hard reject; small bonuses for required/preferred presence.
3. Prefilter tech checks only handle `fail` tech and obvious mismatches.

### 5) AI Configuration
1. Default provider selection to **Gemini** across tasks when DB is missing.
2. Per-task agent selection (match, company discovery, document generator, scraping assist, prompt analysis). `ai-settings` schema: `{ taskName: { selected, options? } }` with fallbacks.
3. Normalize legacy `selected` to task-specific entries during load; persist upgraded shape.

### 6) UI / UX Improvements
1. Render every config key in canonical schemas; no hidden fields. Sections: stop list, salary, relocation flag/penalty, TZ penalties, taskDelaySeconds, tech strike weights, experience strike weights, per-task AI agents.
2. Layout: responsive scrollable tabs, tighter grids, sticky Save/Reset per card, show “Last updated/by” per card.
3. Screenshot generator to capture current page with real data (Playwright/html-to-image) for QA.
4. Validation helptext for city/timezone and relocation semantics.

### 7) Testing & Verification
1. Unit: config loader per-task refresh; legacy migration; stop-list consolidation.
2. Integration: worker reload applies to next item; taskDelaySeconds honored.
3. Matcher: timezone/relocation rules (remote vs hybrid/onsite), relocation penalty, tech strike/fail, experience strike, remote-only TZ penalty rule.
4. Prefilter: unified stop-list, strike-first salary/keywords (no duplicate hard rejects).
5. FE: form round-trip includes all keys; screenshot generator smoke test.
6. Optional visual regression via screenshot generator in CI.

### 8) Migration & Rollout
1. DB migration: back up existing config rows to JSON, drop legacy rows, add new keys (city, timezone, relocationAllowed, relocationPenaltyPoints, taskDelaySeconds), normalize ai-settings shape.
2. Feature flag (env) for per-task reload; default ON in prod.
3. Deploy BE first (routes + worker), then FE; validate by saving configs and confirming immediate effect on next queue item.

## Deliverables
- Updated worker code (config reload, location/tech/experience scoring, AI defaults per task).
- Updated BE config routes/migrations (legacy removal, schema upgrades).
- Updated FE config UI with full key coverage, improved layout, screenshot generator, and tooltips.
- Test suite additions (unit + integration + FE).

## Open Questions
- Do we need a maximum reload frequency to avoid DB thrash, or is per-item acceptable? (default to per-item until performance data says otherwise.)
- For remote-first tolerance, should penalties drop to zero or just reduce (e.g., 50%)? (propose 50% reduction unless explicit overlap hours.)
