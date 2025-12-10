> Status: Active
> Owner: @jdubz
> Last Updated: 2025-12-10

# Job Finder Config Refresh - Remaining Work

## Background

The following items from the original config refresh plan have been completed:
- Personal-info schema with city/timezone/relocationAllowed fields
- taskDelaySeconds in worker-settings.runtime
- AI defaults to Gemini (via agent manager migration)
- Removal of legacy config rows (migrations applied)
- Config repository infrastructure for per-item reload
- **Location/timezone scoring in matcher**:
  - `ConfigLoader.get_personal_info()` loads user location data
  - `JobProcessor._build_scoring_engine()` merges personal-info into LocationConfig
  - Personal-info values override static config: `timezone→userTimezone`, `city→userCity`, `relocationAllowed`
  - Hybrid/onsite different city: hard reject if `relocationAllowed=false`, else penalty
  - 19 unit tests covering all location scoring scenarios
- **Per-item config reload**:
  - JobProcessor calls `_refresh_runtime_config()` before each job
  - CompanyProcessor calls `_refresh_runtime_config()` before each company
  - SourceProcessor calls `_refresh_runtime_config()` before each source discovery/scrape
  - ConfigLoader returns fresh config on each call (no caching)
  - Integration tests verify config changes apply to next item

This document tracks remaining implementation work.

## Remaining Work

None. Strike accumulation with threshold is implemented end-to-end:
- `StrikeFilterEngine` accumulates strikes with `strike_threshold` in `FilterResult` (default 5) and only hard-rejects true dealbreakers.
- Prefilter uses the same engine before queue submission; queue pipeline uses it during filtering.
- Deterministic scoring + match policy now cover timezone/remote penalties instead of bespoke hard rejects.

Future tweaks (if needed) should be captured as new RFCs; this plan is complete.
