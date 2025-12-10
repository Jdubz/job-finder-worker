> Status: Active
> Owner: @jdubz
> Last Updated: 2025-12-10

# Queue Worker Decision Tree

This document describes the decision tree logic for the worker queue system. It reflects the current single-task pipelines (post refactor) and how queue items flow end-to-end.

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
11. [Runtime Configuration](#runtime-configuration-from-job_finder_config)

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

The worker now runs **single-task pipelines** for all queue item types. Task state still tracks lifecycle (PENDING → PROCESSING → SUCCESS/SKIPPED/FAILED), but stage routing happens entirely in-memory inside each processor. `pipeline_state` is used only for lightweight status metadata (e.g., current stage, company wait counters, listing id) and no longer stores intermediate payloads for routing.

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
- **Single-task flow**: Tasks only mark SUCCESS once, at the end of SAVE (jobs) or save step (companies).
- **Requeue-only for company wait**: The only non-terminal hop is WAIT_COMPANY, which requeues the same JOB item with updated `pipeline_state`.

---

## Company Pipeline

**Single-pass (search → extract → save)**

Executed inside one queue item. No `company_sub_task`, no per-stage respawns.

**Process (matches `CompanyProcessor.process_company`)**
1) Resolve company name/ID and mark PROCESSING.
2) Fetch structured info via `CompanyInfoFetcher` (Wikipedia/Wikidata → web search → optional scrape); URL in the queue item is a hint only.
3) Save/upsert company record and normalize keys (e.g., `headquarters` → `headquartersLocation`).
4) Self-heal source links for the company when possible.
5) Detect job board URL from extracted website or provided URL; if found and not tracked, spawn `SOURCE_DISCOVERY` (single allowed spawn).

**Success**: Company record saved (complete/partial/minimal). **Failure**: Only for unrecoverable issues (e.g., missing company_name).

Source auto-disable, spawn safety, and terminal state handling follow the shared rules in [Queue Processing States](#queue-processing-states).

---

## Job Listing Pipeline

**Single-task with optional company wait**

Pipeline (matches `JobProcessor.process_job`):
1) **SCRAPE** – Load job data from the source (manual submission, job_listings row, or legacy scraped_data).
2) **COMPANY_LOOKUP** – Attach company record (create stub if missing) and persist `company_id` on the listing.
3) **WAIT_COMPANY (optional requeue)** – If company data is sparse, spawn enrichment and requeue the job (max `MAX_COMPANY_WAIT_RETRIES`). When the company is “good” (see CompaniesManager.has_good_company_data), continue immediately.
4) **AI_EXTRACTION** – Extract structured job info (seniority, tech, arrangement, dates). Failures mark the item FAILED.
5) **SCORING** – Deterministic ScoringEngine returns `ScoreBreakdown` (final_score, adjustments, rejection_reason). If `passed=False`, item is SKIPPED.
6) **AI_MATCH_ANALYSIS** – AI matcher returns reasoning; uses deterministic score as `deterministic_score` and enforces `min_match_score`.
7) **SAVE_MATCH** – Persist to job_matches, update job_listings status/match_score, mark queue SUCCESS.

Status updates are written via `update_status(..., pipeline_state={"pipeline_stage": stage})` for UI visibility only; stages do not spawn new queue items.

Failure/skip handling:
- SCRAPE/EXTRACTION/ANALYSIS errors → FAILED
- Deterministic scoring rejection → SKIPPED (with scoring/extraction data on listing)
- Below `min_match_score` → SKIPPED

Emitted events: `job:scraped`, `job:company_lookup`, `job:waiting_company`, `job:extraction`, `job:scoring`, `job:analysis`, `job:saved`.

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

**Config location**: `job_finder_config` row `job-filters` (stop lists + strike settings).

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

## Runtime Configuration (from `job_finder_config`)

All operational knobs are loaded by `ConfigLoader` from SQLite. Processors fail fast if required sections are missing to avoid silent drift.

- `prefilter-policy` – Hard rejections + strike settings applied in `ScraperIntake` before queueing.
- `match-policy` – Deterministic scoring weights/thresholds (timezone penalties, skill weights, company weights) used by `ScoringEngine`.
- `worker-settings` – Runtime flags (`isProcessingEnabled`, scrape config, task delays) consumed by all processors.
- `ai-settings` – AgentManager agents, budgets, and taskFallbacks.
- `personal-info` – User timezone/city/relocation flags merged into location scoring.

To change thresholds or weights, update these config rows (not code) and ensure required fields remain present; see `ConfigLoader` validations for required keys.

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
