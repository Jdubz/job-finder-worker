> Status: Active
> Owner: @jdubz
> Last Updated: 2025-12-09

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

This document tracks remaining implementation work.

## Remaining Work

### 1. Strike-First Filtering Architecture

Current state uses hard rejects liberally. The plan calls for strike accumulation with thresholds.

**Concept:**
- Most conditions add strikes (negative points) rather than hard rejecting
- Hard rejects reserved only for absolute dealbreakers (explicit `fail` tech, location mismatch without relocation)
- Strike threshold determines pass/fail

**Implementation approach:**
```python
class StrikeAccumulator:
    def __init__(self, threshold: int):
        self.threshold = threshold
        self.strikes = []

    def add_strike(self, reason: str, points: int):
        self.strikes.append({"reason": reason, "points": points})

    @property
    def total(self) -> int:
        return sum(s["points"] for s in self.strikes)

    @property
    def should_reject(self) -> bool:
        return self.total >= self.threshold
```

**Tasks:**
- [ ] Design strike accumulation vs hard reject boundaries
- [ ] Refactor prefilter to use strike accumulation
- [ ] Update matcher to use consistent strike logic
- [ ] Document scoring order: stop-list -> hard-fail -> strikes -> threshold

### 2. Per-Item Config Reload Verification

Infrastructure exists but needs verification that worker processors actually reload config per item.

**Tasks:**
- [ ] Verify JobProcessor reloads config per item (not just per batch)
- [ ] Verify CompanyProcessor reloads config per item
- [ ] Verify SourceProcessor reloads config per item
- [ ] Add integration test confirming config changes apply to next item

## Open Questions

- For remote-first tolerance, should penalties drop to zero or reduce by 50%?
- What should the default strike threshold be?
- Should timezone penalties apply to "remote-first" companies differently than generic remote?
