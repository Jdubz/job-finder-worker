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

This document tracks remaining implementation work.

## Remaining Work

### 1. Location/Timezone Scoring in Matcher

The `LocationConfig` interface exists in `shared/src/config.types.ts` with penalty fields, but the scoring engine does not yet apply these penalties.

**Implementation needed in:** `job-finder-worker/src/job_finder/scoring/engine.py`

```python
def _score_location(self, job: Dict[str, Any]) -> Dict[str, Any]:
    """Score based on location compatibility."""
    location_config = self.config.get("location", {})
    user_city = self.personal_info.get("city", "")
    user_timezone = self.personal_info.get("timezone")
    relocation_allowed = self.personal_info.get("relocationAllowed", False)

    work_type = job.get("work_arrangement", "").lower()
    job_location = job.get("location", "")
    job_timezone = job.get("timezone")

    adjustments = []
    total = 0

    # Remote roles: timezone penalty
    if work_type == "remote" and user_timezone and job_timezone:
        tz_diff = abs(user_timezone - job_timezone)
        max_diff = location_config.get("maxTimezoneDiffHours", 4)
        per_hour = location_config.get("perHourScore", -2)

        if tz_diff > max_diff:
            # Hard penalty for extreme timezone differences
            penalty = location_config.get("hardTimezonePenalty", -50)
            adjustments.append(ScoreAdjustment("location", f"Timezone diff {tz_diff}h exceeds max", penalty))
            total += penalty
        elif tz_diff > 0:
            penalty = tz_diff * per_hour
            adjustments.append(ScoreAdjustment("location", f"Timezone diff {tz_diff}h", penalty))
            total += penalty

    # Onsite/Hybrid: city match or relocation
    if work_type in ("onsite", "hybrid"):
        if user_city and job_location:
            if user_city.lower() not in job_location.lower():
                if not relocation_allowed:
                    # Hard reject - return special marker
                    return {"hard_reject": True, "reason": "Location mismatch, relocation not allowed"}
                else:
                    penalty = location_config.get("relocationScore", -15)
                    adjustments.append(ScoreAdjustment("location", "Relocation required", penalty))
                    total += penalty
            else:
                bonus = location_config.get("hybridSameCityScore", 5)
                adjustments.append(ScoreAdjustment("location", "Same city", bonus))
                total += bonus

    return {"points": total, "adjustments": adjustments}
```

**Tasks:**
- [ ] Add `_score_location()` method to ScoringEngine
- [ ] Integrate location scoring into `calculate_score()` flow
- [ ] Handle hard reject case for location mismatch
- [ ] Add unit tests for location/timezone scoring

### 2. Strike-First Filtering Architecture

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

### 3. Per-Item Config Reload Verification

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
