> Status: Active
> Owner: @jdubz
> Last Updated: 2025-11-25

# Queue Worker Decision Tree

This document describes the decision tree logic for the worker queue system. It provides both a high-level conceptual flow and detailed implementation specifics.

## Terminology

| Term | Definition |
|------|------------|
| **Task** | A work unit in the queue (generic term for all queue items) |
| **Job** | An employment opportunity (job listing or job match) |
| **Job Listing** | A scraped employment opportunity before matching |
| **Job Match** | A job listing that passed filters and AI analysis |
| **Pipeline** | A sequence of stages that process a task type |
| **Stage** | A discrete step within a pipeline (e.g., FETCH, EXTRACT) |
| **State** | The current status of a task (PENDING, PROCESSING, etc.) |

## Table of Contents
1. [High-Level Overview](#high-level-overview)
2. [State Machine Architecture](#state-machine-architecture)
3. [Loop Prevention Mechanisms](#loop-prevention-mechanisms)
4. [Data Quality Standards](#data-quality-standards)
5. [Queue Processing States](#queue-processing-states)
6. [Company Pipeline](#company-pipeline)
7. [Job Source Pipeline](#job-source-pipeline)
8. [Job Listing Pipeline](#job-listing-pipeline)
9. [Scraper Instruction Schemas](#scraper-instruction-schemas)
10. [Error Handling](#error-handling)
11. [Configuration Constants](#configuration-constants)

---

## High-Level Overview

The system processes three main entity types through queue tasks:

```
┌─────────────┐         ┌──────────────┐         ┌──────────────┐
│  Companies  │────────▶│ Job Sources  │────────▶│ Job Listings │
└─────────────┘         └──────────────┘         └──────────────┘
      │                       │                         │
      │                       │                         └──▶ Analyze Match ──▶ Job Match!
      │                       └──▶ Scrape Job Listings
      └──▶ Discover Job Boards
```

### Task Types:
- **COMPANY**: Analyzes a company (fetch website, extract info, detect job boards)
- **JOB** (Job Listing): Processes an employment opportunity through the matching pipeline
- **SOURCE_DISCOVERY**: Discovers and validates a new job source
- **SCRAPE_SOURCE**: Scrapes job listings from a configured source
- **SCRAPE**: Batch scrape operation

### Key Relationships:
- **Company tasks** can spawn **SOURCE_DISCOVERY tasks** when job boards are discovered
- **SCRAPE_SOURCE tasks** spawn **Job Listing tasks** when scraping finds new postings
- **Job Listing tasks** may spawn **COMPANY tasks** if the company is unknown
- **Each spawn path uses loop prevention** to avoid circular dependencies

---

## State Machine Architecture

The queue worker implements a **state machine** where:
- **Task state** determines processing eligibility (PENDING, PROCESSING, SUCCESS, etc.)
- **Pipeline stage** determines which operation to perform next (FETCH, EXTRACT, etc.)
- **Pipeline state** (data accumulated) determines stage routing

### State vs Stage vs Pipeline State

```
┌─────────────────────────────────────────────────────────────────────┐
│ Task                                                                 │
├─────────────────────────────────────────────────────────────────────┤
│ status: PROCESSING          ← Task STATE (queue status)             │
│ pipeline_stage: "extract"   ← Current STAGE in pipeline             │
│ pipeline_state: {           ← Accumulated data (determines routing) │
│   "html_content": "...",                                            │
│   "extracted_info": {...}                                           │
│ }                                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

### Stage Routing Patterns

**Company Pipeline** - Single pass (no staging):
```python
if item.type == QueueItemType.COMPANY:
    → process_company()  # fetch → extract → analyze → save
```

**Job Listing Pipeline** - Uses state-based routing via `pipeline_state`:
```python
state = item.pipeline_state or {}
if "job_data" not in state:
    → do_job_scrape()      # Stage: SCRAPE
elif "filter_result" not in state:
    → do_job_filter()      # Stage: FILTER
elif "match_result" not in state:
    → do_job_analyze()     # Stage: ANALYZE
else:
    → do_job_save()        # Stage: SAVE
```

### Why Two Routing Patterns?

| Pattern | Used By | Behavior | Rationale |
|---------|---------|----------|-----------|
| Explicit sub_task | Company | Spawns new task per stage | Granular control, independent retries |
| State-based | Job Listing | Same task progresses through stages | Simpler E2E monitoring, atomic flow |

Both patterns use the same underlying state machine for task status transitions.

---

## Loop Prevention Mechanisms

**Critical**: Every task spawn is protected against infinite loops using three mechanisms:

### 1. Tracking ID
- UUID generated at root task, inherited by all spawned children
- Groups related tasks into a processing lineage
- Used to query for duplicate work and circular dependencies

### 2. Ancestry Chain
- List of parent task IDs from root to current
- Before spawning, check if target URL already exists in ancestry
- Prevents circular patterns: `Job Listing → Company → Source → Job Listing` (same URL)

### 3. Spawn Depth
- Counter incremented with each spawn
- Default maximum: 10 levels deep
- Prevents runaway spawning even without circular URLs

### Spawn Safety Checks
Before creating a new task, the system verifies:
1. Spawn depth < max_spawn_depth (default: 10)
2. Target URL not in ancestry chain (no circular dependency)
3. No pending/processing task for same URL+type in this lineage
4. Task hasn't already reached terminal state (FILTERED, SKIPPED, FAILED, or final SUCCESS)

**If any check fails, spawning is blocked and logged as a warning.**

---

## Data Quality Standards

### Record Creation Policy
To prevent race conditions while keeping the database clean:

**Create immediately with:**
- Primary identifiers: `name`, `website`/`url`
- Reference IDs: `companyId`, `sourceId`, `parentItemId`
- Status field: `'analyzing'`, `'pending_validation'`, `'active'`
- Tracking metadata: `tracking_id`, `ancestry_chain`, `spawn_depth`

**Omit until analysis completes:**
- Company: `about`, `culture`, `mission`, `size`, `techStack`, `tier`, `priorityScore`
- Job Source: `selectors`, `api_endpoints`, `scraper_config`, `discovery_confidence`
- Job: `description`, `title`, `location`, `requirements`

### Data Completeness Thresholds

#### Company:
- **Minimal**: `name + website + (about > 50 chars OR culture > 25 chars)`
- **Good**: `name + website + about > 100 chars + culture > 50 chars`
- **Skip re-analysis**: Good threshold met AND `updatedAt < 30 days ago`

#### Job Source:
- **Valid**: `url + sourceType + basic config` (e.g., `board_token` OR `base_url` OR `selectors`)
- **Complete**: Valid + tested successfully + `confidence = 'high'`
- **Requires manual validation**: `confidence = 'medium'` OR `confidence = 'low'`

#### Job Listing:
- **Minimal**: `url + title + company + description > 100 chars`
- **Good**: Minimal + `location + posted_date + requirements`

---

## Queue Processing States

Every task progresses through states with terminal exit points:

### States
- **PENDING**: Waiting to be processed (entry state)
- **PROCESSING**: Currently being processed
- **SUCCESS**: Completed successfully (may spawn next stage)
- **FILTERED**: Rejected by filter engine (terminal - job listings only)
- **SKIPPED**: Below threshold or duplicate (terminal)
- **FAILED**: Error after max retries (terminal)

### State Transitions
```
PENDING ──▶ PROCESSING ──┬──▶ SUCCESS ──▶ (spawn next stage or terminal)
                         │
                         ├──▶ FILTERED (terminal - failed filters)
                         │
                         ├──▶ SKIPPED (terminal - below threshold/duplicate)
                         │
                         └──▶ FAILED ──▶ retry ──▶ PENDING (if retries < max_retries)
                                     └──▶ FAILED (terminal - max retries exceeded)
```

### Terminal vs Non-Terminal SUCCESS
- **Non-terminal SUCCESS**: Intermediate pipeline stages (SCRAPE, FILTER, ANALYZE)
  - Task marked SUCCESS, spawns/continues to next stage
  - Allows same URL to progress through pipeline
- **Terminal SUCCESS**: Final stage (SAVE)
  - Task marked SUCCESS, no further spawning
  - Blocks future spawns for same URL in this lineage

---

## Company Pipeline

**Single-pass**: `fetch → extract → analyze → save`

Executed inside one queue item (no company_sub_task field, no spawned stages).

**Process**:
1. Fetch HTML from multiple pages ({website}/about, /about-us, /company, /careers, homepage).
2. Extract about/culture/mission via heuristics + AI fallback.
3. Analyze tech stack and detect job board URL from fetched content.
4. Save company record with extracted fields and tech stack.
5. If a job board URL is detected and no existing source matches, enqueue a SOURCE_DISCOVERY item.

**Success**: Company record saved; if a job board is detected and no source exists, spawn SOURCE_DISCOVERY.
**Failure**: Mark FAILED (retry up to 3 times) with error details; no additional company stages are spawned.

---

### Stage 2: COMPANY_EXTRACT
**Input**: `pipeline_state.html_content` from FETCH

**Process**:
1. Combine all HTML content
2. Use AI (Claude Sonnet - expensive but accurate) to extract:
   - `about`: Company description
   - `culture`: Culture/values information
   - `mission`: Mission statement
   - `size`: Employee count or size description
   - `headquarters_location`: HQ location
   - `industry`: Industry/sector
   - `founded`: Year founded
3. Fallback to heuristics if AI extraction fails
4. Store extracted info in `pipeline_state.extracted_info`

**Success**: Spawn `COMPANY_ANALYZE`
**Failure**: Mark FAILED (retry up to 3 times)

---

### Stage 3: COMPANY_ANALYZE
**Input**: `pipeline_state.extracted_info` from EXTRACT

**Process** (rule-based, no AI cost):

#### 3.1 Tech Stack Detection
Pattern match from company info + HTML for technologies:
- Languages: Python, JavaScript, Java, Go, Rust, Ruby, PHP, C#
- Frontend: React, Vue, Angular, Svelte
- Backend/Infra: Docker, Kubernetes, AWS, GCP, Azure
- Databases: PostgreSQL, MySQL, MongoDB, Redis
- ML/AI: TensorFlow, PyTorch, machine learning keywords

#### 3.2 Job Board Discovery
Search for job board patterns in careers page:
- Greenhouse: `boards.greenhouse.io/{board_token}`
- Workday: `{company}.myworkdayjobs.com`
- Lever, Jobvite, SmartRecruiters, etc.
- Generic careers pages: `{website}/careers`, `{website}/jobs`

**Confidence Levels**:
- **High**: Greenhouse (API available), Workday (standard structure), RSS feeds
- **Medium**: Lever, Jobvite (requires testing)
- **Low**: Generic HTML careers pages (AI selector discovery needed)

#### 3.3 Priority Scoring
Calculate numeric score and assign tier (S/A/B/C/D):
- Portland office: **+50 points**
- Tech stack alignment: **up to +100 points** (based on user's tech ranks from config)
- Remote-first culture: **+15 points**
- AI/ML focus: **+10 points**

**Tiers**:
- **S**: 150+ points (top priority)
- **A**: 100-149 points (high priority)
- **B**: 70-99 points (medium priority)
- **C**: 50-69 points (low priority)
- **D**: 0-49 points (minimal priority)

#### 3.4 Job Board Spawn Decision
If job board found:
- **High confidence**: Immediately spawn `SOURCE_DISCOVERY` queue item
- **Medium/Low confidence**: Store as company metadata `{ job_board_url, confidence }`, require manual approval

**Success**: Spawn `COMPANY_SAVE`
**Skip**: If insufficient data extracted, mark SKIPPED

---

### Stage 4: COMPANY_SAVE
**Input**: All `pipeline_state` data from previous stages

**Process**:
1. Build complete company record:
   ```json
   {
     "name": "Company Name",
     "website": "https://...",
     "about": "...",
     "culture": "...",
     "mission": "...",
     "size": "...",
     "company_size_category": "large|medium|small",
     "headquarters_location": "...",
     "industry": "...",
     "founded": "...",
     "techStack": ["python", "react", ...],
     "tier": "A",
     "priorityScore": 105,
     "analysis_status": "complete"
   }
   ```
2. Save enriched company and match data into SQLite tables (companies, job_matches); SQLite transactions guarantee atomicity for critical operations
- Queue deduplication catches most races:
  - Check URL not in queue before adding
  - Check URL not in job-matches before adding
- Spawn safety checks prevent loops but may allow duplicate analysis attempts
- **Trade-off**: Better performance vs 100% deduplication guarantee

### Source Health Tracking
**Auto-disable failing sources:**
1. Track `consecutiveFailures` counter per source
2. Increment on each scraping failure
3. Reset to 0 on successful scrape
4. **Auto-disable** after 5 consecutive failures
5. Require manual re-enable after auto-disable

**Purpose**: Prevent wasting resources on broken scrapers while allowing transient failures

### Terminal State Handling
Once a task reaches a terminal state, it cannot be re-processed in the same lineage:
- **FILTERED**: Job listing failed strike-based filters (no retry)
- **SKIPPED**: Job listing below match threshold or duplicate (no retry)
- **FAILED**: Error after max retries (requires manual intervention)
- **SUCCESS (final)**: Completed SAVE stage (no further processing)

**Non-terminal SUCCESS**: Intermediate stages (SCRAPE, FILTER, ANALYZE) mark SUCCESS then continue/spawn next stage

---

## Processing Notes

### Queue Priority
- **Current**: FIFO by `created_at` (oldest first)
- **Future optimization**: Prioritize S/A tier companies
  - Could batch process by tier
  - Balance between priority and fairness

### Stop Lists
**Early rejection before scraping:**
- Excluded companies: Match against configured stop list
- Excluded domains: Block entire domains (e.g., competitors)
- Excluded keywords: Filter by patterns in URL/title

**Location**: `config/config.yaml` under `filters.stopList`

### Performance Optimization

**Current approach** (serial processing):
- Company analysis: Fetch → extract → analyze → save (one at a time)
- Simpler coordination, atomic operations
- All-or-nothing success

**Future optimization consideration**:
```python
# Consider parallelizing company parameter fetches (size, location, etc.)
# Could spawn multiple tasks:
#   - COMPANY_SIZE (web search for employee count)
#   - COMPANY_LOCATION (web search for offices)
#   - COMPANY_CULTURE (scrape about page)
#   - COMPANY_JOB_BOARD (scrape careers page)
# Benefits: Parallel processing, fine-grained retry
# Trade-offs: Complex coordination, partial success handling
# Decision: Start with serial, optimize if it becomes a bottleneck
```

---

## Configuration Constants

Key constants used by the queue worker. These are currently hardcoded in `constants.py` but are candidates for future configurability via the `job-finder-config` database table.

### Filter Thresholds

| Constant | Value | Location | Description |
|----------|-------|----------|-------------|
| `DEFAULT_STRIKE_THRESHOLD` | 5 | `constants.py` | Maximum strikes before job listing is FILTERED |
| `MIN_MATCH_SCORE` | 80 | `constants.py` | Minimum AI match score to save job match |
| `PORTLAND_MATCH_SCORE` | 65 | `constants.py` | Lower threshold when Portland office detected |
| `HIGH_PRIORITY_THRESHOLD` | 85 | `constants.py` | Score threshold for "High" priority |
| `MEDIUM_PRIORITY_THRESHOLD` | 70 | `constants.py` | Score threshold for "Medium" priority |

### Company Scoring

| Constant | Value | Location | Description |
|----------|-------|----------|-------------|
| `PORTLAND_OFFICE_BONUS` | 50 | `constants.py` | Priority points for Portland office |
| `TECH_STACK_MAX_POINTS` | 100 | `constants.py` | Max points from tech stack alignment |
| `REMOTE_FIRST_BONUS` | 15 | `constants.py` | Bonus for remote-first culture |
| `AI_ML_FOCUS_BONUS` | 10 | `constants.py` | Bonus for AI/ML companies |

### Company Tier Thresholds

| Tier | Points | Description |
|------|--------|-------------|
| S | 150+ | Top priority - immediate processing |
| A | 100-149 | High priority |
| B | 70-99 | Medium priority |
| C | 50-69 | Low priority |
| D | 0-49 | Minimal priority |

### Queue Processing

| Constant | Value | Location | Description |
|----------|-------|----------|-------------|
| `MAX_RETRIES` | 3 | `constants.py` | Maximum retry attempts before FAILED |
| `MAX_SPAWN_DEPTH` | 10 | `models.py` | Maximum task spawn depth |
| `MAX_CONSECUTIVE_FAILURES` | 5 | `constants.py` | Source auto-disable threshold |

### Data Quality

| Constant | Value | Location | Description |
|----------|-------|----------|-------------|
| `COMPANY_ABOUT_MIN` | 50 | `companies_manager.py` | Minimal about text length |
| `COMPANY_ABOUT_GOOD` | 100 | `companies_manager.py` | Good about text length |
| `COMPANY_CULTURE_MIN` | 25 | `companies_manager.py` | Minimal culture text length |
| `COMPANY_CULTURE_GOOD` | 50 | `companies_manager.py` | Good culture text length |

### Future Configurability

These constants should eventually be stored in the `job-finder-config` SQLite table to allow runtime configuration without code changes:

```sql
CREATE TABLE job_finder_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    value_type TEXT NOT NULL,  -- 'int', 'float', 'string', 'json'
    description TEXT,
    updated_at TEXT
);

-- Example entries:
INSERT INTO job_finder_config VALUES
    ('filter.strike_threshold', '5', 'int', 'Max strikes before FILTERED', ...),
    ('match.min_score', '80', 'int', 'Minimum AI match score', ...),
    ('company.portland_bonus', '50', 'int', 'Portland office priority bonus', ...);
```

**Priority**: Low - Implement after system proves stable with hardcoded values.

---

## Summary

This decision tree provides a comprehensive framework for processing companies, job sources, and job listings through a task-based queue system. Key design principles:

1. **Safety First**: Loop prevention mechanisms protect against infinite recursion
2. **Cost Optimization**: Cheap models for scraping, expensive only for analysis
3. **Clean Data**: Create records immediately with known info, fill in after analysis
4. **Graceful Degradation**: Retry logic, health tracking, and terminal states handle failures
5. **Clear Thresholds**: Quantitative criteria for data quality and match scoring
6. **Future-Proof**: Markers for optimization opportunities without over-engineering

**Remember**: Any scrape that fails should save data as "unknown" to flag for inspection.
