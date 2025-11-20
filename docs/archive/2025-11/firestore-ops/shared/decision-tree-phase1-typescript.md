> Status: Archived
> Owner: @jdubz
> Last Updated: 2025-10-10

# Phase 1: TypeScript Shared-Types Changes

This document contains the TypeScript changes needed in the `job-finder-shared-types` repository for Phase 1 implementation.

**Repository**: https://github.com/Jdubz/job-finder-shared-types
**Branch**: Create `feature/decision-tree-phase1`
**Files to modify**: `src/queue.types.ts`

---

## Changes Required

### 1. Add SCRAPE_SOURCE to QueueItemType

**File**: `src/queue.types.ts`

**Current**:

```typescript
export type QueueItemType = "job" | "company" | "scrape" | "source_discovery";
```

**New**:

```typescript
export type QueueItemType =
  | "job"
  | "company"
  | "scrape"
  | "source_discovery"
  | "scrape_source"; // NEW: For automated source scraping
```

---

### 2. Add Status Enums

**Add after QueueItemType definition**:

```typescript
/**
 * Status for company records in Firestore.
 * Tracks the analysis state of a company.
 */
export type CompanyStatus =
  | "pending" // Initial state, not yet analyzed
  | "analyzing" // Currently being processed through pipeline
  | "active" // Analysis complete, ready for use
  | "failed"; // Analysis failed after retries

/**
 * Status for job source records in Firestore.
 * Tracks the validation and operational state of a scraping source.
 */
export type SourceStatus =
  | "pending_validation" // Discovered but needs manual validation
  | "active" // Validated and enabled for scraping
  | "disabled" // Manually or automatically disabled
  | "failed"; // Permanently failed validation or operation

/**
 * Priority tier for company/source scraping.
 * Based on scoring algorithm (Portland office, tech stack alignment, etc.)
 */
export type SourceTier = "S" | "A" | "B" | "C" | "D";
```

---

### 3. Add ScrapeSourceQueueItem Interface

**Add after existing queue item interfaces**:

```typescript
/**
 * Queue item for scraping a specific job source.
 *
 * Created when:
 * - A company analysis discovers a job board (high confidence)
 * - A source scheduler triggers periodic scraping
 * - Manual source scrape is requested
 *
 * This enables automated scraping workflow with health tracking.
 */
export interface ScrapeSourceQueueItem extends BaseQueueItem {
  type: "scrape_source";

  /** Reference to job-sources Firestore document */
  source_id: string;

  /** Source URL to scrape */
  url: string;

  /** Type of source (greenhouse, rss, workday, etc.) */
  source_type: "greenhouse" | "rss" | "workday" | "lever" | "api" | "scraper";

  /** Source-specific configuration (selectors, API keys, etc.) */
  source_config: Record<string, any>;

  /** Priority tier (optional, for scheduling optimization) */
  tier?: SourceTier;

  /** Company this source belongs to (optional) */
  company_id?: string;
  company_name?: string;
}
```

---

### 4. Extend Company Interface (Optional)

**File**: `src/firestore.types.ts` (if exists)

**Add to Company interface**:

```typescript
export interface Company {
  // ... existing fields ...

  /** Analysis status of company */
  status?: CompanyStatus;

  /** Timestamp of last analysis */
  last_analyzed_at?: Timestamp;

  /** Progress tracking for multi-stage pipeline */
  analysis_progress?: {
    fetch: boolean;
    extract: boolean;
    analyze: boolean;
    save: boolean;
  };

  /** Pending job boards awaiting validation (medium/low confidence) */
  pending_job_boards?: Array<{
    url: string;
    confidence: "high" | "medium" | "low";
    requires_validation: boolean;
    discovered_at: Timestamp;
  }>;
}
```

---

### 5. Extend JobSource Interface (Optional)

**File**: `src/firestore.types.ts` (if exists)

**Add to JobSource interface**:

```typescript
export interface JobSource {
  // ... existing fields ...

  /** Operational status of source */
  status?: SourceStatus;

  /** Whether source requires manual validation before use */
  validation_required?: boolean;

  /** Whether source was auto-enabled (vs manual enable) */
  auto_enabled?: boolean;

  /** Scraping schedule configuration */
  scraping_schedule?: {
    frequency: "hourly" | "daily" | "weekly";
    last_scraped_at: Timestamp;
    next_scrape_at: Timestamp;
  };
}
```

---

## Testing the Changes

After making the changes, update the version and publish:

```bash
# In job-finder-shared-types repo
npm version minor  # Bump to next minor version (e.g., 1.3.0 → 1.4.0)
npm run build
npm publish
git add .
git commit -m "feat: add SCRAPE_SOURCE queue type and status enums for Phase 1"
git push origin feature/decision-tree-phase1
```

Create a PR to merge into main.

---

## Updating Dependent Projects

Once published, update the package version in:

1. **job-finder-worker** (Python - no npm dependency, manual type sync)
2. **job-finder-FE** (TypeScript)
   ```bash
   npm install @jdubz/job-finder-shared-types@latest
   ```
3. **job-finder-BE** (TypeScript)
   ```bash
   npm install @jdubz/job-finder-shared-types@latest
   ```

---

## Validation

After publishing, verify:

- [ ] TypeScript compilation succeeds in all dependent projects
- [ ] No breaking changes to existing queue item types
- [ ] New types are available for import:
  ```typescript
  import {
    CompanyStatus,
    SourceStatus,
    SourceTier,
    ScrapeSourceQueueItem,
  } from "@jdubz/job-finder-shared-types";
  ```

---

## Next Steps

After TypeScript changes are merged and published:

1. Proceed with Python model updates (Phase 1.2)
2. Update Python code to use new queue types
3. Add status tracking to managers (Phase 1.3-1.4)
