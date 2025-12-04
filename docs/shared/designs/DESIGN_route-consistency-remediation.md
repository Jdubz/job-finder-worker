> Status: Active
> Owner: @jdubz
> Last Updated: 2025-12-04

# Route Consistency & API Contract Remediation Plan

Scope: Ensure all API routes have consistent contracts defined via shared types, summary pill totals are accurate (server-side stats), and integration tests enforce these contracts.

## Problem Statement

An audit of frontend and backend routes revealed three categories of issues:

1. **Summary Pill Totals Are Incorrect:** List pages calculate totals from paginated arrays instead of dedicated server-side stats endpoints, causing pills to show partial counts when data exceeds pagination limits.

2. **Missing Stats Endpoints:** Only Queue and Job Sources have dedicated `/stats` endpoints. Job Listings and Job Matches lack them, forcing frontend to calculate stats from incomplete data.

3. **Enum Duplication in Backend Validation:** Backend Zod schemas hardcode enum values instead of importing from `@shared/types`, creating synchronization risk.

4. **Integration Test Gaps:** Only 4 of 15+ routes have integration tests. Critical routes (Queue, Job Listings, Companies) lack end-to-end testing.

## Current State

### Stats Endpoint Coverage

| Route | Stats Endpoint | Shared Type | FE Uses Server Stats |
|-------|----------------|-------------|---------------------|
| `/api/queue` | `GET /stats` | `QueueStats` | Yes |
| `/api/job-sources` | `GET /stats` | `JobSourceStats` | No (stats available but not shown as pills) |
| `/api/job-listings` | **Missing** | **Missing** | No (calculates from array) |
| `/api/job-matches` | **Missing** | **Missing** | No (calculates from array) |

### Affected Frontend Pages

| Page | File | Current Behavior | Issue |
|------|------|------------------|-------|
| Queue Management | `QueueManagementPage.tsx:85` | Calls `queueClient.getStats()` | Correct |
| Job Listings | `JobListingsPage.tsx:124-133` | Calculates `statusCounts` from `listings` (limit: 100) | Wrong counts if >100 items |
| Job Applications | `JobApplicationsPage.tsx:174-201` | Calculates stats from `matches` array | Wrong counts if filtered |

### Backend Enum Duplication

**File:** `job-finder-BE/server/src/modules/job-queue/job-queue.routes.ts:37-60`

```typescript
// Currently hardcoded - should import from @shared/types
const queueStatuses = ['pending', 'processing', 'success', 'failed', 'skipped', 'needs_review'] as const
const queueSources = ['user_submission', 'automated_scan', 'scraper', 'webhook', 'email', 'manual_submission', 'user_request'] as const
const queueItemTypes = ['job', 'company', 'scrape', 'source_discovery', 'scrape_source'] as const
```

### Integration Test Coverage

**Covered Routes (4):**
- Content Items (`content-item.routes.test.ts`)
- Job Matches basic CRUD (`job-match.routes.test.ts`)
- Generator Artifacts (`artifacts.routes.test.ts`)
- Generator Assets (`assets.routes.test.ts`)

**Uncovered Routes (11+):**
- Job Queue (most critical)
- Job Listings
- Companies
- Job Sources
- Config
- Prompts
- Auth
- Lifecycle
- Logging
- Worker Bridge

## Implementation Plan

### Phase 1: Add Stats Types to Shared Package

**File:** `shared/src/job.types.ts`

```typescript
export interface JobListingStats {
  total: number
  pending: number
  analyzing: number
  analyzed: number
  matched: number
  skipped: number
}

export interface JobMatchStats {
  total: number
  highScore: number    // matchScore >= 80
  mediumScore: number  // matchScore >= 50 && < 80
  lowScore: number     // matchScore < 50
  averageScore: number
}
```

**File:** `shared/src/api/job-listing.types.ts`

```typescript
export interface GetJobListingStatsResponse {
  stats: JobListingStats
}
```

**File:** `shared/src/api/job-match.types.ts`

```typescript
export interface GetJobMatchStatsResponse {
  stats: JobMatchStats
}
```

### Phase 2: Add Stats Endpoints to Backend

**File:** `job-finder-BE/server/src/modules/job-listings/job-listing.routes.ts`

Add route:
```typescript
router.get('/stats', asyncHandler((_req, res) => {
  const stats = repo.getStats()
  res.json(success({ stats }))
}))
```

**File:** `job-finder-BE/server/src/modules/job-listings/job-listing.repository.ts`

Add method:
```typescript
getStats(): JobListingStats {
  const rows = this.db.prepare(`
    SELECT status, COUNT(*) as count
    FROM job_listings
    GROUP BY status
  `).all()
  // Transform to JobListingStats shape
}
```

**File:** `job-finder-BE/server/src/modules/job-matches/job-match.routes.ts`

Add route:
```typescript
router.get('/stats', asyncHandler((_req, res) => {
  const stats = repo.getStats()
  res.json(success({ stats }))
}))
```

**File:** `job-finder-BE/server/src/modules/job-matches/job-match.repository.ts`

Add method:
```typescript
getStats(): JobMatchStats {
  const result = this.db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN match_score >= 80 THEN 1 ELSE 0 END) as highScore,
      SUM(CASE WHEN match_score >= 50 AND match_score < 80 THEN 1 ELSE 0 END) as mediumScore,
      SUM(CASE WHEN match_score < 50 THEN 1 ELSE 0 END) as lowScore,
      AVG(match_score) as averageScore
    FROM job_matches
  `).get()
  return result as JobMatchStats
}
```

### Phase 3: Update Frontend API Clients

**File:** `job-finder-FE/src/api/job-listings-client.ts`

Add method:
```typescript
async getStats(): Promise<JobListingStats> {
  const response = await this.get<GetJobListingStatsResponse>('/job-listings/stats')
  return response.stats
}
```

**File:** `job-finder-FE/src/api/job-matches-client.ts`

Add method:
```typescript
async getStats(): Promise<JobMatchStats> {
  const response = await this.get<GetJobMatchStatsResponse>('/job-matches/stats')
  return response.stats
}
```

### Phase 4: Update Frontend Pages to Use Stats Endpoints

**File:** `job-finder-FE/src/pages/job-listings/JobListingsPage.tsx`

Replace lines 124-133:
```typescript
// Current: Client-side calculation
const statusCounts = useMemo(() => {
  return listings.reduce(...)
}, [listings])

// Replace with:
const [stats, setStats] = useState<JobListingStats | null>(null)
useEffect(() => {
  jobListingsClient.getStats().then(setStats)
}, [listings]) // Refresh when listings change
```

Update StatPill values to use `stats?.pending`, `stats?.analyzing`, etc.

**File:** `job-finder-FE/src/pages/job-applications/JobApplicationsPage.tsx`

Replace lines 174-201:
```typescript
// Current: Client-side calculation
{matches.filter((m) => m.matchScore >= SCORE_THRESHOLDS.HIGH).length}

// Replace with:
const [stats, setStats] = useState<JobMatchStats | null>(null)
useEffect(() => {
  jobMatchesClient.getStats().then(setStats)
}, [matches]) // Refresh when matches change
```

Update stat display to use `stats?.highScore`, `stats?.mediumScore`, etc.

### Phase 5: Export Enum Arrays from Shared Package

**File:** `shared/src/queue.types.ts`

Add exports:
```typescript
export const QUEUE_STATUSES = [
  'pending', 'processing', 'success', 'failed', 'skipped', 'needs_review'
] as const

export const QUEUE_SOURCES = [
  'user_submission', 'automated_scan', 'scraper', 'webhook',
  'email', 'manual_submission', 'user_request'
] as const

export const QUEUE_ITEM_TYPES = [
  'job', 'company', 'scrape', 'source_discovery', 'scrape_source'
] as const
```

**File:** `job-finder-BE/server/src/modules/job-queue/job-queue.routes.ts`

Replace hardcoded arrays:
```typescript
import { QUEUE_STATUSES, QUEUE_SOURCES, QUEUE_ITEM_TYPES } from '@shared/types'

const submitJobSchema = z.object({
  status: z.enum(QUEUE_STATUSES).optional(),
  source: z.enum(QUEUE_SOURCES).optional(),
  // ...
})
```

### Phase 6: Add Integration Tests

**Priority 1: Queue Routes** (`job-queue.routes.test.ts`)
- GET `/api/queue` - List with filters
- GET `/api/queue/stats` - Stats endpoint
- POST `/api/queue/jobs` - Submit job
- PATCH `/api/queue/:id` - Update item
- DELETE `/api/queue/:id` - Delete item

**Priority 2: Job Listings** (`job-listing.routes.test.ts`)
- GET `/api/job-listings` - List with filters
- GET `/api/job-listings/stats` - Stats endpoint (new)
- POST `/api/job-listings` - Create listing
- PATCH `/api/job-listings/:id` - Update listing
- DELETE `/api/job-listings/:id` - Delete listing

**Priority 3: Job Matches Stats** (extend `job-match.routes.test.ts`)
- GET `/api/job-matches/stats` - Stats endpoint (new)

**Priority 4: Companies** (`company.routes.test.ts`)
- GET `/api/companies` - List with filters
- GET `/api/companies/:id` - Get single
- PATCH `/api/companies/:id` - Update
- DELETE `/api/companies/:id` - Delete

## Verification Checklist

### Phase 1 Verification
- [ ] `JobListingStats` type exported from `@shared/types`
- [ ] `JobMatchStats` type exported from `@shared/types`
- [ ] `GetJobListingStatsResponse` type exported
- [ ] `GetJobMatchStatsResponse` type exported
- [ ] Shared package builds successfully

### Phase 2 Verification
- [ ] `GET /api/job-listings/stats` returns correct counts
- [ ] `GET /api/job-matches/stats` returns correct stats
- [ ] Backend tests pass

### Phase 3 Verification
- [ ] `jobListingsClient.getStats()` works
- [ ] `jobMatchesClient.getStats()` works
- [ ] FE builds successfully

### Phase 4 Verification
- [ ] Job Listings page shows correct pill counts regardless of limit
- [ ] Job Applications page shows correct stats regardless of filter
- [ ] Stats refresh when data changes

### Phase 5 Verification
- [ ] `QUEUE_STATUSES` exported from shared
- [ ] Backend Zod schemas use imported arrays
- [ ] No duplicate enum definitions in backend

### Phase 6 Verification
- [ ] Queue routes integration tests pass
- [ ] Job Listings routes integration tests pass
- [ ] Job Matches stats test passes
- [ ] Companies routes integration tests pass

## Files to Modify

### Shared Package
- `shared/src/job.types.ts` - Add stats interfaces
- `shared/src/api/job-listing.types.ts` - Add stats response type
- `shared/src/api/job-match.types.ts` - Add stats response type
- `shared/src/queue.types.ts` - Export enum arrays
- `shared/src/index.ts` - Re-export new types

### Backend
- `job-finder-BE/server/src/modules/job-listings/job-listing.routes.ts` - Add stats route
- `job-finder-BE/server/src/modules/job-listings/job-listing.repository.ts` - Add getStats method
- `job-finder-BE/server/src/modules/job-matches/job-match.routes.ts` - Add stats route
- `job-finder-BE/server/src/modules/job-matches/job-match.repository.ts` - Add getStats method
- `job-finder-BE/server/src/modules/job-queue/job-queue.routes.ts` - Import enum arrays

### Frontend
- `job-finder-FE/src/api/job-listings-client.ts` - Add getStats method
- `job-finder-FE/src/api/job-matches-client.ts` - Add getStats method
- `job-finder-FE/src/pages/job-listings/JobListingsPage.tsx` - Use stats endpoint
- `job-finder-FE/src/pages/job-applications/JobApplicationsPage.tsx` - Use stats endpoint

### Tests (New Files)
- `job-finder-BE/server/src/modules/job-queue/__tests__/job-queue.routes.test.ts`
- `job-finder-BE/server/src/modules/job-listings/__tests__/job-listing.routes.test.ts`
- `job-finder-BE/server/src/modules/companies/__tests__/company.routes.test.ts`

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Stats queries slow on large datasets | High latency on list pages | Add database indexes on status columns; consider caching |
| FE/BE type mismatch after changes | Runtime errors | Run `npm run build` in shared package and verify both FE/BE compile |
| Breaking existing tests | CI failures | Run full test suite before merging each phase |
| Stats out of sync with list data | Confusing UX | Refresh stats when list data changes; consider SSE for stats |

## Success Criteria

1. **Pill Accuracy:** Job Listings and Job Applications pages show correct totals even when database contains >100 items
2. **Type Safety:** All API responses have corresponding shared types; FE and BE import from same source
3. **Test Coverage:** Queue, Job Listings, and Companies routes have integration tests
4. **No Enum Duplication:** Backend validation uses arrays imported from `@shared/types`
