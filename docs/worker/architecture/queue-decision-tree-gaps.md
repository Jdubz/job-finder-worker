> Status: Active
> Owner: @jdubz
> Last Updated: 2025-12-10

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
| Job Listing Pipeline (single-task: SCRAPE → COMPANY_LOOKUP → AI_EXTRACT → SCORING → AI_ANALYSIS → SAVE_MATCH with optional WAIT_COMPANY requeue) | `job_processor.py` | Complete (2025-12-10) |
| Company Pipeline (single-pass search → extract → save) | `company_processor.py` | Complete |
| Company enrichment spawn + wait (stub creation, WAIT_COMPANY requeue) | `job_processor.py` | Complete (2025-12-10) |
| Source Discovery + SCRAPE_SOURCE | `source_processor.py` | Complete |
| Loop Prevention (tracking_id, ancestry_chain, spawn_depth) | `manager.py` | Complete |
| Source Health Tracking | `job_sources_manager.py` | Complete |
| Strike-Based Filtering | `filters/strike_filter_engine.py` | Complete |
| Discovery Confidence Levels | `job_sources_manager.py` | Complete |

### Closed Gaps
- **Job listing → company enrichment spawning**: Implemented via `_check_company_dependency` and `_spawn_company_enrichment` with `WAIT_COMPANY` requeue (see `job_processor.py` lines ~360-760). No further action required; keep regression tests.

---

## Implementation Gaps

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
    about_length = len(company_data.get("about", ""))
    culture_length = len(company_data.get("culture", ""))
    # Check for minimal quality: either field has some content
    return about_length > 50 or culture_length > 25
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

3. `tests/queue/test_company_wait_flow.py` (regression)
   - Verify WAIT_COMPANY requeue path: spawn enrichment, increment wait counter, proceed after max waits
   - Ensure `pipeline_state.job_listing_id` persists across requeues

### E2E Test Scenarios

1. **Job Listing WAIT_COMPANY Flow** (regression)
   ```
   Submit Job Listing (unknown company)
     → SCRAPE (loads data)
     → COMPANY_LOOKUP (creates stub)
     → WAIT_COMPANY requeue (spawns COMPANY task if sparse)
     → Company task saves enriched data
     → Requeued JOB resumes at AI_EXTRACTION/SCORING/ANALYSIS
     → SAVE_MATCH
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

### Risk 4: Company Wait Churn
**Risk**: Requeue-on-wait could increase queue depth or starve other items.

**Mitigation**:
- Cap waits via `MAX_COMPANY_WAIT_RETRIES` (currently enforced)
- Emit `job:waiting_company` events and alert on repeated waits per company
- Consider prioritizing resumed jobs to reduce total latency
