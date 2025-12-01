# Hybrid Scoring Migration Plan

## Overview

Replace the fragile programmatic filtering system with a hybrid approach that uses AI for semantic extraction and deterministic scoring on clean structured data.

**Migration Type:** Hard cutover (no backwards compatibility)
**Estimated Effort:** 3-4 days of implementation

---

## Architecture Comparison

### Current Architecture (Remove)
```
SCRAPE → STRIKE FILTER → AI ANALYSIS → SCORE ADJUSTMENTS → SAVE
              ↓               ↓              ↓
         600 jobs         170 jobs      3 jobs matched
         (regex-based)    (full analysis)  (fragile scoring)
```

**Problems:**
- Regex patterns cause false positives ("Circuit-Based Interpretability" matches "based in")
- Hardcoded penalties (-80 relocation, -40 age) crush good jobs
- Timezone detection is fragile (hardcoded city mappings)
- Salary/date parsing incomplete
- Context-blind (can't distinguish boilerplate from requirements)

### New Architecture (Implement)
```
SCRAPE → TITLE FILTER → AI EXTRACTION → DETERMINISTIC SCORING → DETAILED ANALYSIS
              ↓               ↓                  ↓                     ↓
         ~10% filtered   Extract JSON      Score from clean       Only if score > 70
         (fast, cheap)   (semantic)        structured data        (resume guidance)
```

**Benefits:**
- AI handles all semantic understanding
- No regex parsing of job descriptions
- Single source of truth for extracted data
- Deterministic, debuggable scoring math
- ~500 lines of fragile code removed

---

## Implementation Phases

### Phase 1: Create AI Extraction System

#### 1.1 Define Extraction Schema

Create new file: `src/job_finder/ai/extraction.py`

```python
from pydantic import BaseModel, Field
from typing import Optional, List
from enum import Enum

class WorkArrangementType(str, Enum):
    REMOTE = "remote"
    HYBRID = "hybrid"
    ONSITE = "onsite"
    UNKNOWN = "unknown"

class SeniorityLevel(str, Enum):
    INTERN = "intern"
    JUNIOR = "junior"
    MID = "mid"
    SENIOR = "senior"
    STAFF = "staff"
    PRINCIPAL = "principal"
    DIRECTOR = "director"
    VP = "vp"
    UNKNOWN = "unknown"

class WorkArrangement(BaseModel):
    type: WorkArrangementType
    location_required: Optional[str] = None
    relocation_required: bool = False
    timezone_expectations: Optional[str] = None
    timezone_offset: Optional[float] = None  # UTC offset if detectable

class Compensation(BaseModel):
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None
    currency: str = "USD"
    includes_equity: bool = False
    is_contract: bool = False
    hourly_rate: Optional[int] = None

class Seniority(BaseModel):
    level: SeniorityLevel
    years_experience_min: Optional[int] = None
    years_experience_max: Optional[int] = None
    is_management: bool = False
    is_lead: bool = False

class TechnologyStack(BaseModel):
    required: List[str] = Field(default_factory=list)
    preferred: List[str] = Field(default_factory=list)
    mentioned: List[str] = Field(default_factory=list)

class RoleFitSignals(BaseModel):
    is_engineering_role: bool = True
    is_backend: bool = False
    is_frontend: bool = False
    is_fullstack: bool = False
    is_devops_sre: bool = False
    is_ml_ai: bool = False
    is_data: bool = False
    is_security: bool = False
    requires_clearance: bool = False
    is_consulting: bool = False

class JobFreshness(BaseModel):
    posted_date: Optional[str] = None  # ISO format
    days_old: Optional[int] = None
    is_repost: bool = False

class JobExtraction(BaseModel):
    """Structured data extracted from job listing by AI."""
    work_arrangement: WorkArrangement
    compensation: Compensation
    seniority: Seniority
    technology_stack: TechnologyStack
    role_fit_signals: RoleFitSignals
    job_freshness: JobFreshness

    # AI's initial assessment
    initial_fit_score: int = Field(ge=0, le=100)
    fit_reasoning: str
    red_flags: List[str] = Field(default_factory=list)
    green_flags: List[str] = Field(default_factory=list)
```

#### 1.2 Create Extraction Prompt

Create new file: `src/job_finder/ai/extraction_prompts.py`

```python
EXTRACTION_SYSTEM_PROMPT = """You are a job listing analyzer. Extract structured data from job postings.

Return ONLY valid JSON matching the schema. No markdown, no explanations.

Key guidelines:
- work_arrangement.type: Infer from context. "Remote-friendly" = remote. Location listed without remote mention = likely onsite/hybrid.
- work_arrangement.relocation_required: Only true if explicitly states relocation needed. Boilerplate like "headquartered in SF" is NOT relocation requirement.
- compensation: Convert all salaries to annual USD. "150k" = 150000. If hourly, set hourly_rate instead.
- seniority.level: Infer from title and requirements. "5+ years" typically = senior.
- technology_stack.required: Only tech explicitly marked as required/must-have.
- technology_stack.preferred: Tech marked as nice-to-have or preferred.
- technology_stack.mentioned: All other tech mentioned in the listing.
- initial_fit_score: 0-100 score based on how well this matches a senior software engineer seeking remote work.
- red_flags: Concerning signals (clearance required, excessive travel, low pay, etc.)
- green_flags: Positive signals (remote-first, good tech stack, growth opportunity, etc.)
"""

EXTRACTION_USER_PROMPT = """Extract structured data from this job listing:

**Title:** {title}
**Company:** {company}
**Location:** {location}
**Posted:** {posted_date}
**Salary:** {salary}

**Description:**
{description}

Return JSON matching the JobExtraction schema."""
```

#### 1.3 Create Extraction Service

Add to `src/job_finder/ai/extraction.py`:

```python
class JobExtractor:
    """Extract structured data from job listings using AI."""

    def __init__(self, provider: AIProvider, config: Optional[dict] = None):
        self.provider = provider
        self.config = config or {}

    def extract(self, job_data: dict) -> Optional[JobExtraction]:
        """Extract structured data from job listing."""
        prompt = EXTRACTION_USER_PROMPT.format(
            title=job_data.get("title", ""),
            company=job_data.get("company", ""),
            location=job_data.get("location", ""),
            posted_date=job_data.get("posted_date", ""),
            salary=job_data.get("salary", ""),
            description=job_data.get("description", "")[:8000],  # Truncate long descriptions
        )

        response = self.provider.generate(
            prompt,
            system_prompt=EXTRACTION_SYSTEM_PROMPT,
            max_tokens=2000,
            temperature=0.1,  # Low temperature for consistent extraction
        )

        return self._parse_response(response)

    def _parse_response(self, response: str) -> Optional[JobExtraction]:
        """Parse AI response into JobExtraction model."""
        try:
            # Clean response (remove markdown if present)
            cleaned = response.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("```")[1]
                if cleaned.startswith("json"):
                    cleaned = cleaned[4:]

            data = json.loads(cleaned)
            return JobExtraction(**data)
        except (json.JSONDecodeError, ValidationError) as e:
            logger.error(f"Failed to parse extraction response: {e}")
            return None
```

---

### Phase 2: Create Deterministic Scoring Engine

#### 2.1 Define Scoring Configuration

Create new file: `src/job_finder/scoring/config.py`

```python
from pydantic import BaseModel
from typing import Dict, List

class WorkArrangementScoring(BaseModel):
    remote_bonus: int = 10
    hybrid_penalty: int = 0
    onsite_penalty: int = -20
    relocation_penalty: int = -50
    unknown_penalty: int = -10

    # Timezone penalties (per hour of difference)
    timezone_penalty_per_hour: int = -3
    max_timezone_hours: int = 8  # Hard reject beyond this

class CompensationScoring(BaseModel):
    min_salary_floor: int = 100000  # Hard reject below this
    target_salary: int = 200000
    below_target_penalty_per_10k: int = -2
    equity_bonus: int = 5
    contract_penalty: int = -15

class SeniorityScoring(BaseModel):
    preferred_levels: List[str] = ["senior", "staff", "principal"]
    intern_penalty: int = -100  # Hard reject
    junior_penalty: int = -100  # Hard reject
    mid_penalty: int = -10
    management_penalty: int = -20
    director_plus_penalty: int = -15

class TechnologyScoring(BaseModel):
    # Tech the user wants to work with (bonus if present)
    desired_tech: Dict[str, int] = {
        "python": 5,
        "typescript": 5,
        "kubernetes": 5,
        "go": 3,
        "rust": 3,
        "react": 3,
    }
    # Tech the user wants to avoid (penalty if required)
    undesired_tech: Dict[str, int] = {
        "php": -10,
        "cobol": -20,
        "salesforce": -15,
        ".net": -5,
        "java": -5,
    }

class RoleFitScoring(BaseModel):
    engineering_bonus: int = 5
    backend_bonus: int = 5
    ml_ai_bonus: int = 10
    devops_sre_bonus: int = 3
    frontend_penalty: int = -5
    consulting_penalty: int = -20
    clearance_penalty: int = -100  # Hard reject

class FreshnessScoring(BaseModel):
    fresh_bonus_days: int = 2  # Jobs <= this get bonus
    fresh_bonus: int = 10
    stale_threshold_days: int = 7
    stale_penalty: int = -20
    very_stale_days: int = 14
    very_stale_penalty: int = -40

class ScoringConfig(BaseModel):
    """Complete scoring configuration."""
    work_arrangement: WorkArrangementScoring = WorkArrangementScoring()
    compensation: CompensationScoring = CompensationScoring()
    seniority: SeniorityScoring = SeniorityScoring()
    technology: TechnologyScoring = TechnologyScoring()
    role_fit: RoleFitScoring = RoleFitScoring()
    freshness: FreshnessScoring = FreshnessScoring()

    # Thresholds
    min_match_score: int = 70
    high_priority_threshold: int = 85

    # Base score from AI extraction
    ai_score_weight: float = 0.6  # 60% AI score, 40% adjustments
```

#### 2.2 Create Scoring Engine

Create new file: `src/job_finder/scoring/engine.py`

```python
from dataclasses import dataclass, field
from typing import List, Optional
from job_finder.ai.extraction import JobExtraction
from job_finder.scoring.config import ScoringConfig

@dataclass
class ScoreAdjustment:
    category: str
    reason: str
    points: int

@dataclass
class ScoringResult:
    passed: bool
    final_score: int
    ai_base_score: int
    adjustments: List[ScoreAdjustment] = field(default_factory=list)
    hard_reject_reason: Optional[str] = None
    priority: str = "medium"  # high, medium, low

class ScoringEngine:
    """Deterministic scoring engine using extracted job data."""

    def __init__(self, config: ScoringConfig, user_timezone: float = -8):
        self.config = config
        self.user_timezone = user_timezone

    def score(self, extraction: JobExtraction) -> ScoringResult:
        """Calculate score from extracted job data."""
        adjustments = []
        hard_reject = None

        # Start with AI's assessment (weighted)
        ai_score = extraction.initial_fit_score
        base_score = int(ai_score * self.config.ai_score_weight)
        adjustments.append(ScoreAdjustment(
            category="ai_assessment",
            reason=f"AI initial score: {ai_score}",
            points=base_score
        ))

        # Check hard rejects first
        hard_reject = self._check_hard_rejects(extraction)
        if hard_reject:
            return ScoringResult(
                passed=False,
                final_score=0,
                ai_base_score=ai_score,
                adjustments=adjustments,
                hard_reject_reason=hard_reject
            )

        # Apply all scoring adjustments
        adjustments.extend(self._score_work_arrangement(extraction))
        adjustments.extend(self._score_compensation(extraction))
        adjustments.extend(self._score_seniority(extraction))
        adjustments.extend(self._score_technology(extraction))
        adjustments.extend(self._score_role_fit(extraction))
        adjustments.extend(self._score_freshness(extraction))

        # Calculate final score
        total_adjustment = sum(a.points for a in adjustments)
        final_score = max(0, min(100, total_adjustment))

        # Determine priority
        if final_score >= self.config.high_priority_threshold:
            priority = "high"
        elif final_score >= self.config.min_match_score:
            priority = "medium"
        else:
            priority = "low"

        return ScoringResult(
            passed=final_score >= self.config.min_match_score,
            final_score=final_score,
            ai_base_score=ai_score,
            adjustments=adjustments,
            priority=priority
        )

    def _check_hard_rejects(self, extraction: JobExtraction) -> Optional[str]:
        """Check for conditions that immediately reject a job."""
        cfg = self.config

        # Clearance required
        if extraction.role_fit_signals.requires_clearance:
            return "Security clearance required"

        # Too junior
        if extraction.seniority.level in ["intern", "junior"]:
            return f"Seniority too junior: {extraction.seniority.level}"

        # Salary too low
        if extraction.compensation.salary_max:
            if extraction.compensation.salary_max < cfg.compensation.min_salary_floor:
                return f"Salary ${extraction.compensation.salary_max:,} below floor ${cfg.compensation.min_salary_floor:,}"

        # Timezone too far (for non-remote)
        if extraction.work_arrangement.type != "remote":
            if extraction.work_arrangement.timezone_offset is not None:
                tz_diff = abs(extraction.work_arrangement.timezone_offset - self.user_timezone)
                if tz_diff > cfg.work_arrangement.max_timezone_hours:
                    return f"Timezone difference {tz_diff}h exceeds max {cfg.work_arrangement.max_timezone_hours}h"

        return None

    def _score_work_arrangement(self, extraction: JobExtraction) -> List[ScoreAdjustment]:
        """Score work arrangement (remote/hybrid/onsite)."""
        cfg = self.config.work_arrangement
        adjustments = []
        wa = extraction.work_arrangement

        # Work type scoring
        if wa.type == "remote":
            adjustments.append(ScoreAdjustment("work_arrangement", "Remote position", cfg.remote_bonus))
        elif wa.type == "hybrid":
            adjustments.append(ScoreAdjustment("work_arrangement", "Hybrid position", cfg.hybrid_penalty))
        elif wa.type == "onsite":
            adjustments.append(ScoreAdjustment("work_arrangement", "Onsite position", cfg.onsite_penalty))
        else:
            adjustments.append(ScoreAdjustment("work_arrangement", "Unknown work arrangement", cfg.unknown_penalty))

        # Relocation penalty
        if wa.relocation_required:
            adjustments.append(ScoreAdjustment("work_arrangement", "Relocation required", cfg.relocation_penalty))

        # Timezone penalty for non-remote
        if wa.type != "remote" and wa.timezone_offset is not None:
            tz_diff = abs(wa.timezone_offset - self.user_timezone)
            if tz_diff > 0:
                penalty = int(tz_diff * cfg.timezone_penalty_per_hour)
                adjustments.append(ScoreAdjustment("timezone", f"{tz_diff}h timezone difference", penalty))

        return adjustments

    def _score_compensation(self, extraction: JobExtraction) -> List[ScoreAdjustment]:
        """Score compensation package."""
        cfg = self.config.compensation
        adjustments = []
        comp = extraction.compensation

        # Salary scoring (use max salary for comparison)
        if comp.salary_max:
            if comp.salary_max < cfg.target_salary:
                diff = cfg.target_salary - comp.salary_max
                penalty = (diff // 10000) * cfg.below_target_penalty_per_10k
                adjustments.append(ScoreAdjustment(
                    "compensation",
                    f"Salary ${comp.salary_max:,} below target ${cfg.target_salary:,}",
                    penalty
                ))

        # Equity bonus
        if comp.includes_equity:
            adjustments.append(ScoreAdjustment("compensation", "Includes equity", cfg.equity_bonus))

        # Contract penalty
        if comp.is_contract:
            adjustments.append(ScoreAdjustment("compensation", "Contract position", cfg.contract_penalty))

        return adjustments

    def _score_seniority(self, extraction: JobExtraction) -> List[ScoreAdjustment]:
        """Score seniority level."""
        cfg = self.config.seniority
        adjustments = []
        sen = extraction.seniority

        # Level scoring
        if sen.level == "mid":
            adjustments.append(ScoreAdjustment("seniority", "Mid-level position", cfg.mid_penalty))
        elif sen.level in ["director", "vp"]:
            adjustments.append(ScoreAdjustment("seniority", f"{sen.level} level", cfg.director_plus_penalty))

        # Management penalty
        if sen.is_management:
            adjustments.append(ScoreAdjustment("seniority", "Management role", cfg.management_penalty))

        return adjustments

    def _score_technology(self, extraction: JobExtraction) -> List[ScoreAdjustment]:
        """Score technology stack."""
        cfg = self.config.technology
        adjustments = []
        tech = extraction.technology_stack

        # Check all tech (required + preferred + mentioned)
        all_tech = set(t.lower() for t in tech.required + tech.preferred + tech.mentioned)

        # Desired tech bonuses
        for tech_name, bonus in cfg.desired_tech.items():
            if tech_name.lower() in all_tech:
                adjustments.append(ScoreAdjustment("technology", f"Uses {tech_name}", bonus))

        # Undesired tech penalties (only for required tech)
        required_lower = set(t.lower() for t in tech.required)
        for tech_name, penalty in cfg.undesired_tech.items():
            if tech_name.lower() in required_lower:
                adjustments.append(ScoreAdjustment("technology", f"Requires {tech_name}", penalty))

        return adjustments

    def _score_role_fit(self, extraction: JobExtraction) -> List[ScoreAdjustment]:
        """Score role fit signals."""
        cfg = self.config.role_fit
        adjustments = []
        signals = extraction.role_fit_signals

        if signals.is_engineering_role:
            adjustments.append(ScoreAdjustment("role_fit", "Engineering role", cfg.engineering_bonus))

        if signals.is_backend:
            adjustments.append(ScoreAdjustment("role_fit", "Backend focus", cfg.backend_bonus))

        if signals.is_ml_ai:
            adjustments.append(ScoreAdjustment("role_fit", "ML/AI focus", cfg.ml_ai_bonus))

        if signals.is_devops_sre:
            adjustments.append(ScoreAdjustment("role_fit", "DevOps/SRE focus", cfg.devops_sre_bonus))

        if signals.is_frontend and not signals.is_fullstack:
            adjustments.append(ScoreAdjustment("role_fit", "Frontend-only role", cfg.frontend_penalty))

        if signals.is_consulting:
            adjustments.append(ScoreAdjustment("role_fit", "Consulting role", cfg.consulting_penalty))

        return adjustments

    def _score_freshness(self, extraction: JobExtraction) -> List[ScoreAdjustment]:
        """Score job freshness."""
        cfg = self.config.freshness
        adjustments = []
        fresh = extraction.job_freshness

        if fresh.days_old is not None:
            if fresh.days_old <= cfg.fresh_bonus_days:
                adjustments.append(ScoreAdjustment("freshness", f"Fresh job ({fresh.days_old}d old)", cfg.fresh_bonus))
            elif fresh.days_old > cfg.very_stale_days:
                adjustments.append(ScoreAdjustment("freshness", f"Very stale ({fresh.days_old}d old)", cfg.very_stale_penalty))
            elif fresh.days_old > cfg.stale_threshold_days:
                adjustments.append(ScoreAdjustment("freshness", f"Stale ({fresh.days_old}d old)", cfg.stale_penalty))

        if fresh.is_repost:
            adjustments.append(ScoreAdjustment("freshness", "Reposted job", -5))

        return adjustments
```

---

### Phase 3: Simplify Pre-Filter

#### 3.1 Create Minimal Title Filter

Create new file: `src/job_finder/filters/title_filter.py`

```python
"""
Minimal pre-filter for job titles.

Only performs fast, cheap checks before AI extraction.
All semantic understanding delegated to AI.
"""

import re
from dataclasses import dataclass
from typing import List, Optional

@dataclass
class TitleFilterResult:
    passed: bool
    rejection_reason: Optional[str] = None

class TitleFilter:
    """Fast pre-filter based on job title only."""

    # Keywords that indicate engineering roles
    ENGINEERING_KEYWORDS = [
        "software", "engineer", "developer", "swe", "sde",
        "backend", "frontend", "fullstack", "full stack", "full-stack",
        "devops", "sre", "platform", "infrastructure",
        "ml", "machine learning", "data engineer", "ai engineer",
        "security engineer", "cloud engineer",
    ]

    # Keywords that indicate non-engineering roles (hard reject)
    NON_ENGINEERING_KEYWORDS = [
        "recruiter", "recruiting", "talent acquisition",
        "sales", "account executive", "account manager",
        "marketing", "content", "copywriter",
        "hr", "human resources", "people ops",
        "finance", "accounting", "controller",
        "legal", "counsel", "attorney",
        "admin", "assistant", "coordinator",
        "support", "customer success",
    ]

    def __init__(
        self,
        engineering_keywords: Optional[List[str]] = None,
        non_engineering_keywords: Optional[List[str]] = None,
        excluded_companies: Optional[List[str]] = None,
    ):
        self.engineering_keywords = [
            k.lower() for k in (engineering_keywords or self.ENGINEERING_KEYWORDS)
        ]
        self.non_engineering_keywords = [
            k.lower() for k in (non_engineering_keywords or self.NON_ENGINEERING_KEYWORDS)
        ]
        self.excluded_companies = [
            c.lower() for c in (excluded_companies or [])
        ]

    def filter(self, title: str, company: str = "") -> TitleFilterResult:
        """
        Quick filter based on title and company.

        Returns passed=True if job should proceed to AI extraction.
        """
        title_lower = title.lower()
        company_lower = company.lower()

        # Check excluded companies
        for excluded in self.excluded_companies:
            if excluded in company_lower:
                return TitleFilterResult(
                    passed=False,
                    rejection_reason=f"Excluded company: {excluded}"
                )

        # Check for non-engineering keywords (hard reject)
        for keyword in self.non_engineering_keywords:
            if self._word_match(keyword, title_lower):
                return TitleFilterResult(
                    passed=False,
                    rejection_reason=f"Non-engineering role: {keyword}"
                )

        # Check for engineering keywords (must have at least one)
        has_engineering_keyword = any(
            self._word_match(k, title_lower) for k in self.engineering_keywords
        )

        if not has_engineering_keyword:
            return TitleFilterResult(
                passed=False,
                rejection_reason="No engineering keywords in title"
            )

        return TitleFilterResult(passed=True)

    def _word_match(self, keyword: str, text: str) -> bool:
        """Match keyword with word boundaries."""
        if " " in keyword:
            return keyword in text
        pattern = r"\b" + re.escape(keyword) + r"\b"
        return bool(re.search(pattern, text))
```

---

### Phase 4: Update Job Processor Pipeline

#### 4.1 Modify Pipeline Stages

Update `src/job_finder/job_queue/processors/job_processor.py`:

**Remove:**
- All strike filter engine references
- `_do_job_filter()` method (replace with simpler version)
- Complex score adjustment logic in AI matcher integration
- Timezone detection utilities usage
- Salary parsing utilities usage

**New pipeline stages:**

```python
class JobProcessor(BaseProcessor):
    """Process job queue items through new hybrid pipeline."""

    def __init__(self, ...):
        # Remove: self.strike_filter
        # Add:
        self.title_filter = TitleFilter(
            excluded_companies=config.get("excludedCompanies", [])
        )
        self.job_extractor = JobExtractor(self.ai_provider)
        self.scoring_engine = ScoringEngine(
            config=ScoringConfig(**config.get("scoring", {})),
            user_timezone=config.get("userTimezone", -8)
        )
        self.ai_matcher = AIJobMatcher(...)  # Keep for detailed analysis

    async def _do_job_filter(self, item: JobQueueItem, state: dict) -> ProcessResult:
        """Stage 2: Quick title-based pre-filter."""
        job_data = state["job_data"]

        result = self.title_filter.filter(
            title=job_data.get("title", ""),
            company=job_data.get("company", "")
        )

        if not result.passed:
            self._update_listing_status(listing_id, "filtered")
            return ProcessResult(
                status=QueueItemStatus.FILTERED,
                message=result.rejection_reason
            )

        state["title_filter_passed"] = True
        return ProcessResult(status=QueueItemStatus.PROCESSING)

    async def _do_job_extract(self, item: JobQueueItem, state: dict) -> ProcessResult:
        """Stage 3: AI extraction of structured data."""
        job_data = state["job_data"]

        extraction = self.job_extractor.extract(job_data)
        if extraction is None:
            return ProcessResult(
                status=QueueItemStatus.FAILED,
                message="AI extraction failed"
            )

        state["extraction"] = extraction.model_dump()
        return ProcessResult(status=QueueItemStatus.PROCESSING)

    async def _do_job_score(self, item: JobQueueItem, state: dict) -> ProcessResult:
        """Stage 4: Deterministic scoring from extracted data."""
        extraction = JobExtraction(**state["extraction"])

        result = self.scoring_engine.score(extraction)

        state["scoring_result"] = {
            "passed": result.passed,
            "final_score": result.final_score,
            "ai_base_score": result.ai_base_score,
            "adjustments": [a.__dict__ for a in result.adjustments],
            "hard_reject_reason": result.hard_reject_reason,
            "priority": result.priority,
        }

        if not result.passed:
            self._update_listing_status(
                listing_id,
                "skipped",
                analysis_result=state["scoring_result"]
            )
            return ProcessResult(
                status=QueueItemStatus.SKIPPED,
                message=f"Score {result.final_score} below threshold"
            )

        return ProcessResult(status=QueueItemStatus.PROCESSING)

    async def _do_job_analyze(self, item: JobQueueItem, state: dict) -> ProcessResult:
        """Stage 5: Detailed AI analysis (only if score passed)."""
        # Only runs for jobs that passed scoring
        # Generates resume intake data, detailed match analysis
        job_data = state["job_data"]
        scoring_result = state["scoring_result"]

        match_result = self.ai_matcher.analyze_job(
            job_data,
            return_below_threshold=False,
            pre_score=scoring_result["final_score"]  # Pass pre-calculated score
        )

        if match_result is None:
            return ProcessResult(
                status=QueueItemStatus.FAILED,
                message="AI analysis failed"
            )

        state["match_result"] = match_result.to_dict()
        return ProcessResult(status=QueueItemStatus.PROCESSING)
```

---

### Phase 5: Remove Deprecated Code

#### Files to Delete
```
src/job_finder/filters/strike_filter_engine.py
src/job_finder/utils/timezone_utils.py  # If only used by strike filter
tests/filters/test_strike_filter_engine.py
```

#### Code to Remove from Existing Files

**`src/job_finder/ai/matcher.py`:**
- Remove `_detect_work_arrangement()` method
- Remove `_calculate_location_penalty()` method
- Remove `_calculate_adjusted_score()` adjustments (freshness, timezone, company size, role preference)
- Keep: `_analyze_match()`, `_generate_intake_data()`, `_build_match_result()`
- Simplify: Accept pre-calculated score instead of recalculating

**`src/job_finder/job_queue/processors/job_processor.py`:**
- Remove strike filter initialization
- Remove dealbreaker syncing logic
- Remove complex company dependency for scoring

**`src/job_finder/job_queue/config_loader.py`:**
- Remove `get_prefilter_policy()` or simplify drastically
- Update `get_match_policy()` to use new ScoringConfig schema

**`src/job_finder/utils/date_utils.py`:**
- Keep `parse_job_date()` for extraction fallback
- Remove `calculate_freshness_adjustment()` (now in ScoringEngine)

---

### Phase 6: Database Schema Updates

#### Update job_listings table

```sql
-- Add extraction_result column for structured data
ALTER TABLE job_listings ADD COLUMN extraction_result TEXT;

-- Add scoring_result column for deterministic scoring breakdown
ALTER TABLE job_listings ADD COLUMN scoring_result TEXT;

-- Migrate existing data (optional, or just re-process)
-- UPDATE job_listings SET status = 'pending' WHERE status IN ('filtered', 'skipped');
```

#### Update config schema

```sql
-- Replace prefilter-policy with new scoring-config
DELETE FROM job_finder_config WHERE key = 'prefilter-policy';

INSERT INTO job_finder_config (key, value) VALUES (
    'scoring-config',
    '{
        "work_arrangement": {
            "remote_bonus": 10,
            "hybrid_penalty": 0,
            "onsite_penalty": -20,
            "relocation_penalty": -50,
            "timezone_penalty_per_hour": -3,
            "max_timezone_hours": 8
        },
        "compensation": {
            "min_salary_floor": 100000,
            "target_salary": 200000,
            "below_target_penalty_per_10k": -2
        },
        "seniority": {
            "preferred_levels": ["senior", "staff", "principal"]
        },
        "technology": {
            "desired_tech": {"python": 5, "typescript": 5, "kubernetes": 5},
            "undesired_tech": {"php": -10, "cobol": -20}
        },
        "min_match_score": 70,
        "high_priority_threshold": 85,
        "ai_score_weight": 0.6
    }'
);
```

---

### Phase 7: Testing Strategy

#### Unit Tests

```python
# tests/scoring/test_scoring_engine.py

def test_hard_reject_clearance():
    extraction = JobExtraction(
        role_fit_signals=RoleFitSignals(requires_clearance=True),
        ...
    )
    result = engine.score(extraction)
    assert not result.passed
    assert result.hard_reject_reason == "Security clearance required"

def test_remote_bonus():
    extraction = JobExtraction(
        work_arrangement=WorkArrangement(type="remote"),
        ...
    )
    result = engine.score(extraction)
    assert any(a.reason == "Remote position" and a.points > 0 for a in result.adjustments)

def test_relocation_penalty():
    extraction = JobExtraction(
        work_arrangement=WorkArrangement(type="onsite", relocation_required=True),
        ...
    )
    result = engine.score(extraction)
    assert any(a.reason == "Relocation required" and a.points < 0 for a in result.adjustments)
```

#### Integration Tests

```python
# tests/integration/test_hybrid_pipeline.py

async def test_full_pipeline_remote_job():
    """Test that a good remote job passes through entire pipeline."""
    job_data = {
        "title": "Senior Software Engineer",
        "company": "Anthropic",
        "location": "Remote",
        "description": "We're looking for a senior engineer to work on Claude...",
    }

    # Title filter
    title_result = title_filter.filter(job_data["title"], job_data["company"])
    assert title_result.passed

    # AI extraction
    extraction = await extractor.extract(job_data)
    assert extraction is not None
    assert extraction.work_arrangement.type == "remote"

    # Scoring
    score_result = engine.score(extraction)
    assert score_result.passed
    assert score_result.final_score >= 70

async def test_non_engineering_filtered():
    """Test that recruiter roles are filtered before AI."""
    result = title_filter.filter("Technical Recruiter", "Anthropic")
    assert not result.passed
    assert "Non-engineering" in result.rejection_reason
```

---

## Migration Checklist

### Pre-Migration
- [ ] Create feature branch from staging
- [ ] Back up production database
- [ ] Document current filter/scoring config

### Implementation
- [ ] Create `src/job_finder/ai/extraction.py` with schema + extractor
- [ ] Create `src/job_finder/ai/extraction_prompts.py`
- [ ] Create `src/job_finder/scoring/config.py`
- [ ] Create `src/job_finder/scoring/engine.py`
- [ ] Create `src/job_finder/filters/title_filter.py`
- [ ] Update `src/job_finder/job_queue/processors/job_processor.py`
- [ ] Simplify `src/job_finder/ai/matcher.py`
- [ ] Update `src/job_finder/job_queue/config_loader.py`
- [ ] Run database migrations
- [ ] Delete deprecated files
- [ ] Update all tests

### Testing
- [ ] All unit tests pass
- [ ] Integration tests pass
- [ ] Manual test with sample jobs (including Anthropic)
- [ ] Verify extraction quality with 10+ real jobs
- [ ] Compare scores old vs new for same jobs

### Deployment
- [ ] Merge to staging
- [ ] Deploy to staging environment
- [ ] Run full scrape cycle on staging
- [ ] Review results, adjust scoring config if needed
- [ ] Merge to main
- [ ] Deploy to production
- [ ] Monitor first production batch

---

## Rollback Plan

If issues arise post-deployment:

1. **Immediate**: Set `isProcessingEnabled: false` in queue config
2. **Short-term**: Revert to previous commit, redeploy
3. **Data**: Re-process affected jobs with previous pipeline

Since this is a hard cutover, keep the previous commit tagged for quick revert:
```bash
git tag pre-hybrid-migration <commit-hash>
```

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| False negative rate (good jobs rejected) | High (Anthropic example) | <5% |
| False positive rate (bad jobs passed) | Medium | <10% |
| Processing time per job | ~45s | ~50s (+extraction) |
| Cost per batch (770 jobs) | $5.10 | ~$10 |
| Lines of fragile regex code | ~500 | 0 |
| Configurable scoring parameters | ~15 | ~30 |

---

## Future Enhancements

After migration stabilizes:

1. **Use Haiku for extraction**: Reduce cost by using faster/cheaper model
2. **Batch extraction**: Process multiple jobs in single API call
3. **Extraction caching**: Cache extractions for re-scoring with different configs
4. **A/B testing**: Compare scoring configs side-by-side
5. **Feedback loop**: Use match outcomes to tune scoring weights
