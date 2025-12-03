# Hybrid Scoring Migration - Implementation Plan

## Overview

Migrate from regex-based StrikeFilterEngine to a hybrid AI extraction + deterministic scoring system. This is an **all-at-once hard cutover** with no backwards compatibility.

**Key Changes:**
1. Replace complex regex prefiltering with simple title keyword filter
2. Add AI extraction for semantic job data (seniority, remote status, etc.)
3. Create deterministic ScoringEngine that scores from config (no AI)
4. Remove respawning between pipeline stages - single in-memory flow
5. Delete all legacy strike engine code and configs

---

## Phase 1: Shared Types & Python Models

### 1.1 Update `shared/src/config.types.ts`

**Add new types:**

```typescript
// Title filter config (replaces complex prefilter-policy)
export interface TitleFilterConfig {
  /** Keywords that MUST appear in title (at least one) */
  requiredKeywords: string[]
  /** Keywords that immediately reject a job */
  excludedKeywords: string[]
}

// Scoring config (new config entry)
export interface ScoringConfig {
  /** Minimum score threshold (0-100) */
  minScore: number

  /** Base weights */
  weights: {
    skillMatch: number      // Weight for skill alignment (0-100)
    experienceMatch: number // Weight for experience fit (0-100)
    seniorityMatch: number  // Weight for seniority alignment (0-100)
  }

  /** Seniority preferences */
  seniority: {
    preferred: string[]     // e.g., ["senior", "staff", "lead"]
    acceptable: string[]    // e.g., ["mid"]
    rejected: string[]      // e.g., ["junior", "intern", "entry"]
    preferredBonus: number  // Points for preferred match
    acceptablePenalty: number
    rejectedPenalty: number // Hard penalty (usually large negative)
  }

  /** Remote/location preferences */
  location: {
    allowRemote: boolean
    allowHybrid: boolean
    allowOnsite: boolean
    userTimezone: number           // UTC offset (e.g., -8)
    maxTimezoneDiffHours: number
    perHourPenalty: number
    hybridSameCityBonus: number
  }

  /** Technology preferences */
  technology: {
    required: string[]      // Must have at least one
    preferred: string[]     // Bonus points
    disliked: string[]      // Penalty points
    rejected: string[]      // Hard reject
    requiredBonus: number
    preferredBonus: number
    dislikedPenalty: number
  }

  /** Salary preferences */
  salary: {
    minimum: number | null  // Hard floor
    target: number | null   // Ideal salary
    belowTargetPenalty: number // Per $10k below target
  }

  /** Experience requirements */
  experience: {
    userYears: number       // User's years of experience
    maxRequired: number     // Reject if job requires more than this
    overqualifiedPenalty: number // Penalty per year over job's max
  }
}

// AI extraction result (stored on job listing)
export interface JobExtractionResult {
  /** Detected seniority level */
  seniority: string | null  // "junior" | "mid" | "senior" | "staff" | "lead" | "principal" | null

  /** Remote/hybrid/onsite classification */
  workArrangement: "remote" | "hybrid" | "onsite" | "unknown"

  /** Detected timezone (UTC offset) */
  timezone: number | null

  /** City if onsite/hybrid */
  city: string | null

  /** Parsed salary range */
  salaryMin: number | null
  salaryMax: number | null

  /** Years of experience required */
  experienceMin: number | null
  experienceMax: number | null

  /** Detected technologies */
  technologies: string[]

  /** Job type */
  employmentType: "full-time" | "part-time" | "contract" | "unknown"
}
```

**Current config IDs (post-refresh):**
```typescript
export type JobFinderConfigId =
  | "ai-settings"
  | "ai-prompts"
  | "personal-info"
  | "prefilter-policy"   // title keywords now live here: prefilter-policy.title
  | "match-policy"
  | "worker-settings"    // includes runtime/queue loop settings
```

Defaults: only AI and personal-info ship defaults. Prefilter, match, and worker configs must exist; missing configs should fail loud (no seeding or silent defaults).

**Add type guards:**
```typescript
export function isTitleFilterConfig(obj: unknown): obj is TitleFilterConfig { ... }
export function isScoringConfig(obj: unknown): obj is ScoringConfig { ... }
```

### 1.2 Create `job-finder-worker/src/job_finder/ai/extraction.py`

```python
"""AI-powered job data extraction."""

from dataclasses import dataclass
from typing import List, Optional
from job_finder.ai.providers import AIProvider

@dataclass
class JobExtractionResult:
    """Extracted semantic data from job posting."""
    seniority: Optional[str] = None
    work_arrangement: str = "unknown"  # remote/hybrid/onsite/unknown
    timezone: Optional[float] = None
    city: Optional[str] = None
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None
    experience_min: Optional[int] = None
    experience_max: Optional[int] = None
    technologies: List[str] = None
    employment_type: str = "unknown"

    def __post_init__(self):
        if self.technologies is None:
            self.technologies = []

class JobExtractor:
    """Extract semantic job data using AI."""

    def __init__(self, provider: AIProvider):
        self.provider = provider

    def extract(self, title: str, description: str, location: str) -> JobExtractionResult:
        """Extract structured data from job posting using AI."""
        prompt = self._build_prompt(title, description, location)
        response = self.provider.generate(prompt, max_tokens=500, temperature=0.1)
        return self._parse_response(response)

    def _build_prompt(self, title: str, description: str, location: str) -> str:
        # Structured extraction prompt - see extraction_prompts.py
        ...

    def _parse_response(self, response: str) -> JobExtractionResult:
        # Parse JSON response into dataclass
        ...
```

### 1.3 Create `job-finder-worker/src/job_finder/scoring/engine.py`

```python
"""Deterministic scoring engine - no AI, pure config-driven scoring."""

from dataclasses import dataclass
from typing import Dict, Any, List, Optional

@dataclass
class ScoreBreakdown:
    """Detailed breakdown of score calculation."""
    base_score: int
    final_score: int
    adjustments: List[str]  # Human-readable adjustment descriptions
    passed: bool
    rejection_reason: Optional[str] = None

class ScoringEngine:
    """Calculate job match scores deterministically from config."""

    def __init__(self, config: Dict[str, Any], user_skills: List[str]):
        self.config = config
        self.user_skills = set(s.lower() for s in user_skills)
        self.min_score = config.get("minScore", 60)

    def score(
        self,
        extraction: "JobExtractionResult",
        job_title: str,
        job_description: str,
    ) -> ScoreBreakdown:
        """Calculate match score from extracted data and config."""
        adjustments = []
        score = 50  # Start at neutral

        # Seniority scoring
        seniority_adj = self._score_seniority(extraction.seniority)
        score += seniority_adj["points"]
        if seniority_adj["reason"]:
            adjustments.append(seniority_adj["reason"])

        # Check for hard reject on seniority
        if seniority_adj.get("hard_reject"):
            return ScoreBreakdown(
                base_score=50,
                final_score=0,
                adjustments=adjustments,
                passed=False,
                rejection_reason=f"Rejected seniority: {extraction.seniority}",
            )

        # Location/timezone scoring
        location_adj = self._score_location(extraction)
        score += location_adj["points"]
        if location_adj["reason"]:
            adjustments.append(location_adj["reason"])

        # Technology scoring
        tech_adj = self._score_technology(extraction.technologies)
        score += tech_adj["points"]
        adjustments.extend(tech_adj.get("reasons", []))

        # Check for hard reject on technology
        if tech_adj.get("hard_reject"):
            return ScoreBreakdown(
                base_score=50,
                final_score=0,
                adjustments=adjustments,
                passed=False,
                rejection_reason=f"Rejected technology detected",
            )

        # Salary scoring
        salary_adj = self._score_salary(extraction.salary_min, extraction.salary_max)
        score += salary_adj["points"]
        if salary_adj["reason"]:
            adjustments.append(salary_adj["reason"])

        # Experience scoring
        exp_adj = self._score_experience(extraction.experience_min, extraction.experience_max)
        score += exp_adj["points"]
        if exp_adj["reason"]:
            adjustments.append(exp_adj["reason"])

        # Skill match scoring (from description text matching)
        skill_adj = self._score_skills(job_description)
        score += skill_adj["points"]
        if skill_adj["reason"]:
            adjustments.append(skill_adj["reason"])

        # Clamp to 0-100
        final_score = max(0, min(100, score))
        passed = final_score >= self.min_score

        return ScoreBreakdown(
            base_score=50,
            final_score=final_score,
            adjustments=adjustments,
            passed=passed,
            rejection_reason=None if passed else f"Score {final_score} below threshold {self.min_score}",
        )

    def _score_seniority(self, seniority: Optional[str]) -> Dict[str, Any]:
        """Score based on seniority match."""
        ...

    def _score_location(self, extraction: "JobExtractionResult") -> Dict[str, Any]:
        """Score based on location/remote/timezone."""
        ...

    def _score_technology(self, technologies: List[str]) -> Dict[str, Any]:
        """Score based on technology match."""
        ...

    def _score_salary(self, min_sal: Optional[int], max_sal: Optional[int]) -> Dict[str, Any]:
        """Score based on salary range."""
        ...

    def _score_experience(self, min_exp: Optional[int], max_exp: Optional[int]) -> Dict[str, Any]:
        """Score based on experience requirements."""
        ...

    def _score_skills(self, description: str) -> Dict[str, Any]:
        """Score based on skill keywords in description."""
        ...
```

### 1.4 Create `job-finder-worker/src/job_finder/filters/title_filter.py`

```python
"""Simple title keyword filter - replaces complex StrikeFilterEngine."""

from dataclasses import dataclass
from typing import Dict, Any, List, Optional

@dataclass
class TitleFilterResult:
    """Result of title filtering."""
    passed: bool
    reason: Optional[str] = None

class TitleFilter:
    """Fast title-based pre-filter using simple keyword matching."""

    def __init__(self, config: Dict[str, Any]):
        self.required = [k.lower() for k in config.get("requiredKeywords", [])]
        self.excluded = [k.lower() for k in config.get("excludedKeywords", [])]

    def filter(self, title: str) -> TitleFilterResult:
        """Check if title passes keyword filters."""
        title_lower = title.lower()

        # Check excluded keywords first (fast reject)
        for keyword in self.excluded:
            if keyword in title_lower:
                return TitleFilterResult(
                    passed=False,
                    reason=f"Title contains excluded keyword: {keyword}",
                )

        # Check required keywords (must have at least one)
        if self.required:
            has_required = any(kw in title_lower for kw in self.required)
            if not has_required:
                return TitleFilterResult(
                    passed=False,
                    reason=f"Title missing required keywords: {self.required}",
                )

        return TitleFilterResult(passed=True)
```

---

## Phase 2: Update Job Processor Pipeline

### 2.1 Modify `job-finder-worker/src/job_finder/job_queue/processors/job_processor.py`

**Remove:**
- `_respawn_job_with_state()` method
- All `pipeline_state` handling for multi-stage processing
- Stage-specific handlers: `_do_filter_stage()`, `_do_analyze_stage()`, `_do_save_stage()`

**Replace with single in-memory pipeline:**

```python
class JobProcessor:
    """Process job queue items through the full pipeline in a single task."""

    def __init__(self, ...):
        # ... existing init ...
        self.title_filter = TitleFilter(config_loader.get_title_filter())
        self.extractor = JobExtractor(self._create_provider())
        self.scoring_engine = ScoringEngine(
            config_loader.get_scoring_config(),
            profile.get_all_skills(),
        )

    def process(self, item: JobQueueItem) -> ProcessingResult:
        """Process job through complete pipeline in-memory."""
        job_data = item.scraped_data or item.input.get("scraped_data", {})

        # Stage 1: Title Filter (fast, no AI)
        title = job_data.get("title", "")
        filter_result = self.title_filter.filter(title)
        if not filter_result.passed:
            return self._mark_filtered(item, filter_result.reason)

        # Stage 2: AI Extraction (semantic understanding)
        extraction = self.extractor.extract(
            title=title,
            description=job_data.get("description", ""),
            location=job_data.get("location", ""),
        )

        # Stage 3: Deterministic Scoring (config-driven)
        score_result = self.scoring_engine.score(
            extraction=extraction,
            job_title=title,
            job_description=job_data.get("description", ""),
        )

        if not score_result.passed:
            return self._mark_filtered(item, score_result.rejection_reason)

        # Stage 4: AI Match Analysis (detailed reasoning - expensive model)
        match_result = self.matcher.analyze_job(job_data, extraction, score_result)

        # Stage 5: Save (persist to DB)
        return self._save_match(item, match_result, extraction, score_result)
```

### 2.2 Update `job-finder-worker/src/job_finder/job_queue/config_loader.py`

**Ensure ConfigLoader exposes only current configs:**
```python
def get_prefilter_policy(self) -> Dict[str, Any]:
    return self._get_config("prefilter-policy")

def get_match_policy(self) -> Dict[str, Any]:
    return self._get_config("match-policy")

def get_worker_settings(self) -> Dict[str, Any]:
    return self._get_config("worker-settings")
```

---

## Phase 3: Update Backend API

### 3.1 Modify `job-finder-BE/server/src/modules/config/config.routes.ts`

**Config router should:**
- Fail loud on missing configs (no seedDefaults); only allow IDs: `ai-settings`, `ai-prompts`, `personal-info`, `prefilter-policy`, `match-policy`, `worker-settings`.
- Validate with guards `isAISettings`, `isPreFilterPolicy`, `isMatchPolicy`, `isWorkerSettings`, `isPersonalInfo`.
- Coerce only current IDs; no legacy fallbacks or merges for queue/title/scoring/scheduler.

**Validate payloads:** ensure only current IDs are accepted; legacy IDs should return 400/404.

---

## Phase 4: Frontend Updates

### 4.x Frontend Config UI (current state)

- Single **PrefilterPolicyTab** surfaces title keywords + other prefilter gates from `prefilter-policy` (the only prefilter config).
- **MatchPolicyTab** continues to edit `match-policy` (full scoring config).
- Worker runtime settings live under `worker-settings.runtime` (Queue tab).
- Tabs: prefilter | scoring | queue | ai | personal.

---

## Phase 5: Delete Legacy Code

### 5.1 Delete Python Files

```bash
# Remove legacy filter engine
rm job-finder-worker/src/job_finder/filters/strike_filter_engine.py

# Remove timezone utils (no longer needed)
rm job-finder-worker/src/job_finder/utils/timezone_utils.py

# Remove related tests
rm job-finder-worker/tests/filters/test_strike_filter_engine.py
rm job-finder-worker/tests/test_filters.py  # if only tests StrikeFilterEngine
```

### 5.2 Update `job-finder-worker/src/job_finder/filters/__init__.py`

```python
"""Job filtering system."""

from job_finder.filters.models import FilterRejection, FilterResult  # Keep for compatibility
from job_finder.filters.title_filter import TitleFilter, TitleFilterResult

__all__ = [
    "TitleFilter",
    "TitleFilterResult",
    "FilterResult",      # Deprecated but kept for transition
    "FilterRejection",   # Deprecated but kept for transition
]
```

### 5.3 Update `job-finder-worker/src/job_finder/ai/matcher.py`

**Remove methods:**
- `_detect_work_arrangement()` (lines 218-271) - moved to extraction.py
- `_calculate_adjusted_score()` (lines 273-529) - moved to scoring engine
- `_calculate_location_penalty()` (lines 531-582) - moved to scoring engine
- `_apply_technology_ranks()` (lines 584-616) - moved to scoring engine
- `_apply_experience_strike()` (lines 618-631) - moved to scoring engine

**Keep:**
- `analyze_job()` - but simplify to only generate match reasoning/recommendations
- Resume intake data generation

### 5.4 Update `job-finder-worker/src/job_finder/scrape_runner.py`

Replace `StrikeFilterEngine` usage with `TitleFilter`:

```python
from job_finder.filters.title_filter import TitleFilter

class ScrapeRunner:
    def __init__(self, ...):
        ...
        self.title_filter = TitleFilter(config_loader.get_title_filter())
        self.scraper_intake = ScraperIntake(
            ...
            title_filter=self.title_filter,  # Changed parameter
        )
```

### 5.5 Delete Frontend Files

```bash
rm job-finder-FE/src/pages/job-finder-config/components/tabs/PrefilterPolicyTab.tsx
# Also remove MatchPolicyTab.tsx if it exists
```

### 5.6 Delete Legacy Config Data from SQLite

```sql
-- Run via migration or manual script
DELETE FROM job_finder_config WHERE id = 'prefilter-policy';
DELETE FROM job_finder_config WHERE id = 'match-policy';
```

---

## Phase 6: Data Migration

### 6.1 Migrate Existing Config Values

Create a one-time script to migrate values from legacy configs to new configs:

```python
def migrate_configs(db_path: str):
    """Migrate prefilter-policy and match-policy to new configs."""

    # Load legacy configs
    prefilter = load_config(db_path, "prefilter-policy")
    match = load_config(db_path, "match-policy")

    # Build canonical prefilter-policy (including title keywords) from legacy
    prefilter_policy = migrate_prefilter(prefilter)

    # Build canonical match-policy from legacy
    match_policy = migrate_match_policy(match)

    # Save new configs
    save_config(db_path, "prefilter-policy", prefilter_policy)
    save_config(db_path, "match-policy", match_policy)

    # DELETE any legacy configs after migration
    for legacy_id in legacy_ids_to_delete:
        delete_config(db_path, legacy_id)
```

---

## Phase 7: Testing

### 7.1 New Test Files

```bash
# Create new tests
job-finder-worker/tests/filters/test_title_filter.py
job-finder-worker/tests/ai/test_extraction.py
job-finder-worker/tests/scoring/test_engine.py
```

### 7.2 Update Existing Tests

- `tests/job_queue/processors/test_job_processor.py` - Update for new single-pass pipeline
- `tests/test_scrape_runner.py` - Update for TitleFilter

### 7.3 Integration Test

Create end-to-end test that verifies:
1. Job enters queue
2. Title filter passes/rejects correctly
3. AI extraction returns structured data
4. Scoring engine produces expected scores
5. Match is saved with correct data

---

## Execution Order

1. **Shared types** (config.types.ts) - Foundation for everything
2. **Python models** (extraction.py, scoring/engine.py, title_filter.py) - Core logic
3. **Config loader updates** - Enable loading new configs
4. **Job processor rewrite** - New pipeline flow
5. **Backend API updates** - Serve new configs
6. **Frontend tabs** - User can configure
7. **Migration script** - Move data to new format
8. **Delete legacy code** - Clean up
9. **Tests** - Verify everything works

---

## Files to Create

| File | Description |
|------|-------------|
| `shared/src/config.types.ts` | Update with new types |
| `job-finder-worker/src/job_finder/ai/extraction.py` | AI job data extraction |
| `job-finder-worker/src/job_finder/ai/extraction_prompts.py` | Extraction prompt templates |
| `job-finder-worker/src/job_finder/scoring/__init__.py` | Module init |
| `job-finder-worker/src/job_finder/scoring/engine.py` | Deterministic scoring |
| `job-finder-worker/src/job_finder/scoring/config.py` | Config loading helpers |
| `job-finder-worker/src/job_finder/filters/title_filter.py` | Simple title filter |
| `job-finder-FE/src/pages/.../TitleFilterTab.tsx` | Title filter UI |
| `job-finder-FE/src/pages/.../ScoringConfigTab.tsx` | Scoring config UI |

## Files to Delete

| File | Reason |
|------|--------|
| `job-finder-worker/src/job_finder/filters/strike_filter_engine.py` | Replaced by title_filter + scoring |
| `job-finder-worker/src/job_finder/utils/timezone_utils.py` | Logic moved to scoring engine |
| `job-finder-worker/tests/filters/test_strike_filter_engine.py` | Testing deleted code |
| `job-finder-FE/src/pages/.../PrefilterPolicyTab.tsx` | Replaced by new tabs |

## Files to Modify

| File | Changes |
|------|---------|
| `job_processor.py` | Remove respawning, implement single-pass pipeline |
| `config_loader.py` | Add new config methods, remove legacy |
| `matcher.py` | Remove scoring methods (keep match reasoning only) |
| `scrape_runner.py` | Use TitleFilter instead of StrikeFilterEngine |
| `scraper_intake.py` | Use TitleFilter |
| `filters/__init__.py` | Export TitleFilter instead of StrikeFilterEngine |
| `config.routes.ts` | Handle new config types |
| `guards.ts` | Add type guards for new configs |
