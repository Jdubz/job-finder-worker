> Status: Active
> Owner: @jdubz
> Last Updated: 2025-11-25

# Queue Decision Tree - Implementation Gaps

This document tracks implementation gaps between the decision tree architecture (see `queue-decision-tree.md`) and the current codebase.

## Terminology

- **Task**: A work unit in the queue (formerly called "queue item" or "job")
- **Job**: An employment opportunity (job listing, job match)
- **Queue Item Types**: COMPANY, JOB_LISTING, SCRAPE, SOURCE_DISCOVERY, SCRAPE_SOURCE

## Current Implementation Status

### Implemented

| Component | Location | Status |
|-----------|----------|--------|
| Job Listing Pipeline (SCRAPE → FILTER → ANALYZE → SAVE) | `job_processor.py` | Complete |
| Company Pipeline (FETCH → EXTRACT → ANALYZE → SAVE) | `company_processor.py` | Complete |
| Source Discovery | `source_processor.py` | Complete |
| SCRAPE_SOURCE Task Type | `source_processor.py` | Complete (2025-11-25) |
| Loop Prevention (tracking_id, ancestry_chain, spawn_depth) | `manager.py` | Complete |
| Source Health Tracking | `job_sources_manager.py` | Complete |
| Strike-Based Filtering | `filters/strike_filter_engine.py` | Complete |
| Discovery Confidence Levels | `job_sources_manager.py` | Complete |

---

## Implementation Gaps

### Gap 1: Job Listing → Company Task Spawning (HIGH PRIORITY)

**Status**: Required for architectural consistency

**Current Behavior** (`job_processor.py:291`):
```python
company = self.companies_manager.get_or_create_company(
    company_name=company_name,
    company_website=company_website,
    fetch_info_func=self.company_info_fetcher.fetch_company_info,
)
```
Creates company record **inline** with basic scraping. No queue task spawned.

**Problems**:
- Breaks consistent queue-based architecture paradigm
- Company gets minimal info (about/culture scraped inline)
- No tech stack detection
- No priority scoring
- No job board discovery
- Blocks job listing analysis until company fetch completes
- No retry/error handling via queue mechanisms

**Required Behavior**:
When processing a job listing with unknown company:
1. Create company stub with `status: "pending"`
2. Spawn COMPANY_FETCH task for full pipeline analysis
3. Job listing task should either:
   - Wait for company task completion (dependency tracking), OR
   - Proceed with stub data and allow company enrichment later

**Implementation Options**:
- **Option A**: Job listing waits - Add `depends_on_task_id` field, processor skips until dependency completes
- **Option B**: Async enrichment - Job listing proceeds with stub, company data enriches later
- **Recommended**: Option A for data consistency

**Impact**: High priority - Architectural consistency

---

### Gap 2: Full State Machine Enforcement (HIGH PRIORITY)

**Status**: Required for system reliability and observability

**Current State**:
- Companies have `analysis_status` field but only use `"analyzing"` and `"complete"`
- Sources have `status` field with basic states
- No enforced state transitions
- No `analysis_progress` tracking

**Required States for Companies**:
- `pending` - Created but not yet processing
- `analyzing` - Currently being processed (in pipeline)
- `active` - Analysis complete, ready for use
- `failed` - Analysis failed permanently (after max retries)

**Required States for Sources**:
- `pending_validation` - Awaiting manual approval (medium/low confidence)
- `active` - Validated and operational
- `disabled` - Manually disabled or auto-disabled after failures
- `failed` - Permanently failed

**Required Implementation**:

1. **State transition enforcement**:
```python
class CompanyStatus(str, Enum):
    PENDING = "pending"
    ANALYZING = "analyzing"
    ACTIVE = "active"
    FAILED = "failed"

VALID_TRANSITIONS = {
    CompanyStatus.PENDING: [CompanyStatus.ANALYZING],
    CompanyStatus.ANALYZING: [CompanyStatus.ACTIVE, CompanyStatus.FAILED],
    CompanyStatus.ACTIVE: [CompanyStatus.ANALYZING],  # Re-analysis
    CompanyStatus.FAILED: [CompanyStatus.PENDING],    # Manual retry
}

def transition_status(current: CompanyStatus, new: CompanyStatus) -> bool:
    if new not in VALID_TRANSITIONS.get(current, []):
        raise InvalidStateTransition(f"Cannot transition from {current} to {new}")
    return True
```

2. **Analysis progress tracking**:
```python
analysis_progress: Dict[str, bool] = {
    "fetch": False,
    "extract": False,
    "analyze": False,
    "save": False,
}
```

3. **Update status at each pipeline stage**:
   - FETCH start: `pending` → `analyzing`
   - SAVE success: `analyzing` → `active`
   - Any failure (max retries): `analyzing` → `failed`

**Impact**: High priority - System reliability and debugging

---

### Gap 3: Data Quality Thresholds (DEPRIORITIZED)

**Status**: Partially implemented, staleness check not needed yet

**Current Implementation** (`companies_manager.py:190-195`):
```python
def has_good_company_data(self, company_data):
    has_good_quality = about_length > 100 and culture_length > 50
    has_minimal_quality = about_length > 50 or culture_length > 25
    return has_good_quality or has_minimal_quality
```

**What's Implemented**:
- Basic quality threshold checks
- Minimal vs good quality distinction

**What's Deferred**:
- Staleness-based re-analysis (30-day threshold)
- Companies don't go stale quickly enough to warrant this complexity now

**Future Enhancement** (when needed):
```python
def should_reanalyze_company(company_data):
    is_good = (about > 100 and culture > 50)
    updated_at = company_data.get("updatedAt")
    is_stale = (now - updated_at) > timedelta(days=30)
    return (not is_good) or is_stale
```

**Impact**: Low priority - Defer until system proves stable

---

### Gap 4: Job Board Confidence Level Handling (ACCEPTABLE)

**Status**: Current behavior acceptable, will refine later

**Current Behavior**:
- Always spawns SOURCE_DISCOVERY when job board found
- Source processor assigns confidence levels per source type:
  - Greenhouse: `"high"` (API available, reliable)
  - RSS: `"high"` (standard format, reliable)
  - Workday: `"medium"` (requires validation)
  - Generic HTML: variable confidence based on selector discovery

**Why This Is Acceptable**:
- `validation_required` flag exists for medium/low confidence sources
- Health tracking auto-disables failing sources after 5 consecutive failures
- Better to discover sources and let validation handle quality

**Future Optimization** (when needed):
- Conditional spawning: only high confidence auto-spawns
- Medium/low confidence stored in company metadata for manual review
- Dashboard for reviewing pending source validations

**Impact**: Low priority - Current behavior works, optimize later

---

### ~~Gap 5: Source Scraping Queue Items~~ (IMPLEMENTED)

**Status**: Implemented as of 2025-11-25

**Implementation**:
- `SCRAPE_SOURCE` task type defined in `models.py:28`
- Processed by `source_processor.py`
- Auto-spawned after SOURCE_DISCOVERY completes

```python
class QueueItemType(str, Enum):
    SCRAPE_SOURCE = "scrape_source"  # ✓ Implemented
```

**No further action required.**

---

## Proposed Data Structure Changes

### Companies Table - Status Enhancement

**Current Schema** has `analysis_status` field. **Required changes**:
```sql
-- Enforce state machine values
ALTER TABLE companies
  ADD CONSTRAINT chk_status
  CHECK (analysis_status IN ('pending', 'analyzing', 'active', 'failed'));

-- Add progress tracking (JSON column)
ALTER TABLE companies ADD COLUMN analysis_progress TEXT;  -- JSON
ALTER TABLE companies ADD COLUMN last_analyzed_at TEXT;   -- ISO timestamp
```

**Python Model**:
```python
class CompanyStatus(str, Enum):
    PENDING = "pending"
    ANALYZING = "analyzing"
    ACTIVE = "active"
    FAILED = "failed"
```

### Job-Sources Table - Already Implemented

Current schema already has needed fields:
- `status` (pending_validation, active, disabled, failed)
- `discovery_confidence` (high, medium, low)
- `validation_required` (boolean)
- `consecutive_failures` (integer)

**Future enhancement** (scraping schedule):
```sql
ALTER TABLE job_sources ADD COLUMN scrape_frequency TEXT;      -- hourly|daily|weekly
ALTER TABLE job_sources ADD COLUMN next_scrape_at TEXT;        -- ISO timestamp
```

### Queue Task Types - IMPLEMENTED

```python
class QueueItemType(str, Enum):
    JOB = "job"                       # Job listing processing
    COMPANY = "company"               # Company analysis
    SCRAPE = "scrape"                 # Batch scrape from source
    SOURCE_DISCOVERY = "source_discovery"  # Discover/validate new source
    SCRAPE_SOURCE = "scrape_source"   # Scrape specific source (✓ implemented)
```

**Note**: Consider renaming `JOB` to `JOB_LISTING` for clarity (terminology update).

---

## Testing Requirements

### Unit Tests Needed

1. `tests/queue/test_scrape_source_processing.py` ✓ (exists)
   - Test SCRAPE_SOURCE handler for each source type
   - Test health tracking updates
   - Test job listing submission from source scrapes

2. `tests/storage/test_company_status.py` (needed for Gap 2)
   - Test status transitions (state machine enforcement)
   - Test invalid transition rejection
   - Test analysis_progress tracking

3. `tests/queue/test_company_spawning.py` (needed for Gap 1)
   - Test job listing → company task spawning logic
   - Test stub company creation with `pending` status
   - Test dependency tracking (job listing waits for company)

### E2E Test Scenarios

1. **Full Company Discovery Flow** (Gap 1 implementation)
   ```
   Submit Job Listing (unknown company)
     → JOB_LISTING SCRAPE
     → JOB_LISTING FILTER
     → JOB_LISTING ANALYZE (spawns COMPANY_FETCH task)
     → JOB_LISTING waits (depends_on_task_id set)
     → COMPANY FETCH/EXTRACT/ANALYZE/SAVE
     → JOB_LISTING ANALYZE (retries with company data)
     → JOB_LISTING SAVE
   ```

2. **Source Discovery to Scraping Flow** ✓ (working)
   ```
   Submit Company Task
     → COMPANY FETCH/EXTRACT/ANALYZE
     → Discovers Greenhouse board
     → COMPANY SAVE (spawns SOURCE_DISCOVERY task)
     → SOURCE_DISCOVERY (creates job-source record)
     → Auto-spawn SCRAPE_SOURCE task
     → SCRAPE_SOURCE (fetches job listings)
     → Job listing tasks submitted to queue
   ```

3. **State Machine Enforcement** (Gap 2 implementation)
   ```
   Company in "pending" state
     → FETCH starts → transitions to "analyzing"
     → EXTRACT fails (max retries) → transitions to "failed"
     → Manual retry → transitions back to "pending"
     → Invalid transition attempt → raises InvalidStateTransition
   ```

---

## Risks & Mitigations

### Risk 1: Queue Depth Explosion
**Risk**: Spawning COMPANY and SCRAPE_SOURCE tasks increases queue depth

**Mitigation**:
- Implement queue depth monitoring
- Add rate limiting: Max X new spawns per minute
- Prioritize completion over new spawns

### Risk 2: AI Cost Increase
**Risk**: More company analysis = higher costs

**Mitigation**:
- Implement strict quality thresholds
- Monitor daily AI spend
- Cache company data aggressively

### Risk 3: Circular Dependencies
**Risk**: Job Listing → Company → Source → Job Listing creates loops

**Mitigation**:
- Existing loop prevention handles this (tracking_id, ancestry_chain, spawn_depth)
- Add E2E tests for circular cases
- Alert on spawn_depth > 5

### Risk 4: Task Dependency Deadlocks (NEW - Gap 1 related)
**Risk**: Job listing tasks waiting for company tasks might deadlock or timeout

**Mitigation**:
- Max wait time: 5 minutes before FAILED
- Exponential backoff for dependency checks
- Alert on tasks stuck in PENDING with unresolved dependencies
- Fallback: proceed with stub data after timeout
