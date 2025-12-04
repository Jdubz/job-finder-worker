# Hybrid Scoring Migration Plan

## Overview

Replace the fragile programmatic filtering system with a hybrid approach that uses AI for semantic data extraction and deterministic scoring from database configuration. **Current state (Dec 2025):** title keywords live under `prefilter-policy.title`, and runtime settings live under `worker-settings.runtime`.

**Migration Type:** Hard cutover (no backwards compatibility)
**Estimated Effort:** 5-7 days of implementation

---

## Key Design Decisions

Based on requirements clarification:

| Decision | Approach |
|----------|----------|
| Profile Integration | ~~Extraction MUST use profile for personalization~~ **CORRECTED: Extraction is profile-agnostic. User prefs only apply during scoring from config.** |
| Company Data | Company enriched BEFORE job analysis begins |
| AI Provider | Use `ai-settings` config for ALL AI selections |
| Pipeline | All stages in SAME task (no respawning) - **CRITICAL** |
| Failure Handling | Retry once if recoverable, fail with debug data if not |
| Tech Preferences | Load from database config (not hardcoded) - **ALL scoring weights from config** |
| Database | No migration - reuse existing columns |
| Scoring | AI does NO math - only extracts data for deterministic calculation |
| Observability | Use filter_result/analysis_result + queue events |
| Pre-AI Filtering | Prefilter-policy (title keywords + freshness/work arrangement/employment type/salary/tech rejects) |
| Semantic Analysis | ALL content analysis (tech, keywords, flags) done by AI |
| Priority Field | **REMOVE - useless, will be deleted soon** |

---

## Critical Clarifications (December 2025)

These clarifications supersede any conflicting statements in the original plan:

### 1. Extraction Scope - Job & Company Data ONLY

**Extraction is exclusively about job and company data.** The user's `personal-info` and `content-items` do NOT come into play until document generation. The AI extractor should NOT receive user profile data for personalization during extraction.

- ❌ `JobExtractor.__init__(profile: Profile)` - REMOVE profile parameter
- ❌ `build_extraction_system_prompt(profile)` - REMOVE profile personalization
- ✅ Extraction produces pure, objective job data
- ✅ User preferences only apply during deterministic scoring (from config)

### 2. AI Role - Data Extraction ONLY, No Scoring

**AI is NOT responsible for scoring in ANY way.** AI should ONLY extract deterministic scoring data as structured JSON. The scoring engine then calculates the score purely from:
- Extracted job data (JSON from AI)
- Scoring configuration (from database config records)
- Company data (from enrichment)

- ❌ AI providing match scores, priorities, or recommendations during extraction
- ✅ AI outputs pure structured data (technologies, seniority, timezone, etc.)
- ✅ All scoring weights/bonuses/penalties come from `match-policy`

### 3. ALL Scoring MUST Be Configurable

**ALL extraction and scoring parameters MUST be configurable via the configuration UI and config records.** Nothing should be hardcoded in the scoring engine.

This includes:
- Technology preferences (desired/undesired with point values)
- Role fit bonuses/penalties (backend, frontend, ML/AI, etc.)
- Company signals (portland_office, remote_first, ai_ml_focus, company_size)
- Freshness thresholds and bonuses/penalties
- Timezone penalties
- Seniority preferences
- Compensation thresholds

### 4. Company Signals - MUST Be Integrated

**Company scoring is highly relevant to job scoring.** The current implementation is MISSING company signal scoring entirely. The scoring engine MUST:
- Accept `company_data` parameter in `score()` method
- Score based on: portland_office, remote_first, ai_ml_focus, company_size
- All company signal weights must be in `match-policy.company`

### 5. Timezone Scoring - CRITICAL FIX NEEDED

**Timezone scoring is NOT working.** Example: An India-based job received a score of 95 when it should have been heavily penalized for timezone difference (India = UTC+5.5, user = UTC-8, difference = 13.5 hours).

The scoring engine MUST:
- Extract timezone from job location (AI extraction)
- Calculate timezone difference from user's timezone (from config)
- Apply `timezone_penalty_per_hour` for non-remote positions
- Hard-reject if timezone exceeds `max_timezone_hours`

### 6. Freshness Scoring - VERY IMPORTANT

**Freshness extraction and scoring is VERY important** and is already defined in the configs but not being used. The extractor must:
- Extract `posted_date` from job posting
- Calculate `days_old`
- Detect `is_repost` if possible

The scoring engine must apply freshness bonuses/penalties per config:
- Fresh jobs (≤2 days) → bonus
- Stale jobs (>7 days) → penalty
- Very stale jobs (>14 days) → larger penalty

### 7. Role Fit Scoring - Config-Driven

**Role fit scoring is appropriate** but MUST be listed and quantified in the configs. The AI extracts boolean signals:
- `is_backend`, `is_frontend`, `is_fullstack`
- `is_ml_ai`, `is_devops_sre`, `is_data`
- `requires_clearance`, `is_consulting`

The scoring engine applies bonuses/penalties from `match-policy.roleFit`:
- `backendBonus`, `mlAiBonus`, `devopsSreBonus`
- `frontendPenalty`, `consultingPenalty`, `clearancePenalty`

### 8. Pipeline - Single-Task Execution REQUIRED

**The pipeline MUST be converted to single-task execution** to reduce database queries and maintain in-memory data through the entire task. The current respawning pipeline:
- Creates multiple queue items per job
- Loses in-memory state between stages
- Causes excessive database writes
- Is the root cause of job-matches not being created

New pipeline (ALL in single task, in-memory):
```
SCRAPE → TITLE_FILTER → COMPANY_LOOKUP → AI_EXTRACTION → SCORING → ANALYSIS → SAVE_MATCH
```

### 9. Priority Field - REMOVE

**The priority field is useless and will be removed soon.** Do not implement priority calculation or store priority in results.

- ❌ `ScoringResult.priority`
- ❌ Priority thresholds in config
- ✅ Only use `passed` boolean and `final_score`

### 10. Job Matches Bug - Final Step Not Executing

**High-scoring jobs are NOT producing job-matches.** This is the final step of job listing analysis when score is above threshold. The bug appears to be in the respawning pipeline where the "save" stage is queued but never processed.

This will be fixed as part of the single-task pipeline conversion (item #8).

---

## Current Implementation Gaps (as of December 2025)

Analysis of current codebase vs. this plan:

### ✅ Completed Items

| Component | Status | Location |
|-----------|--------|----------|
| `TitleFilter` | ✅ Created | `filters/title_filter.py` |
| `ScoringEngine` (basic) | ✅ Created | `scoring/engine.py` |
| `JobExtractor` (simplified) | ✅ Created | `ai/extraction.py` |
| `get_title_filter()` | ✅ Working | `config_loader.py` |
| `get_scoring_config()` | ✅ Working | `config_loader.py` |
| `strike_filter_engine.py` | ✅ Removed | Only `.removed` backup exists |
| `timezone_utils.py` | ✅ Removed | File deleted |
| Deprecated matcher methods | ✅ Removed | `_apply_technology_ranks`, etc. gone |
| Shared `TitleFilterConfig` type | ✅ Created | `shared/config.types.ts` |
| Shared `ScoringConfig` type | ✅ Created | `shared/config.types.ts` |
| Shared `JobExtractionResult` type | ✅ Created | `shared/config.types.ts` |
| Frontend `TitleFilterTab.tsx` | ✅ Created | FE config pages |
| Frontend `ScoringConfigTab.tsx` | ✅ Created | FE config pages |

### ❌ Critical Gaps

| Gap | Impact | Fix Required |
|-----|--------|--------------|
| **Respawning pipeline** | Job-matches never created | Convert to single-task execution |
| **Company signals scoring missing** | No company bonuses applied | Add `_score_company_signals()` to engine |
| **Timezone scoring not working** | India jobs get 95 scores | Fix timezone extraction & penalty calculation |
| **Freshness scoring missing** | Stale jobs not penalized | Add freshness extraction & scoring |
| **Role fit scoring missing** | No backend/ML bonuses | Add role fit extraction & scoring |

### ⚠️ Partial Implementations

| Component | Current State | Missing |
|-----------|---------------|---------|
| `JobExtractionResult` | Flat structure | Missing: `relocation_required`, `includes_equity`, `is_contract`, `is_management`, `is_lead`, categorized tech stack, role fit signals, freshness |
| `ScoringEngine` | Basic scoring | Missing: `_score_company_signals()`, `_score_freshness()`, `_score_role_fit()` |
| `ScoreBreakdown.adjustments` | `List[str]` | Should be `List[{category, reason, points}]` |
| TypeScript types | `filterResult: Record<string, unknown>` | Should be typed with `TitleFilterResult` + `JobExtractionResult` |
| Priority field | Still present | Should be removed per clarification #9 |

### 📋 Remaining Work Priority

1. **HIGH: Single-task pipeline** - Fixes job-match creation bug
2. **HIGH: Timezone scoring** - Fixes India job scoring bug
3. **HIGH: Company signals** - Major scoring component missing
4. **MEDIUM: Freshness scoring** - Important for job relevance
5. **MEDIUM: Role fit scoring** - Enables backend/ML bonuses
6. **LOW: Structured adjustments** - Better debugging/transparency
7. **LOW: Remove priority field** - Cleanup

---

## Leveraging Recent Improvements

Recent commits made incremental improvements that inform this migration:

### Patterns to Reuse

| Improvement | How to Leverage |
|-------------|-----------------|
| `location_rules.py` | Pattern for shared rule modules: `@dataclass` context + pure evaluation function |
| Strike accumulation | Becomes score adjustment accumulation in ScoringEngine |
| Unified location/timezone rules | ScoringEngine imports `evaluate_location_rules()` directly |
| Softer filtering (strikes vs hard rejects) | All "strike" logic becomes configurable score penalties |

### Code to Remove (Temporary Additions)

These were added as incremental steps but will be replaced:

| File | Code to Remove | Replacement |
|------|----------------|-------------|
| `matcher.py` | `_apply_technology_ranks()` (line ~584) | ScoringEngine + AI extraction |
| `matcher.py` | `_apply_experience_strike()` (line ~618) | ScoringEngine + AI extraction |
| `strike_filter_engine.py` | Entire file | TitleFilter + ScoringEngine |

### Pattern: Shared Rule Modules

The `location_rules.py` pattern should inform new shared modules:

```python
# Pattern: dataclass context + pure evaluation function
@dataclass
class LocationContext:
    user_city: Optional[str]
    user_timezone: Optional[float]
    # ... config values

@dataclass
class LocationEvaluation:
    hard_reject: bool
    strikes: int
    reason: Optional[str]

def evaluate_location_rules(job_city, job_timezone, remote, hybrid, ctx) -> LocationEvaluation:
    # Pure function - no side effects, deterministic
    ...
```

This pattern enables:
- Unit testing with simple dataclass inputs
- Reuse across filter and scorer
- Clear separation of config from logic

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

### Responsibility Boundaries

```
┌─────────────────────────────────────────────────────────────────────┐
│                     TitleFilter (PRE-AI, cheap)                     │
│                                                                     │
│   Required Keywords ──► "engineer", "developer", "sre", etc.        │
│   Stop Keywords ──────► "recruiter", "sales", "marketing", etc.     │
│                                                                     │
│   ❌ NO: company checks, domain checks, description keywords        │
│   Result: Pass/Reject (no listing created if rejected)              │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   AI Extraction (semantic understanding)            │
│                                                                     │
│   Technologies ───► ["python", "kubernetes", "react"] (normalized)  │
│   Seniority ──────► "senior" | "staff" | "principal" | etc.         │
│   Work Arrangement► "remote" | "hybrid" | "onsite" | "unknown"      │
│   Compensation ───► { min: 150000, max: 200000, equity: true }      │
│   Red Flags ──────► ["requires clearance", "extensive travel"]      │
│   Green Flags ────► ["remote-first", "modern stack"]                │
│                                                                     │
│   AI normalizes tech names: "React.js" → "react", "Golang" → "go"   │
│   AI understands context: "security clearance" vs "code clearance"  │
│   Result: Structured JobExtraction (DATA ONLY, no scores)           │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   ScoringEngine (deterministic math)                │
│                                                                     │
│   Tech Ranks ─────► +5 python, +10 ml, -20 php (from config)        │
│   Seniority ──────► +0 senior, -10 mid, -100 intern                 │
│   Location ───────► Uses location_rules.py (reused from recent)     │
│   Compensation ───► Below target penalty, equity bonus              │
│   Role Fit ───────► Backend bonus, consulting penalty               │
│   Red Flags ──────► Clearance penalty, travel penalty               │
│                                                                     │
│   All former "strikes" become score adjustments with config weights │
│   Result: Final score + detailed adjustment breakdown               │
└─────────────────────────────────────────────────────────────────────┘
```

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
| `src/job_finder/ai/matcher.py` | Remove `_detect_work_arrangement`, `_calculate_location_penalty`, `_calculate_adjusted_score`, `_apply_technology_ranks`, `_apply_experience_strike`; Keep `_analyze_match`, `_generate_intake_data` |
| `src/job_finder/job_queue/processors/job_processor.py` | Replace pipeline with new stages; Remove strike filter; Add extraction + scoring |
| `src/job_finder/scrape_runner.py` | Remove StrikeFilterEngine usage; Use TitleFilter |
| `src/job_finder/job_queue/config_loader.py` | Add `get_scoring_config()`; Simplify `get_prefilter_policy()` to title keywords only |
| `src/job_finder/filters/__init__.py` | Export TitleFilter instead of StrikeFilterEngine |
| `src/job_finder/utils/date_utils.py` | Keep `parse_job_date()`; Remove `calculate_freshness_adjustment()` |

**Note:** The `_apply_technology_ranks()` and `_apply_experience_strike()` methods in matcher.py were added as incremental steps. Their logic moves to ScoringEngine, which uses AI-extracted data instead of regex matching.

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
// SIMPLIFIED: PrefilterPolicy - title keywords only (no stop lists)
export interface PrefilterPolicy {
  titleFilter: {
    requiredKeywords: string[];  // Job title must contain at least one
    stopKeywords: string[];      // Job title cannot contain any
  };
  // REMOVED: stopList (excludedCompanies, excludedKeywords, excludedDomains)
  // REMOVED: strikeEngine config
  // REMOVED: remotePolicy (moved to ScoringConfig)
  // REMOVED: salaryStrike, seniorityStrikes, etc.
}

// NEW: ScoringConfig type (absorbs all former strike logic)
export interface ScoringConfig {
  workArrangement: {
    remoteBonus: number;
    hybridPenalty: number;
    onsitePenalty: number;
    relocationPenalty: number;
    unknownPenalty: number;
    timezonePenaltyPerHour: number;
    maxTimezoneHours: number; // Score floor beyond this
  };
  compensation: {
    minSalaryFloor: number; // Score heavily penalized below
    targetSalary: number;
    belowTargetPenaltyPer10k: number;
    equityBonus: number;
    contractPenalty: number;
  };
  seniority: {
    preferredLevels: string[];  // "senior", "staff", "principal"
    internPenalty: number;      // Large negative = effectively reject
    juniorPenalty: number;
    midPenalty: number;
    managementPenalty: number;
    directorPlusPenalty: number;
  };
  technology: {
    // Tech name (normalized) -> points (positive = bonus, negative = penalty)
    ranks: Record<string, number>;
  };
  roleFit: {
    engineeringBonus: number;
    backendBonus: number;
    mlAiBonus: number;
    devopsSreBonus: number;
    frontendPenalty: number;
    consultingPenalty: number;
  };
  redFlags: {
    // AI-identified flags -> penalty points
    clearancePenalty: number;
    extensiveTravelPenalty: number;
    // Extensible - AI can identify new flags
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
    largeSizeThreshold: number;
    smallSizeThreshold: number;
  };
  thresholds: {
    minMatchScore: number;
    highPriorityThreshold: number;
    baselineScore: number;  // Starting score before adjustments (default: 50)
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
  | "ai-settings"
  | "ai-prompts"
  | "personal-info"
  | "prefilter-policy"
  | "match-policy"
  | "worker-settings";
```

**Migration note:** Existing configs should be normalized to the canonical shapes:
1. Move any legacy title keywords into `prefilter-policy.title`.
2. Drop any legacy fields (stopList, strikeEngine, remotePolicy, queue/scheduler/scoring configs) after migration.

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
// Note: No aiBaseScore - AI extracts data only, all scoring is deterministic
export interface ScoringResult {
  passed: boolean;
  finalScore: number;
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
| `GET /api/config/match-policy` | Match policy configuration |
| `PUT /api/config/match-policy` | Update match policy |
| `GET /api/config/prefilter-policy` | Structured prefilter (title/freshness/work arrangement/employment type/salary/tech rejects) |
| `PUT /api/config/prefilter-policy` | Update prefilter policy |

### Prefilter Policy Simplification

**Before (complex):**
```json
{
  "stopList": { "excludedCompanies": [...], "excludedKeywords": [...], "excludedDomains": [...] },
  "strikeEngine": { "enabled": true, "strikeThreshold": 5, "hardRejections": {...}, "remotePolicy": {...}, ... },
  "technologyRanks": { "technologies": {...} }
}
```

**After (simple):**
```json
{
  "titleFilter": {
    "requiredKeywords": ["engineer", "developer", "sre", "sde", "software", "backend", "frontend", "fullstack", "devops", "platform", "ml", "machine learning", "data engineer", "ai engineer"],
    "stopKeywords": ["recruiter", "recruiting", "talent acquisition", "sales", "account executive", "marketing", "hr", "human resources", "finance", "accounting", "legal", "admin", "assistant", "support", "customer success"]
  }
}
```

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
**Changes:** DRASTICALLY SIMPLIFY to title keywords only

**REMOVE entirely:**
- Stop List section (excludedCompanies, excludedKeywords, excludedDomains)
- Strike Engine settings (enabled, threshold)
- Hard Rejections (all fields except title keywords)
- Remote Policy (all fields)
- Salary Strike, Experience Strike, Quality Strikes, Age Strike
- Technology Ranks

**Keep/Create:**
- Title Filter section with two lists:
  - Required Keywords (whitelist) - title must contain at least one
  - Stop Keywords (blacklist) - title cannot contain any

**UI Mockup:**
```
┌─────────────────────────────────────────────────────────┐
│ Title Filter                                            │
├─────────────────────────────────────────────────────────┤
│ Required Keywords (job must match at least one)         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ engineer, developer, sre, sde, software, backend,   │ │
│ │ frontend, fullstack, devops, platform, ml, ...      │ │
│ │ [+ Add keyword]                                     │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ Stop Keywords (job rejected if title matches)           │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ recruiter, sales, marketing, hr, finance, legal,    │ │
│ │ admin, assistant, support, customer success, ...    │ │
│ │ [+ Add keyword]                                     │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

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
**Changes:** Create new tab for ALL scoring configuration (absorbs former strike logic)

Sections:
- **Work Arrangement** (remote/hybrid/onsite bonuses/penalties, timezone settings, relocation penalty)
- **Compensation** (salary floor, target salary, below-target penalty, equity bonus, contract penalty)
- **Seniority** (preferred levels, intern/junior/mid/management/director penalties)
- **Technology Ranks** (tech name → points, positive = bonus, negative = penalty)
- **Role Fit** (engineering, backend, ML/AI, DevOps bonuses; frontend, consulting penalties)
- **Red Flags** (clearance penalty, extensive travel penalty - extensible)
- **Freshness** (fresh bonus, stale penalties, day thresholds)
- **Company Signals** (Portland office, remote-first, AI/ML focus, company size bonuses/penalties)
- **Thresholds** (min score, high priority threshold, baseline score)

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
        """Parse AI response into JobExtraction model.

        Uses boundary-finding ({...}) instead of markdown parsing to handle
        variations in LLM output robustly.
        """
        try:
            # Find first '{' and last '}' to extract JSON object
            # This handles both raw JSON and markdown-wrapped responses
            start = response.find("{")
            end = response.rfind("}") + 1
            if start == -1 or end == 0:
                logger.error("No JSON object found in AI response")
                return None

            cleaned = response[start:end]
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
    baseline_score: int = 50  # Starting score before adjustments


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

        # Calculate final score from configurable baseline
        baseline = self.config.thresholds.baseline_score
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
    This is the ONLY pre-AI check - all content analysis happens via AI.

    Two checks:
    1. Required keywords (whitelist) - title must contain at least one
    2. Stop keywords (blacklist) - title cannot contain any
    """

    DEFAULT_REQUIRED_KEYWORDS = [
        "software", "engineer", "developer", "swe", "sde",
        "backend", "frontend", "fullstack", "full stack", "full-stack",
        "devops", "sre", "platform", "infrastructure",
        "ml", "machine learning", "data engineer", "ai engineer",
        "security engineer", "cloud engineer", "systems engineer",
    ]

    DEFAULT_STOP_KEYWORDS = [
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
        required_keywords: Optional[List[str]] = None,
        stop_keywords: Optional[List[str]] = None,
    ):
        """Initialize title filter.

        Args:
            required_keywords: Title must contain at least one (whitelist)
            stop_keywords: Title cannot contain any (blacklist)

        NOTE: No company/domain/description checks - those are handled by AI.
        """
        self.required_keywords = [
            k.lower() for k in (required_keywords or self.DEFAULT_REQUIRED_KEYWORDS)
        ]
        self.stop_keywords = [
            k.lower() for k in (stop_keywords or self.DEFAULT_STOP_KEYWORDS)
        ]

    def filter(self, title: str) -> TitleFilterResult:
        """Quick filter based on title only.

        Args:
            title: Job title string

        Returns:
            TitleFilterResult with pass/fail and reason
        """
        if not title:
            return TitleFilterResult(passed=True)  # No title = allow through to AI

        title_lower = title.lower()

        # Check for stop keywords (blacklist - hard reject)
        for keyword in self.stop_keywords:
            if self._word_match(keyword, title_lower):
                return TitleFilterResult(
                    passed=False,
                    rejection_reason=f"Stop keyword in title: {keyword}"
                )

        # Check for required keywords (whitelist - must have at least one)
        has_required_keyword = any(
            self._word_match(k, title_lower) for k in self.required_keywords
        )

        if not has_required_keyword:
            return TitleFilterResult(
                passed=False,
                rejection_reason=f"Title missing required keywords: {title}"
            )

        return TitleFilterResult(passed=True)

    def _word_match(self, keyword: str, text: str) -> bool:
        """Match keyword with word boundaries."""
        if " " in keyword:
            # Multi-word phrase - substring match
            return keyword in text
        # Single word - use word boundaries to avoid partial matches
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
        self.title_filter = None  # Lazy init with config
        self.job_extractor = None  # Lazy init with AI provider
        self.scoring_engine = None  # Lazy init with config

    def _ensure_title_filter(self):
        """Lazy initialize title filter with current config."""
        if self.title_filter is None:
            prefilter = self.config_loader.get_prefilter_policy()
            title_config = prefilter.get("titleFilter", {})
            self.title_filter = TitleFilter(
                required_keywords=title_config.get("requiredKeywords"),
                stop_keywords=title_config.get("stopKeywords"),
            )
        return self.title_filter

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

            # Stage 2: Title Filter (title keywords only - no company/domain/description checks)
            title_filter = self._ensure_title_filter()
            title_result = title_filter.filter(title=job_data.get("title", ""))
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

from job_finder.scoring.config import ScoringConfig

def get_scoring_config(self) -> ScoringConfig:
    """Load scoring configuration from database."""
    payload = self._get_config("match-policy")
    return MatchPolicy(**payload)

def get_prefilter_title(self) -> dict:
    """Load title keywords from prefilter-policy."""
    policy = self.get_prefilter_policy()
    return policy.get("title", {"requiredKeywords": [], "excludedKeywords": []})
# Stop lists (excludedCompanies, excludedKeywords, excludedDomains) are eliminated
```

**Migration script for existing prefilter-policy:**

```python
# scripts/migrate_prefilter_policy.py

def migrate_prefilter_policy(db_path: str):
    """Migrate existing prefilter-policy to simplified format."""
    with sqlite_connection(db_path) as conn:
        row = conn.execute(
            "SELECT payload_json FROM job_finder_config WHERE id = 'prefilter-policy'"
        ).fetchone()

        if not row:
            return

        old_policy = json.loads(row["payload_json"])

        # Extract title keywords from old structure
        hard_rej = old_policy.get("strikeEngine", {}).get("hardRejections", {})
        required_keywords = hard_rej.get("requiredTitleKeywords", [])

        # Create stop keywords from non-engineering patterns
        # (These were hardcoded in StrikeFilterEngine, now configurable)
        stop_keywords = [
            "recruiter", "recruiting", "talent acquisition",
            "sales", "account executive", "marketing",
            "hr", "human resources", "finance", "legal",
            "admin", "assistant", "support", "customer success"
        ]

        new_policy = {
            "titleFilter": {
                "requiredKeywords": required_keywords,
                "stopKeywords": stop_keywords,
            }
        }

        conn.execute(
            "UPDATE job_finder_config SET payload_json = ?, updated_at = datetime('now') WHERE id = 'prefilter-policy'",
            (json.dumps(new_policy),)
        )

        print(f"Migrated prefilter-policy: {len(required_keywords)} required, {len(stop_keywords)} stop keywords")
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


### Phase 7: Frontend
- [x] CREATE `TitleFilterTab.tsx`
- [x] CREATE `ScoringConfigTab.tsx` with all scoring sections
- [x] UPDATE `JobDetailsDialog.tsx` (show scoring breakdown)
- [x] UPDATE `MatchBreakdown.tsx` (clean implementation, no legacy support)
- [ ] Test all config pages

### Testing
- [x] All unit tests pass (502 tests)
- [x] Integration tests pass
- [ ] Manual test with real jobs
- [ ] Test Anthropic jobs specifically (previous false negatives)
- [ ] Verify scores are reasonable
- [ ] Verify tech detection works without regex confusion

### Deployment
- [x] Merge to staging (multiple commits pushed)
- [ ] Deploy staging
- [ ] Run config migration script
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
