> Status: Active
> Owner: @jdubz
> Last Updated: 2025-11-25

# Queue Decision Tree - Implementation Gaps

This document tracks implementation gaps between the decision tree architecture (see `queue-decision-tree.md`) and the current codebase.

## Current Implementation Status

### Implemented

| Component | Location | Status |
|-----------|----------|--------|
| Job Pipeline (SCRAPE → FILTER → ANALYZE → SAVE) | `processor.py` | Complete |
| Company Pipeline (FETCH → EXTRACT → ANALYZE → SAVE) | `processor.py` | Complete |
| Source Discovery | `processor.py` | Complete |
| Loop Prevention (tracking_id, ancestry_chain, spawn_depth) | `manager.py` | Complete |
| Source Health Tracking | `job_sources_manager.py` | Complete |
| Strike-Based Filtering | `filters/strike_filter_engine.py` | Complete |

---

## Implementation Gaps

### Gap 1: Job → Company Spawning

**Current Behavior**:
```python
company = self.companies_manager.get_or_create_company(
    company_name=company_name,
    company_website=company_website,
    fetch_info_func=self.company_info_fetcher.fetch_company_info,
)
```
Creates company record **inline** with basic scraping. No queue item spawned.

**Problem**:
- Company gets minimal info (about/culture scraped inline)
- No tech stack detection
- No priority scoring
- No job board discovery
- Blocks job analysis until company fetch completes

**Decision Tree Requirement**:
When processing a job with unknown company → Spawn COMPANY_FETCH item for full analysis

**Impact**: Medium priority

---

### Gap 2: Record Status Tracking

**Current State**: Companies and sources lack status field

**Required States**:
- `status: "analyzing"` - Currently being processed
- `status: "pending_validation"` - Awaiting manual approval
- `status: "active"` - Validated and ready for use
- `status: "failed"` - Analysis failed permanently

**Required Changes**:
1. Add `status` field to companies collection
2. Add `status` field to job-sources collection
3. Update status at each pipeline stage
4. Query by status for monitoring dashboards

**Impact**: Low priority - Nice-to-have for visibility

---

### Gap 3: Data Quality Thresholds

**Current Behavior**:
```python
has_about = len(company.get("about", "")) > 100
has_culture = len(company.get("culture", "")) > 50

if has_about or has_culture:
    return company  # Use cached
```

Checks exist but not comprehensive.

**Required Implementation**:
```python
def should_reanalyze_company(company_data):
    # Check completeness threshold
    is_minimal = (about > 50 or culture > 25)
    is_good = (about > 100 and culture > 50)

    # Check freshness
    updated_at = company_data.get("updatedAt")
    is_stale = (now - updated_at) > 30 days

    # Re-analyze if sparse OR stale
    return (not is_good) or is_stale
```

**Impact**: Medium priority - Prevents redundant AI calls

---

### Gap 4: Job Board Confidence Level Handling

**Current Behavior**:
```python
if job_board_url and job_board_url != company_website:
    self._spawn_source_discovery(...)  # Always spawns
```

**Required Behavior**:
- **High confidence** (Greenhouse, RSS): Auto-spawn SOURCE_DISCOVERY
- **Medium confidence** (Workday, Lever): Store as metadata, require approval
- **Low confidence** (Generic HTML): Store as metadata, require validation

**Required Changes**:
1. Return confidence level from job board detection
2. Conditional spawning based on confidence
3. Store low/medium confidence URLs in company metadata for manual review

**Impact**: Medium priority - Prevents false positive source creation

---

### Gap 5: Source Scraping Queue Items

**Current State**: No queue item type for "scrape this specific source"

**Required**: New queue item type `SCRAPE_SOURCE`
```python
{
  "type": "scrape_source",
  "source_id": "job-source-doc-id",
  "url": "https://boards.greenhouse.io/netflix",
  "source_type": "greenhouse",
  "config": { "board_token": "netflix" }
}
```

**Impact**: High priority - Enables automated source scraping workflow

---

## Proposed Data Structure Changes

### Companies Collection - Add Status Field

**New Schema**:
```typescript
{
  name: string;
  website: string;
  about: string;
  culture: string;
  // NEW FIELDS
  status: "pending" | "analyzing" | "active" | "failed";
  analysis_progress?: {
    fetch: boolean;
    extract: boolean;
    analyze: boolean;
    save: boolean;
  };
  last_analyzed_at?: Timestamp;
}
```

### Job-Sources Collection - Enhance Status

**New Schema**:
```typescript
{
  enabled: boolean;
  status: "pending_validation" | "active" | "disabled" | "failed";
  discoveryConfidence: "high" | "medium" | "low";
  consecutiveFailures: number;
  // NEW FIELDS
  validation_required: boolean;
  auto_enabled: boolean;
  scraping_schedule?: {
    frequency: "hourly" | "daily" | "weekly";
    last_scraped_at: Timestamp;
    next_scrape_at: Timestamp;
  };
}
```

### Queue Item Model - Add SCRAPE_SOURCE

```python
class QueueItemType(str, Enum):
    JOB = "job"
    COMPANY = "company"
    SCRAPE = "scrape"
    SOURCE_DISCOVERY = "source_discovery"
    SCRAPE_SOURCE = "scrape_source"  # NEW

class SourceTier(str, Enum):
    S = "S"  # 150+ points
    A = "A"  # 100-149
    B = "B"  # 70-99
    C = "C"  # 50-69
    D = "D"  # 0-49
```

---

## Testing Requirements

### Unit Tests Needed

1. `tests/queue/test_scrape_source_processing.py`
   - Test SCRAPE_SOURCE handler for each source type
   - Test health tracking updates
   - Test job submission from source scrapes

2. `tests/storage/test_company_status.py`
   - Test status transitions
   - Test quality assessment
   - Test threshold checks

3. `tests/queue/test_company_spawning.py`
   - Test job → company spawning logic
   - Test stub company creation
   - Test async company data handling

### E2E Test Scenarios

1. **Full Company Discovery Flow**
   ```
   Submit Job (unknown company)
     → Job SCRAPE
     → Job FILTER
     → Job ANALYZE (spawns COMPANY_FETCH)
     → Job PENDING (waits for company)
     → Company FETCH/EXTRACT/ANALYZE/SAVE
     → Job ANALYZE (retries with company data)
     → Job SAVE
   ```

2. **Source Discovery to Scraping Flow**
   ```
   Submit Company
     → Company FETCH/EXTRACT/ANALYZE
     → Discovers Greenhouse board
     → Company SAVE (spawns SOURCE_DISCOVERY)
     → SOURCE_DISCOVERY (creates job-source)
     → Auto-spawn SCRAPE_SOURCE
     → SCRAPE_SOURCE (fetches jobs)
     → Jobs submitted to queue
   ```

3. **Confidence Level Handling**
   ```
   Company with generic careers page
     → Low confidence detected
     → NO SOURCE_DISCOVERY spawned
     → Metadata stored for manual review
   ```

---

## Risks & Mitigations

### Risk 1: Queue Depth Explosion
**Risk**: Spawning COMPANY and SCRAPE_SOURCE items increases queue depth

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
**Risk**: Job → Company → Source → Job creates loops

**Mitigation**:
- Existing loop prevention handles this
- Add E2E tests for circular cases
- Alert on spawn_depth > 5

### Risk 4: Stale Data Handling
**Risk**: Jobs waiting for company analysis might timeout

**Mitigation**:
- Retry with exponential backoff
- Max wait time: 5 minutes before FAILED
- Alert on jobs stuck in PENDING state
