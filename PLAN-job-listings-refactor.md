# Job Listings Refactor Plan

## Overview

Refactor the job data architecture to separate **listing data** from **analysis data**:
- `job_listings` - stores raw job data (fingerprinting, dedup source of truth)
- `job_matches` - stores AI analysis results only (FK to job_listing)

This prevents duplicate analysis, provides better data organization, and enables proper audit trails.

---

## Current Architecture

### Tables
- `job_matches`: stores BOTH listing data (url, title, description, etc.) AND analysis results
- No persistent record of jobs that pass pre-filter but fail AI analysis

### Duplicate Check Flow
1. `ScraperIntake.submit_jobs()` checks `job_matches.url` via `job_storage.job_exists()`
2. Only analyzed jobs are tracked - jobs that fail AI score threshold are lost

### Problems
- Listing data duplicated: scraped data in queue → job_matches
- No record of filtered-out jobs (can't track why jobs weren't analyzed)
- `job_matches` has redundant fields: `company_name`, `company_id`, `company_info` (all available via FK)
- Can't query "all jobs from source X" without analysis

---

## Proposed Architecture

### New `job_listings` Table
```sql
CREATE TABLE job_listings (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  source_id TEXT REFERENCES job_sources(id),
  company_id TEXT REFERENCES companies(id),

  -- Listing data (from scraper)
  title TEXT NOT NULL,
  company_name TEXT NOT NULL,
  location TEXT,
  salary_range TEXT,
  description TEXT NOT NULL,
  posted_date TEXT,

  -- Metadata
  status TEXT NOT NULL CHECK (status IN ('pending', 'filtered', 'analyzing', 'analyzed', 'skipped')),
  filter_result TEXT,  -- JSON if filtered out

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_job_listings_source ON job_listings(source_id);
CREATE INDEX idx_job_listings_company ON job_listings(company_id);
CREATE INDEX idx_job_listings_status ON job_listings(status);
```

### Modified `job_matches` Table

**Remove columns:**
- `url` (use job_listing.url)
- `company_name` (use job_listing.company_name or company.name)
- `company_id` (use job_listing.company_id)
- `job_title` (use job_listing.title)
- `location` (use job_listing.location)
- `salary_range` (use job_listing.salary_range)
- `job_description` (use job_listing.description)
- `company_info` (derive from company FK)

**Add columns:**
- `job_listing_id TEXT NOT NULL REFERENCES job_listings(id)`

**Final schema:**
```sql
CREATE TABLE job_matches (
  id TEXT PRIMARY KEY,
  job_listing_id TEXT NOT NULL REFERENCES job_listings(id),

  -- Analysis results only
  match_score REAL NOT NULL,
  matched_skills TEXT,
  missing_skills TEXT,
  match_reasons TEXT,
  key_strengths TEXT,
  potential_concerns TEXT,
  experience_match REAL,
  application_priority TEXT NOT NULL CHECK (application_priority IN ('High','Medium','Low')),
  customization_recommendations TEXT,
  resume_intake_json TEXT,

  -- Metadata
  analyzed_at TEXT,
  submitted_by TEXT,
  queue_item_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_job_matches_listing ON job_matches(job_listing_id);
CREATE INDEX idx_job_matches_priority ON job_matches(application_priority);
```

---

## Implementation Steps

### Phase 1: Database Migration

**File: `infra/sqlite/migrations/023_job_listings_table.sql`**

1. Create `job_listings` table
2. Migrate data from `job_matches` to `job_listings` (extract listing fields)
3. Add `job_listing_id` column to `job_matches`
4. Populate `job_listing_id` FK for existing records
5. Drop legacy columns from `job_matches`
6. Update unique constraints

### Phase 2: Shared Types

**File: `shared/src/job.types.ts`**

1. Create `JobListingRecord` interface (persisted listing):
   ```typescript
   export interface JobListingRecord {
     id: string
     url: string
     sourceId?: string | null
     companyId?: string | null
     title: string
     companyName: string
     location?: string | null
     salaryRange?: string | null
     description: string
     postedDate?: string | null
     status: 'pending' | 'filtered' | 'analyzing' | 'analyzed' | 'skipped'
     filterResult?: Record<string, unknown> | null
     createdAt: TimestampLike
     updatedAt: TimestampLike
   }
   ```

2. Update `JobMatch` interface:
   - Add `jobListingId: string`
   - Remove: `url`, `companyName`, `companyId`, `jobTitle`, `location`, `salaryRange`, `jobDescription`, `companyInfo`

3. Create `JobMatchWithListing` type for API responses:
   ```typescript
   export interface JobMatchWithListing extends JobMatch {
     listing: JobListingRecord
     company?: Company | null
   }
   ```

**File: `shared/src/api/job-listing.types.ts`**

1. Create API types for job listings CRUD

### Phase 3: Backend - New Job Listings Module

**Files:**
- `job-finder-BE/server/src/modules/job-listings/job-listing.repository.ts`
- `job-finder-BE/server/src/modules/job-listings/job-listing.routes.ts`

1. `JobListingRepository` class:
   - `list(options)` - paginated list with filters
   - `getById(id)` - single record
   - `getByUrl(url)` - lookup by URL
   - `create(listing)` - insert new listing
   - `updateStatus(id, status)` - update status
   - `delete(id)` - soft/hard delete

2. Routes:
   - `GET /api/job-listings` - list with filters
   - `GET /api/job-listings/:id` - single record
   - `DELETE /api/job-listings/:id` - delete

### Phase 4: Backend - Refactor Job Matches

**File: `job-finder-BE/server/src/modules/job-matches/job-match.repository.ts`**

1. Update `JobMatchRow` type - remove listing columns, add `job_listing_id`
2. Update `buildJobMatch()` - join with job_listings for full data
3. Update `list()` - JOIN with job_listings table
4. Update `upsert()` - only insert analysis columns

**File: `job-finder-BE/server/src/modules/job-matches/job-match.routes.ts`**

1. Update response format to include listing data via join

### Phase 5: Worker - Job Listing Storage

**File: `job-finder-worker/src/job_finder/storage/job_listing_storage.py`**

New class:
```python
class JobListingStorage:
    def listing_exists(self, url: str) -> bool
    def get_listing_by_url(self, url: str) -> Optional[Dict]
    def create_listing(self, job_data: Dict, source_id: str = None) -> str
    def update_status(self, listing_id: str, status: str) -> None
    def batch_check_exists(self, urls: List[str]) -> Dict[str, bool]
```

### Phase 6: Worker - Scraper Intake Refactor

**File: `job-finder-worker/src/job_finder/job_queue/scraper_intake.py`**

1. Inject `job_listing_storage` instead of `job_storage`
2. Update `submit_jobs()`:
   - Check `job_listing_storage.listing_exists()` instead of `job_storage.job_exists()`
   - Create job_listing record when job passes pre-filter
   - Store `job_listing_id` in queue item metadata

### Phase 7: Worker - Job Processor Refactor

**File: `job-finder-worker/src/job_finder/job_queue/processors/job_processor.py`**

1. Update `_do_job_filter()`:
   - Create job_listing record with status='pending' after scrape
   - Update status to 'filtered' if rejected
   - Update status to 'analyzing' if passed

2. Update `_do_job_analyze()`:
   - Update job_listing status to 'skipped' if below threshold
   - Update job_listing status to 'analyzed' on success

3. Update `_do_job_save()`:
   - Save job_match with `job_listing_id` FK
   - Don't duplicate listing data

### Phase 8: Worker - Job Storage Refactor

**File: `job-finder-worker/src/job_finder/storage/job_storage.py`**

1. Update `save_job_match()`:
   - Accept `job_listing_id` parameter
   - Remove listing field inserts
   - Only insert analysis columns

2. Remove or deprecate `job_exists()` (moved to listing storage)

### Phase 9: Frontend - Job Listings Page

**Rename:**
- `job-finder-FE/src/pages/job-finder/` → `job-finder-FE/src/pages/job-listings/`
- Component: `JobFinderPage` → `JobListingsPage`

**File: `job-finder-FE/src/pages/job-listings/JobListingsPage.tsx`**

1. New layout matching Companies/Sources pages:
   - Header with "Job Listings" title and "Add Job" button
   - Filterable table with columns: Title, Company, Source, Status, Date
   - Click row to open details modal

2. Details modal showing ALL properties:
   - ID, URL (link), Source, Company (link)
   - Title, Location, Salary, Description, Posted Date
   - Status, Filter Result (if filtered)
   - Timestamps

**File: `job-finder-FE/src/hooks/useJobListings.ts`**

New hook:
```typescript
export function useJobListings(options?: ListJobListingsRequest) {
  // Fetch, create, delete job listings
}
```

**File: `job-finder-FE/src/api/job-listings-client.ts`**

New API client class for job listings CRUD.

### Phase 10: Frontend - Update Job Matches

**File: `job-finder-FE/src/pages/job-applications/JobApplicationsPage.tsx`**

1. Update to use `JobMatchWithListing` type
2. Access listing data via `match.listing.title`, etc.

**File: `job-finder-FE/src/api/job-matches-client.ts`**

1. Update response types to include listing data

### Phase 11: Navigation & Routes

**File: `job-finder-FE/src/router.tsx`**

1. Update route path: `/job-finder` → `/job-listings`
2. Add redirect from old path for backwards compatibility

**File: `job-finder-FE/src/components/layout/Sidebar.tsx`**

1. Rename nav item: "Jobs" → "Job Listings"

### Phase 12: Cleanup

1. Delete unused files:
   - `job-finder-FE/src/pages/job-finder/components/QueueStatusTable.tsx` (if not needed)

2. Update tests across all layers

3. Remove backwards compatibility code (no migration needed per user)

---

## Data Flow After Refactor

```
Scraper → Pre-filter → job_listings (status=pending)
                            ↓
                       Filter Stage → Update status (filtered | analyzing)
                            ↓
                       AI Analysis → Update status (skipped | analyzed)
                            ↓
                       job_matches (FK to listing)
```

---

## Files to Create/Modify

### New Files
- `infra/sqlite/migrations/023_job_listings_table.sql`
- `shared/src/api/job-listing.types.ts`
- `job-finder-BE/server/src/modules/job-listings/job-listing.repository.ts`
- `job-finder-BE/server/src/modules/job-listings/job-listing.routes.ts`
- `job-finder-worker/src/job_finder/storage/job_listing_storage.py`
- `job-finder-FE/src/pages/job-listings/JobListingsPage.tsx`
- `job-finder-FE/src/hooks/useJobListings.ts`
- `job-finder-FE/src/api/job-listings-client.ts`

### Modified Files
- `shared/src/job.types.ts` - Update JobMatch, add JobListingRecord
- `shared/src/index.ts` - Export new types
- `job-finder-BE/server/src/app.ts` - Register new routes
- `job-finder-BE/server/src/modules/job-matches/job-match.repository.ts` - Refactor
- `job-finder-BE/server/src/modules/job-matches/job-match.routes.ts` - Update responses
- `job-finder-worker/src/job_finder/job_queue/scraper_intake.py` - Use listing storage
- `job-finder-worker/src/job_finder/job_queue/processors/job_processor.py` - Update all stages
- `job-finder-worker/src/job_finder/storage/job_storage.py` - Simplify to analysis only
- `job-finder-FE/src/router.tsx` - Update routes
- `job-finder-FE/src/components/layout/Sidebar.tsx` - Rename nav
- `job-finder-FE/src/pages/job-applications/JobApplicationsPage.tsx` - Use new types
- `job-finder-FE/src/api/job-matches-client.ts` - Update types

### Deleted Files
- `job-finder-FE/src/pages/job-finder/` (entire directory, replaced)

---

## Risk Assessment

1. **Database Migration**: Migration must handle existing data correctly
   - Mitigation: User confirmed no existing job_match records, can do clean migration

2. **Worker Changes**: Multiple components affected
   - Mitigation: Clear interfaces between components

3. **API Breaking Changes**: Frontend depends on current response format
   - Mitigation: Update all consumers simultaneously

4. **Type Changes**: Shared types affect both FE and BE
   - Mitigation: Update types first, then implementations

---

## Testing Strategy

1. **Unit Tests**: Each new/modified module
2. **Integration Tests**: Full pipeline flow
3. **E2E**: Manual testing of:
   - Job submission → listing created
   - Scrape → pre-filter → listing created
   - Analysis → match created with FK
   - UI displays all data correctly
