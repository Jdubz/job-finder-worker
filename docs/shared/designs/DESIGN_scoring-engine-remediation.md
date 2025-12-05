> Status: Active
> Owner: @jdubz
> Last Updated: 2025-12-04

# Scoring Engine Remediation Plan

Scope: Fix double-weighting of skills/technology, expose `missingRequiredScore` in UI, remove unused `weights` config.

## Problem Statement

1. **Double-Weighting:** Skills and technologies can score twice when the same term appears in both `_score_technology()` and `_score_skills()`.

2. **Missing UI Control:** `missingRequiredScore` (-15 penalty when no required tech found) is configurable in code but not exposed in Settings UI.

3. **Dead Code:** The `weights` config section is loaded but never used.

## Current State

### Double-Weighting

| Scenario | `_score_technology()` | `_score_skills()` | Total |
|----------|----------------------|-------------------|-------|
| "python" in required tech AND user skills | +10 | +2 | +12 (should be +10) |

**Root cause:** `_score_skills()` matches user profile skills against job description text without excluding terms already scored by `_score_technology()`.

### Missing `missingRequiredScore` UI

**Engine:** `engine.py:505-506`
```python
missing_score = self.tech_config.get("missingRequiredScore", -15)
```

**Types:** `config.types.ts:304` - Field exists: `missingRequiredScore?: number`

**UI:** `ScoringConfigTab.tsx:389-410` - NOT exposed (only requiredScore, preferredScore, dislikedScore shown)

### Unused `weights`

**Engine:** `engine.py:90`
```python
self.weights = config["weights"]  # Never used
```

## Implementation Plan

### Phase 1: Deduplicate Skills/Technology Scoring

**File:** `job-finder-worker/src/job_finder/scoring/engine.py`

Modify `score()` to track scored technologies and pass to `_score_skills()`:

```python
def score(self, extraction, job_title, job_description, company_data=None):
    # ... existing code ...

    # 3. Technology scoring
    tech_result = self._score_technology(extraction.technologies)
    scored_tech_set = {t.lower() for t in extraction.technologies}
    # ... existing code ...

    # 6. Skill match scoring - exclude already-scored tech
    skill_result = self._score_skills(job_description, scored_tech_set)
```

Modify `_score_skills()` signature and logic:

```python
def _score_skills(self, description: str, scored_technologies: Optional[Set[str]] = None) -> Dict[str, Any]:
    if not self.user_skills or not description:
        return {"points": 0, "adjustments": []}

    desc_lower = description.lower()
    skills_to_check = self.user_skills
    if scored_technologies:
        skills_to_check = self.user_skills - scored_technologies

    matched_skills = [
        skill for skill in skills_to_check
        if re.search(rf"\b{re.escape(skill)}\b", desc_lower)
    ]
    # ... rest unchanged
```

### Phase 2: Expose `missingRequiredScore` in UI

**File:** `job-finder-FE/src/pages/job-finder-config/components/tabs/ScoringConfigTab.tsx`

Add after line 410 (after dislikedScore field):

```tsx
<NumericField
  control={form.control}
  name="technology.missingRequiredScore"
  label="Missing Required Score"
  description="Penalty when no required tech found (negative)."
  info="Score adjustment when job has none of your required technologies."
/>
```

Update `mapFormToConfig()` around line 58:

```typescript
technology: {
  required: cleanList(values.technology.required),
  preferred: cleanList(values.technology.preferred),
  disliked: cleanList(values.technology.disliked),
  rejected: cleanList(values.technology.rejected),
  requiredScore: values.technology.requiredScore,
  preferredScore: values.technology.preferredScore,
  dislikedScore: values.technology.dislikedScore,
  missingRequiredScore: values.technology.missingRequiredScore,  // ADD
},
```

### Phase 3: Remove Dead `weights` Code

**File:** `job-finder-worker/src/job_finder/scoring/engine.py`

Remove line 90:
```python
self.weights = config["weights"]
```

**File:** `shared/src/config.types.ts`

Remove `ScoringWeights` interface (lines 236-243):
```typescript
// DELETE THIS:
export interface ScoringWeights {
  skillMatch: number
  experienceMatch: number
  seniorityMatch: number
}
```

Remove `weights` from `MatchPolicy` (line 392):
```typescript
export interface MatchPolicy {
  minScore: number
  // weights: ScoringWeights  // DELETE
  seniority: SeniorityConfig
  // ...
}
```

**File:** `job-finder-FE/src/pages/job-finder-config/components/tabs/ScoringConfigTab.tsx`

Remove `weights` from `mapFormToConfig()` (lines 26-30):
```typescript
// DELETE:
weights: {
  skillMatch: values.weights.skillMatch,
  experienceMatch: values.weights.experienceMatch,
  seniorityMatch: values.weights.seniorityMatch,
},
```

## Verification Checklist

### Phase 1
- [ ] `_score_skills()` accepts optional `scored_technologies` parameter
- [ ] Job with "python" in both required tech and user skills scores +10 (not +12)
- [ ] Existing scoring tests pass

### Phase 2
- [ ] `missingRequiredScore` field visible in Technology section
- [ ] Value persists when saved
- [ ] Engine uses saved value

### Phase 3
- [ ] `self.weights` removed from engine
- [ ] `ScoringWeights` removed from types
- [ ] `weights` removed from UI form mapping
- [ ] FE and shared package build

## Files to Modify

| File | Change |
|------|--------|
| `job-finder-worker/src/job_finder/scoring/engine.py` | Dedup logic, remove weights |
| `shared/src/config.types.ts` | Remove ScoringWeights, weights field |
| `job-finder-FE/.../ScoringConfigTab.tsx` | Add missingRequiredScore field, remove weights |

## Success Criteria

1. A term in both required tech and user skills scores once (technology only)
2. `missingRequiredScore` adjustable via Settings UI
3. No `weights` config code remains
