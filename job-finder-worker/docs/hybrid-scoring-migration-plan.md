# Hybrid Scoring Migration Plan

## Overview

Replace the fragile programmatic filtering system with a hybrid approach that uses AI for semantic data extraction and deterministic scoring from database configuration.

**Migration Type:** Hard cutover (no backwards compatibility)
**Estimated Effort:** 5-7 days of implementation

---

## Key Design Decisions

Based on requirements clarification:

| Decision | Approach |
|----------|----------|
| Profile Integration | Extraction MUST use profile for personalization |
| Company Data | Company enriched BEFORE job analysis begins |
| AI Provider | Use `ai-settings` config for ALL AI selections |
| Pipeline | All stages in SAME task (no respawning) |
| Failure Handling | Retry once if recoverable, fail with debug data if not |
| Tech Preferences | Load from database config (not hardcoded) |
| Database | No migration - reuse existing columns |
| Scoring | AI does NO math - only extracts data for deterministic calculation |
| Observability | Use filter_result/analysis_result + queue events |

---

## Architecture Comparison

### Current Architecture (Remove)
```
SCRAPE → STRIKE FILTER → AI ANALYSIS → SCORE ADJUSTMENTS → SAVE
              ↓               ↓              ↓
         600 jobs         170 jobs      3 jobs matched
         (regex-based)    (full analysis)  (fragile scoring)
```

### New Architecture (Implement)
```
                    ┌─────────────────────────────────────────────────────────┐
                    │                    SINGLE TASK                          │
                    │                                                         │
SCRAPE ──┐          │  TITLE    COMPANY     AI         DETERMINISTIC   SAVE  │
         ├─────────►│  FILTER → LOOKUP  →  EXTRACT  →  SCORING      →        │
QUEUE ───┘          │    ↓         ↓          ↓            ↓           ↓     │
                    │  ~10%    (cached)   Profile +    Config-based   Store  │
                    │ filtered            Job Data     calculation    match  │
                    └─────────────────────────────────────────────────────────┘
```

**Key Differences:**
- All stages execute in-memory within single task
- Company data fetched/cached BEFORE AI extraction
- AI extracts structured data only (no scoring)
- Scoring is 100% deterministic from DB config + extracted data
- Missing data = no effect on score (not penalized)

---

## Codebase Audit Results

### Files to Remove

| File | Current Usage | Replacement |
|------|---------------|-------------|
| `src/job_finder/filters/strike_filter_engine.py` | Pre-filtering jobs | TitleFilter + ScoringEngine |
| `src/job_finder/utils/timezone_utils.py` | Timezone detection | AI extraction |
| `tests/filters/test_strike_filter_engine.py` | Tests | New test suite |
| `tests/test_timezone_utils.py` | Tests | Remove |

### Files to Modify

| File | Changes Required |
|------|------------------|
| `src/job_finder/ai/matcher.py` | Remove `_detect_work_arrangement`, `_calculate_location_penalty`, `_calculate_adjusted_score`; Keep `_analyze_match`, `_generate_intake_data` |
| `src/job_finder/job_queue/processors/job_processor.py` | Replace pipeline with new stages; Remove strike filter; Add extraction + scoring |
| `src/job_finder/scrape_runner.py` | Remove StrikeFilterEngine usage; Use TitleFilter |
| `src/job_finder/job_queue/config_loader.py` | Add `get_scoring_config()`; Keep `get_prefilter_policy()` for stop list only |
| `src/job_finder/filters/__init__.py` | Export TitleFilter instead of StrikeFilterEngine |
| `src/job_finder/utils/date_utils.py` | Keep `parse_job_date()`; Remove `calculate_freshness_adjustment()` |

### Test Files to Update

| File | Changes |
|------|---------|
| `tests/test_ai_matcher.py` | Remove tests for deprecated methods; Add tests for simplified matcher |
| `tests/test_date_utils.py` | Remove `calculate_freshness_adjustment` tests |
| `tests/test_filters.py` | Update imports |
| `tests/test_company_pipeline.py` | Update mocks |
| `tests/queue/test_source_discovery.py` | Update mocks |

### Production Import Dependencies

```
StrikeFilterEngine imported by:
├── filters/__init__.py (re-export)
├── scrape_runner.py (pre-filtering)
└── job_processor.py (pipeline filtering)

detect_timezone_for_job imported by:
├── matcher.py (score calculation)
└── strike_filter_engine.py (timezone check)

calculate_freshness_adjustment imported by:
└── matcher.py (score calculation)

get_prefilter_policy used by:
├── scrape_runner.py (filter config)
├── job_processor.py (filter config)
└── config_loader.py (get_stop_list internal)
```

---

## Shared Types Impact

### Types to Modify

**File:** `shared/src/config.types.ts`

```typescript
// NEW: ScoringConfig type (replaces complex PrefilterPolicy scoring)
export interface ScoringConfig {
  workArrangement: {
    remoteBonus: number;
    hybridPenalty: number;
    onsitePenalty: number;
    relocationPenalty: number;
    unknownPenalty: number;
    timezonesPenaltyPerHour: number;
    maxTimezoneHours: number; // Hard reject beyond this
  };
  compensation: {
    minSalaryFloor: number; // Hard reject below
    targetSalary: number;
    belowTargetPenaltyPer10k: number;
    equityBonus: number;
    contractPenalty: number;
  };
  seniority: {
    preferredLevels: string[];
    internPenalty: number; // -100 = hard reject
    juniorPenalty: number; // -100 = hard reject
    midPenalty: number;
    managementPenalty: number;
    directorPlusPenalty: number;
  };
  technology: {
    desiredTech: Record<string, number>; // tech -> bonus points
    undesiredTech: Record<string, number>; // tech -> penalty points
  };
  roleFit: {
    engineeringBonus: number;
    backendBonus: number;
    mlAiBonus: number;
    devopsSreBonus: number;
    frontendPenalty: number;
    consultingPenalty: number;
    clearancePenalty: number; // -100 = hard reject
  };
  freshness: {
    freshBonusDays: number;
    freshBonus: number;
    staleThresholdDays: number;
    stalePenalty: number;
    veryStaleDays: number;
    veryStalePenalty: number;
  };
  companySignals: {
    portlandOfficeBonus: number;
    remoteFirstBonus: number;
    aiMlFocusBonus: number;
    largeSizeBonus: number;
    smallSizePenalty: number;
  };
  thresholds: {
    minMatchScore: number;
    highPriorityThreshold: number;
    aiScoreWeight: number; // 0.0-1.0
  };
}

// NEW: Extraction result structure (stored in filter_result)
export interface JobExtractionResult {
  workArrangement: {
    type: 'remote' | 'hybrid' | 'onsite' | 'unknown';
    locationRequired: string | null;
    relocationRequired: boolean;
    timezoneExpectations: string | null;
    timezoneOffset: number | null;
  };
  compensation: {
    salaryMin: number | null;
    salaryMax: number | null;
    currency: string;
    includesEquity: boolean;
    isContract: boolean;
  };
  seniority: {
    level: 'intern' | 'junior' | 'mid' | 'senior' | 'staff' | 'principal' | 'director' | 'vp' | 'unknown';
    yearsExperienceMin: number | null;
    yearsExperienceMax: number | null;
    isManagement: boolean;
    isLead: boolean;
  };
  technologyStack: {
    required: string[];
    preferred: string[];
    mentioned: string[];
  };
  roleFitSignals: {
    isEngineeringRole: boolean;
    isBackend: boolean;
    isFrontend: boolean;
    isFullstack: boolean;
    isDevopsSre: boolean;
    isMlAi: boolean;
    isData: boolean;
    isSecurity: boolean;
    requiresClearance: boolean;
    isConsulting: boolean;
  };
  jobFreshness: {
    postedDate: string | null;
    daysOld: number | null;
    isRepost: boolean;
  };
  redFlags: string[];
  greenFlags: string[];
}

// Update JobFinderConfigId
export type JobFinderConfigId =
  | "queue-settings"
  | "ai-settings"
  | "ai-prompts"
  | "personal-info"
  | "prefilter-policy"  // Keep for stop list only
  | "match-policy"      // Keep for detailed analysis config
  | "scoring-config"    // NEW
  | "scheduler-settings"
  | "worker-settings";
```

**File:** `shared/src/job.types.ts`

```typescript
// Update JobListingRecord to clarify column usage
export interface JobListingRecord {
  // ... existing fields ...

  // filter_result now stores JobExtractionResult + TitleFilterResult
  filterResult?: {
    titleFilter?: { passed: boolean; rejectionReason?: string };
    extraction?: JobExtractionResult;
  } | null;

  // analysis_result stores scoring breakdown + detailed analysis
  analysisResult?: {
    scoringResult?: ScoringResult;
    detailedAnalysis?: JobAnalysisResult;
  } | null;

  // match_score is the final deterministic score
  matchScore?: number | null;
}

// NEW: Scoring result structure
export interface ScoringResult {
  passed: boolean;
  finalScore: number;
  aiBaseScore: number;
  adjustments: Array<{
    category: string;
    reason: string;
    points: number;
  }>;
  hardRejectReason: string | null;
  priority: 'high' | 'medium' | 'low';
}
```

---

## API Endpoints Impact

### Endpoints to Modify

| Endpoint | Changes |
|----------|---------|
| `GET /api/config/scoring-config` | NEW endpoint for scoring configuration |
| `PUT /api/config/scoring-config` | NEW endpoint to update scoring config |
| `GET /api/config/prefilter-policy` | Keep but simplify (stop list only) |

### Endpoint Contracts (No Changes Needed)

| Endpoint | Reason |
|----------|--------|
| `GET /api/job-listings` | Returns JobListingRecord - structure unchanged |
| `GET /api/job-matches` | Returns JobMatchWithListing - structure unchanged |
| `POST /api/job-matches` | Accepts JobMatch - structure unchanged |

### New Queue Events

Add WebSocket events for frontend progress monitoring:

```typescript
// New queue events for job processing progress
type QueueEventType =
  | 'job:title_filter'      // Title filter complete
  | 'job:company_lookup'    // Company data loaded
  | 'job:extraction'        // AI extraction complete
  | 'job:scoring'           // Scoring complete
  | 'job:analysis'          // Detailed analysis complete
  | 'job:saved';            // Match saved
```

---

## Frontend Pages Impact

### Pages to Modify

#### 1. PrefilterPolicyTab.tsx
**Changes:** Simplify to stop list only (remove strike engine config)

Current sections to REMOVE:
- Strike Engine settings (enabled, threshold)
- Hard Rejections (all fields)
- Remote Policy (all fields)
- Salary Strike, Experience Strike, Quality Strikes, Age Strike
- Technology Ranks

Keep only:
- Stop List (excludedCompanies, excludedKeywords, excludedDomains)

#### 2. MatchPolicyTab.tsx
**Changes:** Keep for detailed analysis config, but move scoring to new tab

Keep:
- Generate resume intake data flag
- Any detailed analysis specific settings

Remove (move to ScoringConfigTab):
- Minimum match score
- Company weights
- Timezone adjustments
- Priority thresholds

#### 3. NEW: ScoringConfigTab.tsx
**Changes:** Create new tab for all scoring configuration

Sections:
- Work Arrangement (remote/hybrid/onsite bonuses/penalties, timezone settings)
- Compensation (salary floor, target, penalties, equity bonus)
- Seniority (level preferences, penalties)
- Technology (desired/undesired tech with points)
- Role Fit (engineering, backend, ML/AI bonuses, consulting penalty)
- Freshness (fresh bonus, stale penalties, thresholds)
- Company Signals (Portland, remote-first, AI/ML, size bonuses)
- Thresholds (min score, high priority, AI weight)

#### 4. JobListingsPage.tsx
**Changes:** Minor - ensure extraction result display works

- Status badges remain the same
- Score display reads from `listing.matchScore`
- May want to show extraction status

#### 5. JobDetailsDialog.tsx
**Changes:** Update Overview tab to show new scoring breakdown

Current: Shows `match.matchScore`, `match.experienceMatch`, etc.
New: Also show `listing.analysisResult.scoringResult.adjustments`

Add section showing:
- AI base score
- Each adjustment with category, reason, points
- Hard reject reason if applicable

---

## Implementation Phases

### Phase 1: Create New Modules (No Breaking Changes)

Create these new files without removing old ones:

```
src/job_finder/ai/extraction.py          # JobExtractor + schema
src/job_finder/ai/extraction_prompts.py  # Extraction prompts
src/job_finder/scoring/__init__.py       # Module init
src/job_finder/scoring/config.py         # ScoringConfig schema
src/job_finder/scoring/engine.py         # ScoringEngine
src/job_finder/filters/title_filter.py   # TitleFilter
```

#### 1.1 AI Extraction Schema

```python
# src/job_finder/ai/extraction.py

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
    type: WorkArrangementType = WorkArrangementType.UNKNOWN
    location_required: Optional[str] = None
    relocation_required: bool = False
    timezone_expectations: Optional[str] = None
    timezone_offset: Optional[float] = None

class Compensation(BaseModel):
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None
    currency: str = "USD"
    includes_equity: bool = False
    is_contract: bool = False

class Seniority(BaseModel):
    level: SeniorityLevel = SeniorityLevel.UNKNOWN
    years_experience_min: Optional[int] = None
    years_experience_max: Optional[int] = None
    is_management: bool = False
    is_lead: bool = False

class TechnologyStack(BaseModel):
    required: List[str] = Field(default_factory=list)
    preferred: List[str] = Field(default_factory=list)
    mentioned: List[str] = Field(default_factory=list)

class RoleFitSignals(BaseModel):
    is_engineering_role: bool = False
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
    posted_date: Optional[str] = None
    days_old: Optional[int] = None
    is_repost: bool = False

class JobExtraction(BaseModel):
    """Structured data extracted from job listing by AI.

    AI provides DATA ONLY - no scoring or match assessment.
    All fields are optional - missing data should not affect scoring.
    """
    work_arrangement: WorkArrangement = Field(default_factory=WorkArrangement)
    compensation: Compensation = Field(default_factory=Compensation)
    seniority: Seniority = Field(default_factory=Seniority)
    technology_stack: TechnologyStack = Field(default_factory=TechnologyStack)
    role_fit_signals: RoleFitSignals = Field(default_factory=RoleFitSignals)
    job_freshness: JobFreshness = Field(default_factory=JobFreshness)
    red_flags: List[str] = Field(default_factory=list)
    green_flags: List[str] = Field(default_factory=list)
```

#### 1.2 Extraction Prompts (Profile-Personalized)

```python
# src/job_finder/ai/extraction_prompts.py

def build_extraction_system_prompt(profile: dict) -> str:
    """Build extraction prompt personalized with user profile."""

    skills = ", ".join(profile.get("skills", [])[:20])
    experience_years = profile.get("years_experience", "unknown")
    preferred_role = profile.get("target_role", "software engineer")
    location = profile.get("location", "unknown")

    return f"""You are a job listing data extractor. Extract structured data from job postings.

IMPORTANT: Return ONLY valid JSON. No markdown, no explanations, no commentary.

You are extracting data to help match jobs for a candidate with this profile:
- Skills: {skills}
- Experience: {experience_years} years
- Target Role: {preferred_role}
- Location: {location}

Extract the following data from the job listing. If information is not available or unclear, use null or empty values - DO NOT GUESS.

Key extraction guidelines:
- work_arrangement.type: "remote" if explicitly remote/WFH. "hybrid" if mix. "onsite" if in-office required. "unknown" if unclear.
- work_arrangement.relocation_required: true ONLY if explicitly requires relocation. Boilerplate like "headquartered in SF" is NOT a requirement.
- work_arrangement.timezone_offset: UTC offset as float (e.g., -8 for PST, -5 for EST) if detectable from location.
- compensation: Extract salary range, convert to annual USD. "150k" = 150000. If hourly, leave salary null.
- seniority.level: Infer from title AND requirements. "5+ years" typically = senior. "10+ years" = staff/principal.
- technology_stack.required: ONLY tech explicitly marked as required/must-have.
- technology_stack.preferred: ONLY tech marked as nice-to-have/preferred.
- technology_stack.mentioned: All other tech mentioned.
- role_fit_signals: Boolean flags based on job responsibilities and requirements.
- job_freshness.days_old: Calculate from posted_date if provided, otherwise null.
- red_flags: Concerning signals (clearance, excessive travel, low pay, red flag phrases).
- green_flags: Positive signals (remote-first, modern stack, growth opportunity).

Return JSON matching this exact structure (all fields required, use defaults for missing data):
{{
  "work_arrangement": {{
    "type": "remote|hybrid|onsite|unknown",
    "location_required": "string or null",
    "relocation_required": false,
    "timezone_expectations": "string or null",
    "timezone_offset": "number or null"
  }},
  "compensation": {{
    "salary_min": "number or null",
    "salary_max": "number or null",
    "currency": "USD",
    "includes_equity": false,
    "is_contract": false
  }},
  "seniority": {{
    "level": "intern|junior|mid|senior|staff|principal|director|vp|unknown",
    "years_experience_min": "number or null",
    "years_experience_max": "number or null",
    "is_management": false,
    "is_lead": false
  }},
  "technology_stack": {{
    "required": [],
    "preferred": [],
    "mentioned": []
  }},
  "role_fit_signals": {{
    "is_engineering_role": false,
    "is_backend": false,
    "is_frontend": false,
    "is_fullstack": false,
    "is_devops_sre": false,
    "is_ml_ai": false,
    "is_data": false,
    "is_security": false,
    "requires_clearance": false,
    "is_consulting": false
  }},
  "job_freshness": {{
    "posted_date": "ISO string or null",
    "days_old": "number or null",
    "is_repost": false
  }},
  "red_flags": [],
  "green_flags": []
}}"""


EXTRACTION_USER_PROMPT = """Extract structured data from this job listing:

**Title:** {title}
**Company:** {company}
**Location:** {location}
**Posted:** {posted_date}
**Salary:** {salary}

**Company Info:**
{company_info}

**Description:**
{description}

Return ONLY the JSON object, no other text."""
```

#### 1.3 Job Extractor Service

```python
# src/job_finder/ai/extraction.py (continued)

import json
import logging
from typing import Optional

from pydantic import ValidationError

from job_finder.ai.extraction_prompts import (
    build_extraction_system_prompt,
    EXTRACTION_USER_PROMPT,
)
from job_finder.ai.providers import AIProvider
from job_finder.profile.schema import Profile

logger = logging.getLogger(__name__)


class JobExtractor:
    """Extract structured data from job listings using AI.

    AI extracts DATA ONLY - no scoring or match calculations.
    Uses profile for context but does not assess fit.
    """

    def __init__(
        self,
        provider: AIProvider,
        profile: Profile,
        max_retries: int = 1,
    ):
        self.provider = provider
        self.profile = profile
        self.max_retries = max_retries
        self._system_prompt = build_extraction_system_prompt(profile.model_dump())

    def extract(
        self,
        job_data: dict,
        company_data: Optional[dict] = None,
    ) -> tuple[Optional[JobExtraction], Optional[str]]:
        """
        Extract structured data from job listing.

        Args:
            job_data: Job listing data (title, description, etc.)
            company_data: Enriched company data (optional)

        Returns:
            Tuple of (extraction_result, error_message)
            - On success: (JobExtraction, None)
            - On failure: (None, error_string)
        """
        company_info = self._format_company_info(company_data) if company_data else "Not available"

        prompt = EXTRACTION_USER_PROMPT.format(
            title=job_data.get("title", ""),
            company=job_data.get("company", ""),
            location=job_data.get("location", ""),
            posted_date=job_data.get("posted_date", ""),
            salary=job_data.get("salary", ""),
            company_info=company_info,
            description=job_data.get("description", "")[:8000],
        )

        last_error = None
        for attempt in range(self.max_retries + 1):
            try:
                response = self.provider.generate(
                    prompt,
                    system_prompt=self._system_prompt,
                    max_tokens=2000,
                    temperature=0.1,
                )

                extraction = self._parse_response(response)
                if extraction:
                    return extraction, None

                last_error = "Failed to parse AI response as valid JobExtraction"

            except Exception as e:
                last_error = f"AI extraction error (attempt {attempt + 1}): {str(e)}"
                logger.warning(last_error)

                # Don't retry on non-recoverable errors
                if "rate limit" not in str(e).lower() and "timeout" not in str(e).lower():
                    break

        return None, last_error

    def _format_company_info(self, company_data: dict) -> str:
        """Format company data for prompt context."""
        parts = []
        if company_data.get("employee_count"):
            parts.append(f"Size: {company_data['employee_count']} employees")
        if company_data.get("headquarters"):
            parts.append(f"HQ: {company_data['headquarters']}")
        if company_data.get("industry"):
            parts.append(f"Industry: {company_data['industry']}")
        if company_data.get("is_remote_first"):
            parts.append("Remote-first company")
        if company_data.get("has_portland_office"):
            parts.append("Has Portland, OR office")
        if company_data.get("is_ai_ml_focused"):
            parts.append("AI/ML focused")
        return "\n".join(parts) if parts else "Not available"

    def _parse_response(self, response: str) -> Optional[JobExtraction]:
        """Parse AI response into JobExtraction model."""
        try:
            cleaned = response.strip()

            # Handle markdown code blocks
            if cleaned.startswith("```"):
                parts = cleaned.split("```")
                if len(parts) >= 2:
                    cleaned = parts[1]
                    if cleaned.startswith("json"):
                        cleaned = cleaned[4:]
                    cleaned = cleaned.strip()

            # Find JSON object boundaries
            start = cleaned.find("{")
            end = cleaned.rfind("}") + 1
            if start >= 0 and end > start:
                cleaned = cleaned[start:end]

            data = json.loads(cleaned)
            return JobExtraction(**data)

        except json.JSONDecodeError as e:
            logger.error(f"JSON parse error: {e}")
            return None
        except ValidationError as e:
            logger.error(f"Validation error: {e}")
            return None
```

#### 1.4 Scoring Configuration

```python
# src/job_finder/scoring/config.py

from pydantic import BaseModel, Field
from typing import Dict, List


class WorkArrangementScoring(BaseModel):
    remote_bonus: int = 10
    hybrid_penalty: int = 0
    onsite_penalty: int = -20
    relocation_penalty: int = -50
    unknown_penalty: int = -10
    timezone_penalty_per_hour: int = -3
    max_timezone_hours: int = 8


class CompensationScoring(BaseModel):
    min_salary_floor: int = 100000
    target_salary: int = 200000
    below_target_penalty_per_10k: int = -2
    equity_bonus: int = 5
    contract_penalty: int = -15


class SeniorityScoring(BaseModel):
    preferred_levels: List[str] = Field(
        default_factory=lambda: ["senior", "staff", "principal"]
    )
    intern_penalty: int = -100
    junior_penalty: int = -100
    mid_penalty: int = -10
    management_penalty: int = -20
    director_plus_penalty: int = -15


class TechnologyScoring(BaseModel):
    desired_tech: Dict[str, int] = Field(default_factory=dict)
    undesired_tech: Dict[str, int] = Field(default_factory=dict)


class RoleFitScoring(BaseModel):
    engineering_bonus: int = 5
    backend_bonus: int = 5
    ml_ai_bonus: int = 10
    devops_sre_bonus: int = 3
    frontend_penalty: int = -5
    consulting_penalty: int = -20
    clearance_penalty: int = -100


class FreshnessScoring(BaseModel):
    fresh_bonus_days: int = 2
    fresh_bonus: int = 10
    stale_threshold_days: int = 7
    stale_penalty: int = -20
    very_stale_days: int = 14
    very_stale_penalty: int = -40


class CompanySignalsScoring(BaseModel):
    portland_office_bonus: int = 15
    remote_first_bonus: int = 15
    ai_ml_focus_bonus: int = 10
    large_size_bonus: int = 10
    small_size_penalty: int = -5
    large_size_threshold: int = 10000
    small_size_threshold: int = 100


class ThresholdsConfig(BaseModel):
    min_match_score: int = 70
    high_priority_threshold: int = 85
    ai_score_weight: float = 0.0  # Default 0 = no AI scoring, only extraction


class ScoringConfig(BaseModel):
    """Complete scoring configuration loaded from database."""
    work_arrangement: WorkArrangementScoring = Field(default_factory=WorkArrangementScoring)
    compensation: CompensationScoring = Field(default_factory=CompensationScoring)
    seniority: SeniorityScoring = Field(default_factory=SeniorityScoring)
    technology: TechnologyScoring = Field(default_factory=TechnologyScoring)
    role_fit: RoleFitScoring = Field(default_factory=RoleFitScoring)
    freshness: FreshnessScoring = Field(default_factory=FreshnessScoring)
    company_signals: CompanySignalsScoring = Field(default_factory=CompanySignalsScoring)
    thresholds: ThresholdsConfig = Field(default_factory=ThresholdsConfig)
```

#### 1.5 Scoring Engine

```python
# src/job_finder/scoring/engine.py

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
    adjustments: List[ScoreAdjustment] = field(default_factory=list)
    hard_reject_reason: Optional[str] = None
    priority: str = "medium"

    def to_dict(self) -> dict:
        return {
            "passed": self.passed,
            "final_score": self.final_score,
            "adjustments": [
                {"category": a.category, "reason": a.reason, "points": a.points}
                for a in self.adjustments
            ],
            "hard_reject_reason": self.hard_reject_reason,
            "priority": self.priority,
        }


class ScoringEngine:
    """
    Deterministic scoring engine.

    Calculates score ENTIRELY from:
    - Extracted job data (from AI)
    - Scoring config (from database)
    - Company data (from enrichment)

    AI provides NO scores - only structured data.
    Missing data has NO effect on score (not penalized).
    """

    def __init__(
        self,
        config: ScoringConfig,
        user_timezone: float = -8,
    ):
        self.config = config
        self.user_timezone = user_timezone

    def score(
        self,
        extraction: JobExtraction,
        company_data: Optional[dict] = None,
    ) -> ScoringResult:
        """Calculate score from extracted data and config."""
        adjustments = []
        company_data = company_data or {}

        # Check hard rejects first
        hard_reject = self._check_hard_rejects(extraction)
        if hard_reject:
            return ScoringResult(
                passed=False,
                final_score=0,
                adjustments=adjustments,
                hard_reject_reason=hard_reject,
                priority="low",
            )

        # Apply all scoring adjustments
        adjustments.extend(self._score_work_arrangement(extraction))
        adjustments.extend(self._score_compensation(extraction))
        adjustments.extend(self._score_seniority(extraction))
        adjustments.extend(self._score_technology(extraction))
        adjustments.extend(self._score_role_fit(extraction))
        adjustments.extend(self._score_freshness(extraction))
        adjustments.extend(self._score_company_signals(company_data))

        # Calculate final score (start from 50 baseline)
        baseline = 50
        total_adjustment = sum(a.points for a in adjustments)
        final_score = max(0, min(100, baseline + total_adjustment))

        # Determine priority
        thresholds = self.config.thresholds
        if final_score >= thresholds.high_priority_threshold:
            priority = "high"
        elif final_score >= thresholds.min_match_score:
            priority = "medium"
        else:
            priority = "low"

        return ScoringResult(
            passed=final_score >= thresholds.min_match_score,
            final_score=final_score,
            adjustments=adjustments,
            priority=priority,
        )

    def _check_hard_rejects(self, extraction: JobExtraction) -> Optional[str]:
        """Check for conditions that immediately reject a job."""
        cfg = self.config

        # Clearance required
        if extraction.role_fit_signals.requires_clearance:
            if cfg.role_fit.clearance_penalty <= -100:
                return "Security clearance required"

        # Too junior
        level = extraction.seniority.level
        if level == "intern" and cfg.seniority.intern_penalty <= -100:
            return "Internship position"
        if level == "junior" and cfg.seniority.junior_penalty <= -100:
            return "Junior-level position"

        # Salary too low (only if salary is known)
        if extraction.compensation.salary_max is not None:
            if extraction.compensation.salary_max < cfg.compensation.min_salary_floor:
                return f"Salary ${extraction.compensation.salary_max:,} below minimum ${cfg.compensation.min_salary_floor:,}"

        # Timezone too far (for non-remote, only if timezone known)
        wa = extraction.work_arrangement
        if wa.type != "remote" and wa.timezone_offset is not None:
            tz_diff = abs(wa.timezone_offset - self.user_timezone)
            if tz_diff > cfg.work_arrangement.max_timezone_hours:
                return f"Timezone difference {tz_diff}h exceeds maximum {cfg.work_arrangement.max_timezone_hours}h"

        return None

    def _score_work_arrangement(self, extraction: JobExtraction) -> List[ScoreAdjustment]:
        """Score work arrangement. Missing data = no adjustment."""
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
        # unknown = no adjustment (not penalized for missing data)

        # Relocation penalty (only if explicitly required)
        if wa.relocation_required:
            adjustments.append(ScoreAdjustment("work_arrangement", "Relocation required", cfg.relocation_penalty))

        # Timezone penalty for non-remote (only if timezone known)
        if wa.type in ("hybrid", "onsite") and wa.timezone_offset is not None:
            tz_diff = abs(wa.timezone_offset - self.user_timezone)
            if tz_diff > 0:
                penalty = int(tz_diff * cfg.timezone_penalty_per_hour)
                adjustments.append(ScoreAdjustment("timezone", f"{tz_diff}h timezone difference", penalty))

        return adjustments

    def _score_compensation(self, extraction: JobExtraction) -> List[ScoreAdjustment]:
        """Score compensation. Missing data = no adjustment."""
        cfg = self.config.compensation
        adjustments = []
        comp = extraction.compensation

        # Salary scoring (only if known)
        if comp.salary_max is not None:
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
        """Score seniority level. Unknown = no adjustment."""
        cfg = self.config.seniority
        adjustments = []
        sen = extraction.seniority

        # Level scoring (skip if unknown or preferred)
        if sen.level == "mid":
            adjustments.append(ScoreAdjustment("seniority", "Mid-level position", cfg.mid_penalty))
        elif sen.level in ("director", "vp"):
            adjustments.append(ScoreAdjustment("seniority", f"{sen.level.upper()} level", cfg.director_plus_penalty))
        # senior, staff, principal = no adjustment (preferred levels)
        # unknown = no adjustment

        # Management penalty
        if sen.is_management:
            adjustments.append(ScoreAdjustment("seniority", "Management role", cfg.management_penalty))

        return adjustments

    def _score_technology(self, extraction: JobExtraction) -> List[ScoreAdjustment]:
        """Score technology stack. Only scores known tech."""
        cfg = self.config.technology
        adjustments = []
        tech = extraction.technology_stack

        # All mentioned tech
        all_tech = set(t.lower() for t in tech.required + tech.preferred + tech.mentioned)
        required_tech = set(t.lower() for t in tech.required)

        # Desired tech bonuses (any mention)
        for tech_name, bonus in cfg.desired_tech.items():
            if tech_name.lower() in all_tech:
                adjustments.append(ScoreAdjustment("technology", f"Uses {tech_name}", bonus))

        # Undesired tech penalties (only if required)
        for tech_name, penalty in cfg.undesired_tech.items():
            if tech_name.lower() in required_tech:
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
        """Score job freshness. Missing date = no adjustment."""
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

    def _score_company_signals(self, company_data: dict) -> List[ScoreAdjustment]:
        """Score company signals from enrichment data."""
        cfg = self.config.company_signals
        adjustments = []

        if company_data.get("has_portland_office"):
            adjustments.append(ScoreAdjustment("company", "Has Portland office", cfg.portland_office_bonus))

        if company_data.get("is_remote_first"):
            adjustments.append(ScoreAdjustment("company", "Remote-first company", cfg.remote_first_bonus))

        if company_data.get("is_ai_ml_focused"):
            adjustments.append(ScoreAdjustment("company", "AI/ML focus", cfg.ai_ml_focus_bonus))

        # Company size (only if known)
        employee_count = company_data.get("employee_count")
        if employee_count is not None:
            if employee_count >= cfg.large_size_threshold:
                adjustments.append(ScoreAdjustment("company", f"Large company ({employee_count:,} employees)", cfg.large_size_bonus))
            elif employee_count <= cfg.small_size_threshold:
                adjustments.append(ScoreAdjustment("company", f"Small company ({employee_count} employees)", cfg.small_size_penalty))

        return adjustments
```

#### 1.6 Title Filter

```python
# src/job_finder/filters/title_filter.py

import re
from dataclasses import dataclass
from typing import List, Optional


@dataclass
class TitleFilterResult:
    passed: bool
    rejection_reason: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "passed": self.passed,
            "rejection_reason": self.rejection_reason,
        }


class TitleFilter:
    """Fast pre-filter based on job title only.

    Performs cheap string matching before expensive AI extraction.
    """

    ENGINEERING_KEYWORDS = [
        "software", "engineer", "developer", "swe", "sde",
        "backend", "frontend", "fullstack", "full stack", "full-stack",
        "devops", "sre", "platform", "infrastructure",
        "ml", "machine learning", "data engineer", "ai engineer",
        "security engineer", "cloud engineer", "systems engineer",
    ]

    NON_ENGINEERING_KEYWORDS = [
        "recruiter", "recruiting", "talent acquisition",
        "sales", "account executive", "account manager", "business development",
        "marketing", "content", "copywriter", "social media",
        "hr", "human resources", "people ops", "people operations",
        "finance", "accounting", "controller", "bookkeeper",
        "legal", "counsel", "attorney", "paralegal",
        "admin", "assistant", "coordinator", "receptionist",
        "support", "customer success", "customer service",
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
        """Quick filter based on title and company."""
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

### Phase 2: Update Job Processor Pipeline

Replace the current multi-stage respawning pipeline with a single-task sequential flow.

```python
# Key changes to job_processor.py

class JobProcessor(BaseProcessor):
    """Process job queue items through hybrid pipeline.

    All stages execute sequentially within a single task:
    1. Title Filter (fast, free)
    2. Company Lookup (cached)
    3. AI Extraction (profile-personalized)
    4. Deterministic Scoring
    5. Detailed Analysis (if score passes)
    6. Save Match
    """

    def __init__(self, ...):
        # Remove: self.strike_filter
        # Add:
        self.title_filter = TitleFilter(
            excluded_companies=self._get_excluded_companies()
        )
        self.job_extractor = None  # Lazy init with AI provider
        self.scoring_engine = None  # Lazy init with config

    def _ensure_extractor(self):
        """Lazy initialize extractor with current AI settings."""
        if self.job_extractor is None:
            ai_settings = self.config_loader.get_ai_settings()
            provider = create_provider_from_config(ai_settings, section="worker")
            self.job_extractor = JobExtractor(
                provider=provider,
                profile=self.profile,
            )
        return self.job_extractor

    def _ensure_scoring_engine(self):
        """Lazy initialize scoring engine with current config."""
        if self.scoring_engine is None:
            scoring_config = self.config_loader.get_scoring_config()
            match_policy = self.config_loader.get_match_policy()
            self.scoring_engine = ScoringEngine(
                config=scoring_config,
                user_timezone=match_policy.get("jobMatch", {}).get("userTimezone", -8),
            )
        return self.scoring_engine

    async def process_job(self, item: JobQueueItem) -> ProcessResult:
        """Process job through complete pipeline in single task."""
        state = item.pipeline_state or {}
        listing_id = None

        try:
            # Stage 1: Scrape (if needed)
            if "job_data" not in state:
                job_data = await self._scrape_job(item)
                state["job_data"] = job_data

            job_data = state["job_data"]

            # Create/get listing record for tracking
            listing_id = await self._ensure_listing_record(item, job_data)

            # Stage 2: Title Filter
            title_result = self.title_filter.filter(
                title=job_data.get("title", ""),
                company=job_data.get("company", "")
            )
            state["title_filter"] = title_result.to_dict()

            if not title_result.passed:
                await self._update_listing_status(
                    listing_id,
                    "filtered",
                    filter_result=state,
                )
                return ProcessResult(
                    status=QueueItemStatus.FILTERED,
                    message=title_result.rejection_reason,
                )

            # Stage 3: Company Lookup (before AI extraction)
            company_data = await self._get_company_data(job_data, item)
            state["company_data"] = company_data

            # Emit progress event
            await self._emit_event("job:company_lookup", item.id, {"company": job_data.get("company")})

            # Stage 4: AI Extraction
            extractor = self._ensure_extractor()
            extraction, error = extractor.extract(job_data, company_data)

            if extraction is None:
                await self._update_listing_status(
                    listing_id,
                    "failed",
                    filter_result={**state, "extraction_error": error},
                )
                return ProcessResult(
                    status=QueueItemStatus.FAILED,
                    message=f"AI extraction failed: {error}",
                )

            state["extraction"] = extraction.model_dump()
            await self._emit_event("job:extraction", item.id, {"extraction": state["extraction"]})

            # Stage 5: Deterministic Scoring
            scoring_engine = self._ensure_scoring_engine()
            scoring_result = scoring_engine.score(extraction, company_data)
            state["scoring_result"] = scoring_result.to_dict()

            await self._emit_event("job:scoring", item.id, {
                "score": scoring_result.final_score,
                "passed": scoring_result.passed,
            })

            if not scoring_result.passed:
                await self._update_listing_status(
                    listing_id,
                    "skipped",
                    filter_result=state,
                    match_score=scoring_result.final_score,
                )
                return ProcessResult(
                    status=QueueItemStatus.SKIPPED,
                    message=f"Score {scoring_result.final_score} below threshold",
                )

            # Stage 6: Detailed Analysis (only if score passed)
            match_result = await self._run_detailed_analysis(
                job_data,
                company_data,
                scoring_result.final_score,
            )

            if match_result is None:
                # Analysis failed but scoring passed - still save with score
                await self._update_listing_status(
                    listing_id,
                    "analyzed",
                    filter_result=state,
                    match_score=scoring_result.final_score,
                )
                return ProcessResult(
                    status=QueueItemStatus.SUCCESS,
                    message="Scored but detailed analysis failed",
                )

            state["match_result"] = match_result.to_dict()
            await self._emit_event("job:analysis", item.id, {"match": state["match_result"]})

            # Stage 7: Save Match
            await self._save_job_match(listing_id, match_result, scoring_result)

            await self._update_listing_status(
                listing_id,
                "matched",
                filter_result=state,
                analysis_result=match_result.to_dict(),
                match_score=scoring_result.final_score,
            )

            await self._emit_event("job:saved", item.id, {"listing_id": listing_id})

            return ProcessResult(
                status=QueueItemStatus.SUCCESS,
                message=f"Matched with score {scoring_result.final_score}",
            )

        except Exception as e:
            logger.exception(f"Job processing failed: {e}")
            if listing_id:
                await self._update_listing_status(
                    listing_id,
                    "failed",
                    filter_result={**state, "error": str(e)},
                )
            return ProcessResult(
                status=QueueItemStatus.FAILED,
                message=str(e),
            )
```

---

### Phase 3: Update Config Loader

```python
# Add to config_loader.py

def get_scoring_config(self) -> ScoringConfig:
    """Load scoring configuration from database."""
    row = self._get_config_row("scoring-config")
    if row:
        payload = json.loads(row["payload_json"])
        return ScoringConfig(**payload)
    return ScoringConfig()  # Defaults

def get_stop_list(self) -> dict:
    """Load stop list from prefilter-policy (excludedCompanies, etc.)."""
    policy = self.get_prefilter_policy()
    return policy.get("stopList", {
        "excludedCompanies": [],
        "excludedKeywords": [],
        "excludedDomains": [],
    })
```

---

### Phase 4: Remove Deprecated Code

Delete these files:
- `src/job_finder/filters/strike_filter_engine.py`
- `src/job_finder/utils/timezone_utils.py`
- `tests/filters/test_strike_filter_engine.py`
- `tests/test_timezone_utils.py`

Update these files:
- `src/job_finder/filters/__init__.py` - Export TitleFilter
- `src/job_finder/ai/matcher.py` - Remove deprecated methods, keep detailed analysis
- `src/job_finder/utils/date_utils.py` - Remove `calculate_freshness_adjustment`
- `src/job_finder/scrape_runner.py` - Use TitleFilter

---

### Phase 5: Update Shared Types

Update `shared/src/config.types.ts`:
- Add `ScoringConfig` interface
- Add `JobExtractionResult` interface
- Add `"scoring-config"` to `JobFinderConfigId`

Update `shared/src/job.types.ts`:
- Add `ScoringResult` interface
- Update `JobListingRecord.filterResult` type
- Update `JobListingRecord.analysisResult` type

---

### Phase 6: Update API

Add to `job-finder-BE/server/src/modules/config/`:
- New route handler for `scoring-config`
- Type guards for `ScoringConfig`
- Default config seeding

---

### Phase 7: Update Frontend

#### Remove from PrefilterPolicyTab.tsx:
- All strike engine configuration
- Hard rejections
- Remote policy
- Salary/experience/quality/age strikes
- Technology ranks

#### Keep in PrefilterPolicyTab.tsx:
- Stop list (excludedCompanies, excludedKeywords, excludedDomains)

#### Create ScoringConfigTab.tsx:
- Work arrangement settings
- Compensation settings
- Seniority settings
- Technology preferences
- Role fit settings
- Freshness settings
- Company signals settings
- Threshold settings

#### Update JobDetailsDialog.tsx:
- Show scoring breakdown from `analysisResult.scoringResult`
- Display each adjustment with category, reason, points

---

## Migration Checklist

### Pre-Migration
- [ ] Create feature branch from staging
- [ ] Back up production database
- [ ] Document current config values

### Phase 1: New Modules
- [ ] Create `src/job_finder/ai/extraction.py`
- [ ] Create `src/job_finder/ai/extraction_prompts.py`
- [ ] Create `src/job_finder/scoring/__init__.py`
- [ ] Create `src/job_finder/scoring/config.py`
- [ ] Create `src/job_finder/scoring/engine.py`
- [ ] Create `src/job_finder/filters/title_filter.py`
- [ ] Write unit tests for new modules

### Phase 2: Job Processor
- [ ] Update `job_processor.py` with new pipeline
- [ ] Add queue event emissions
- [ ] Update integration tests

### Phase 3: Config Loader
- [ ] Add `get_scoring_config()` method
- [ ] Add `get_stop_list()` method
- [ ] Seed default scoring-config

### Phase 4: Remove Deprecated
- [ ] Delete deprecated files
- [ ] Update imports in remaining files
- [ ] Remove deprecated tests
- [ ] Run full test suite

### Phase 5: Shared Types
- [ ] Add TypeScript interfaces
- [ ] Update existing interfaces
- [ ] Rebuild shared package

### Phase 6: API
- [ ] Add scoring-config endpoints
- [ ] Update config type guards
- [ ] Test API changes

### Phase 7: Frontend
- [ ] Simplify PrefilterPolicyTab
- [ ] Create ScoringConfigTab
- [ ] Update JobDetailsDialog
- [ ] Test all config pages

### Testing
- [ ] All unit tests pass
- [ ] Integration tests pass
- [ ] Manual test with real jobs
- [ ] Test Anthropic jobs specifically
- [ ] Verify scores are reasonable

### Deployment
- [ ] Merge to staging
- [ ] Deploy staging
- [ ] Run test batch
- [ ] Review results
- [ ] Deploy to production
- [ ] Monitor first batch

---

## Rollback Plan

1. **Immediate**: Set `isProcessingEnabled: false`
2. **Quick**: `git revert` and redeploy
3. **Data**: Re-process affected jobs

Tag before deployment:
```bash
git tag pre-hybrid-migration $(git rev-parse HEAD)
```

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| False negatives (good jobs rejected) | High | <5% |
| Anthropic jobs matched | 0 | >50% |
| Processing time per job | ~45s | ~60s |
| Cost per batch | $5 | ~$12 |
| Lines of regex parsing | ~500 | 0 |
