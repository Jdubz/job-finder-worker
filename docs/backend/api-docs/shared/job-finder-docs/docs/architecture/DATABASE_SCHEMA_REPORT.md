# Database Schema & Structure Exploration Report

## Project Overview

This document provides a comprehensive analysis of the database structure and schema for the job-application pipeline project, which consists of three repositories:

1. **job-finder** (Python backend) - AI-powered job scraping and matching
2. **portfolio** (TypeScript frontend) - Professional portfolio website with job management
3. **job-finder-shared-types** (TypeScript) - Shared type definitions between projects

The system uses **Firestore** (Google Cloud) as the primary database with multiple named databases for environment isolation (production: `portfolio`, staging: `portfolio-staging`).

---

## Database Structure & Collections

### Primary Firestore Databases

#### Production Database: `portfolio`

- Used by: Portfolio project (production), Job-finder (production scraping)
- Purpose: Production data for job matches, company info, and user experience

#### Staging Database: `portfolio-staging`

- Used by: Job-finder (dev/testing), Integration testing
- Purpose: Development and testing of job processing pipeline
- Note: Previously contained duplicate collections (now being consolidated)

---

## Collections Overview

### 1. **job-queue** (Shared between projects)

**Purpose:** Queue for jobs and companies to be processed by job-finder

**Type Definition:**

```typescript
// From: @jdubz/shared-types/src/queue.types.ts
export interface QueueItem {
  id?: string;
  type: QueueItemType; // "job" | "company" | "scrape" | "source_discovery"
  status: QueueStatus; // "pending" | "processing" | "success" | "failed" | "skipped" | "filtered"
  url: string;
  company_name: string;
  company_id: string | null;
  source: QueueSource; // "user_submission" | "automated_scan" | "scraper" | "webhook" | "email"
  submitted_by: string | null; // User UID for user submissions
  retry_count: number;
  max_retries: number;
  result_message?: string;
  error_details?: string;
  created_at: Date | Timestamp;
  updated_at: Date | Timestamp;
  processed_at?: Date | Timestamp | null;
  completed_at?: Date | Timestamp | null;

  // Configuration for specific item types
  scrape_config?: ScrapeConfig | null;
  source_discovery_config?: SourceDiscoveryConfig | null;

  // Granular pipeline fields
  sub_task?: JobSubTask | null; // "scrape" | "filter" | "analyze" | "save"
  pipeline_state?: Record<string, any> | null;
  parent_item_id?: string | null;
  company_sub_task?: CompanySubTask | null; // "fetch" | "extract" | "analyze" | "save"
}
```

**Python Pydantic Model:** `job_finder/src/job_finder/queue/models.py:JobQueueItem`

**Processing Pipeline:**

**JOB Processing (4 steps):**

1. **JOB_SCRAPE** → Fetch HTML, extract job data (Claude Haiku, ~$0.001/1K tokens)
2. **JOB_FILTER** → Apply strike-based filtering (rule-based, $0)
3. **JOB_ANALYZE** → AI matching, resume intake (Claude Sonnet, ~$0.02-0.075/1K tokens)
4. **JOB_SAVE** → Save to job-matches (Firestore write, $0)

**COMPANY Processing (4 steps):**

1. **COMPANY_FETCH** → Scrape company pages (Claude Haiku, ~$0.001/1K tokens)
2. **COMPANY_EXTRACT** → AI extraction of info (Claude Sonnet, ~$0.02-0.075/1K tokens)
3. **COMPANY_ANALYZE** → Tech stack detection, priority scoring (rule-based, $0)
4. **COMPANY_SAVE** → Save to companies collection (Firestore write, $0)

**Data Quality Issues:**

- Legacy monolithic processing items (no `sub_task` field)
- Partial/incomplete data in pipeline_state
- Duplicates from failed retry attempts

**Document Count:** ~100-500 (varies by environment)

---

### 2. **job-matches** (Written by job-finder, read by portfolio)

**Purpose:** AI-analyzed job match results for users to review and apply to

**Type Definition:**

```typescript
// From: @jdubz/shared-types/src/queue.types.ts
export interface JobMatch {
  id?: string;
  url: string;
  company_name: string;
  company_id?: string | null;
  job_title: string;
  match_score: number; // 0-100
  match_reasons: string[];
  job_description: string;
  requirements: string[];
  location?: string | null;
  salary_range?: string | null;
  analyzed_at: Date | Timestamp;
  created_at: Date | Timestamp;
  submitted_by: string | null;
  queue_item_id: string;
}
```

**Extended Fields (in Firestore document):**

```javascript
{
  // Basic job info
  title: string,
  role: string,  // Extracted role without seniority level
  company: string,
  companyWebsite: string,
  companyInfo: string,  // Company about/culture/mission
  location: string,
  description: string,
  url: string,

  // Match analysis
  matchScore: number,  // 0-100
  matchedSkills: string[],
  missingSkills: string[],
  experienceMatch: string,
  keyStrengths: string[],
  potentialConcerns: string[],
  applicationPriority: string,  // "High" | "Medium" | "Low"
  customizationRecommendations: string,

  // Resume intake data
  resumeIntakeData: {
    targetSummary: string,
    prioritizedSkills: string[],
    experienceHighlights: string[],
    projectsToInclude: string[],
    achievementAngles: string[],
    atsKeywords: string[]
  },

  // Status & tracking
  documentGenerated: boolean,
  documentGeneratedAt: Timestamp | null,
  documentUrl: string | null,
  applied: boolean,
  appliedAt: Timestamp | null,
  status: string,  // "new" | "reviewed" | "applied" | "rejected" | "interview" | "offer"
  notes: string,

  // Timestamps
  createdAt: Timestamp,
  updatedAt: Timestamp,

  // Optional
  companyId?: string,  // Link to companies collection
  postedDate?: string,
  salary?: string,
  userId?: string
}
```

**Field Mapping (Python ↔ Firestore):**

```python
FIELD_MAPPING = {
    "company_website": "companyWebsite",
    "company_info": "companyInfo",
    "company_id": "companyId",
    "posted_date": "postedDate",
    "match_score": "matchScore",
    "matched_skills": "matchedSkills",
    "missing_skills": "missingSkills",
    "experience_match": "experienceMatch",
    "key_strengths": "keyStrengths",
    "potential_concerns": "potentialConcerns",
    "application_priority": "applicationPriority",
    "customization_recommendations": "customizationRecommendations",
    "resume_intake_data": "resumeIntakeData",
    # ... more mappings
}
```

**Data Quality Issues:**

- ✓ **Empty company info** - Many records lack company information
- ✓ **Missing location** - Some records have "Unknown" or empty location
- ✓ **Duplicates** - Same URL appears in multiple documents (different analyses)
- ✓ **Invalid match scores** - Some scores outside 0-100 range
- ✓ **Partial data** - Missing salary, resume intake, or company website

**Management:** `job_finder/src/job_finder/storage/firestore_storage.py:FirestoreJobStorage`

**Cleanup Script:** `job_finder/scripts/database/cleanup_job_matches.py`

- Analyzes data quality issues
- Removes duplicates (keeps most complete record)
- Identifies records needing company info fetching

**Document Count:** ~50-200 per environment

---

### 3. **companies** (Job-finder source of truth)

**Purpose:** Centralized company information used for scoring and reference in jobs

**Schema:**

```javascript
{
  // Identity
  name: string,
  name_lower: string,  // Case-insensitive search (legacy)
  name_normalized: string,  // For deduplication

  // Basic info
  website: string,
  about: string,
  culture: string,
  mission: string,

  // Organizational info
  size: string,  // Employee count or description
  company_size_category: string,  // "large" | "medium" | "small"
  headquarters_location: string,  // City, State/Country
  industry: string,
  founded: string,  // Year or date

  // Operational scoring
  hasPortlandOffice: boolean,
  techStack: string[],  // Technologies used by company
  tier: string,  // Priority tier: "S" | "A" | "B" | "C" | "D"
  priorityScore: number,  // 0-150+

  // Timestamps
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

**Score Tiers:**

- **S Tier:** 150+ points (scraped most frequently)
- **A Tier:** 100-149 points
- **B Tier:** 70-99 points
- **C Tier:** 50-69 points
- **D Tier:** 0-49 points

**Scoring Components:**

- Portland office: +50 points
- Tech stack alignment: up to +100 points (based on user expertise)
- Remote-first: +15 points
- AI/ML focus: +10 points

**Management:** `job_finder/src/job_finder/storage/companies_manager.py:CompaniesManager`

**Data Issues:**

- ✓ **Duplicates** - Same company with different names (name_normalized deduplication)
- ✓ **Partial records** - Some lack about/culture/mission info
- ✓ **Stale data** - Company info not refreshed regularly
- ✓ **Sparse scoring** - Many records missing tier/priorityScore

**Cleanup Issues:**

- Multiple records found per normalized name
- Records merged by combining all fields, keeping one with tier/score data
- See: `job_finder/scripts/database/cleanup_firestore.py`

**Document Count:** ~50-150 per environment

---

### 4. **job-sources** (Job board configurations)

**Purpose:** Store configuration for each job source (RSS, Greenhouse, Workday, etc.)

**Schema:**

```javascript
{
  // Identity & metadata
  name: string,  // e.g., "Netflix Greenhouse", "We Work Remotely RSS"
  sourceType: string,  // "rss" | "greenhouse" | "workday" | "api" | "scraper"
  enabled: boolean,

  // Company linkage
  companyId?: string,  // Reference to companies doc
  companyName?: string,  // Denormalized for display

  // Source-specific configuration
  config: {
    // For RSS sources
    url?: string,
    parse_format?: "standard" | "custom",
    title_field?: string,
    description_field?: string,
    link_field?: string,

    // For Greenhouse
    board_token?: string,

    // For Workday
    company_id?: string,
    base_url?: string,

    // For scrapers
    method?: "selenium" | "requests",
    selectors?: {
      job_list: string,
      title: string,
      company: string,
      [key: string]: string
    }
  },

  // Selector alternatives for resilience
  alternative_selectors?: Array<{
    title?: string,
    company?: string,
    [key: string]: string
  }>,

  // Health tracking
  lastScrapedAt?: Timestamp,
  lastScrapedStatus?: "success" | "error" | "skipped",
  lastScrapedError?: string,
  totalJobsFound: number,
  totalJobsMatched: number,

  // Categorization
  tags?: string[],  // e.g., ["remote", "tech"]

  // Timestamps
  createdAt: Timestamp,
  updatedAt: Timestamp,

  // Confidence level (from discovery)
  confidence?: "high" | "medium" | "low"
}
```

**Management:** `job_finder/src/job_finder/storage/job_sources_manager.py:JobSourcesManager`

**Auto-disable Logic:**

- Records 5 consecutive scraping failures
- Auto-disables source when threshold reached

**Document Count:** ~20-50 per environment

---

### 5. **experience-entries** (Portfolio project)

**Purpose:** Work history entries for professional portfolio

**Schema (Legacy):**

```javascript
{
  title: string,
  role?: string,
  location?: string,
  body?: string,  // Markdown content
  startDate: string,  // YYYY-MM format
  endDate?: string | null,  // null = current job
  notes?: string,
  order: number,
  relatedBlurbIds: string[],  // Links to blurbs

  // Structured fields
  renderType?: string,  // "structured-entry" | "simple-entry" | "text"
  summary?: string,
  accomplishments?: string[],
  technologies?: string[],
  projects?: Array<{
    name: string,
    description: string,
    technologies?: string[],
    challenges?: string[]
  }>,

  createdAt: Timestamp,
  updatedAt: Timestamp,
  createdBy: string,
  updatedBy: string
}
```

**New Unified Model (ContentItem):**

```typescript
// From: portfolio/functions/src/types/content-item.types.ts
export interface CompanyItem extends BaseContentItem {
  type: "company";
  company: string;
  role?: string;
  location?: string;
  website?: string;
  startDate: string;
  endDate?: string | null;
  summary?: string;
  accomplishments?: string[];
  technologies?: string[];
  notes?: string;
}
```

**Note:** Migrating to unified ContentItem model that supports multiple types (company, project, skill-group, education, profile-section, text-section, accomplishment, timeline-event)

**Document Count:** ~10-20 per environment

---

### 6. **experience-blurbs** (Portfolio project)

**Purpose:** Markdown content sections (intro, skills, testimonials)

**Schema (Legacy):**

```javascript
{
  name: string,  // URL-friendly slug
  title: string,
  content: string,  // Markdown
  order?: number,
  type?: "page" | "entry",
  parentEntryId?: string,

  renderType?: string,  // "profile-header" | "project-showcase" | "categorized-list" | "timeline" | "text"
  structuredData?: object,

  createdAt: Timestamp,
  updatedAt: Timestamp,
  createdBy: string,
  updatedBy: string
}
```

**Note:** Also migrating to unified ContentItem model

**Document Count:** ~5-10 per environment

---

### 7. **job-finder-config** (Configuration documents)

**Purpose:** Shared configuration between job-finder and portfolio projects

**Sub-documents:**

#### a. **job-finder-config/stop-list**

```typescript
export interface StopList {
  excludedCompanies: string[]; // Company names to skip
  excludedKeywords: string[]; // Keywords that auto-reject jobs
  excludedDomains: string[]; // Domains to exclude
  updatedAt?: Timestamp;
  updatedBy?: string; // Email of who updated
}
```

**Example:**

```javascript
{
  excludedCompanies: ["Company X", "Company Y"],
  excludedKeywords: ["management", "sales"],
  excludedDomains: ["spam-jobs.com"]
}
```

#### b. **job-finder-config/queue-settings**

```typescript
export interface QueueSettings {
  maxRetries: number; // Default: 3
  retryDelaySeconds: number;
  processingTimeout: number;
  updatedAt?: Timestamp;
  updatedBy?: string;
}
```

#### c. **job-finder-config/ai-settings**

```typescript
export interface AISettings {
  provider: "claude" | "openai" | "gemini";
  model: string;
  minMatchScore: number; // Minimum score to save as job-match
  costBudgetDaily: number;
  updatedAt?: Timestamp;
  updatedBy?: string;
}
```

**Management:** Read by both projects, written by portfolio admin UI

---

### 8. **generator** (AI Generator Configuration)

#### a. **generator/personal-info** (formerly generator/default)

**Purpose:** Default personal information for resume/cover letter generation

```javascript
{
  id: "personal-info",  // Document ID
  type: "personal-info",

  // Personal info
  name: string,
  email: string,
  phone?: string,
  location: string,

  // Links
  website?: string,
  github?: string,
  linkedin?: string,

  // Appearance
  avatar?: string,
  logo?: string,
  accentColor: string,

  // Migration tracking
  migratedFrom?: string,
  migratedAt?: Timestamp,

  // Timestamps
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

**Migration Script:** `portfolio/functions/scripts/migrate-personal-info.ts`

- Migrated from `generator/default` to `generator/personal-info`
- Includes dry-run mode for safety

**Seed Script:** `portfolio/functions/scripts/seed-generator-defaults.ts`

- Seeds initial personal info data

---

### 9. **generator_defaults** (Deprecated - see generator/personal-info)

**Purpose:** (Legacy - being phased out in favor of generator/personal-info)

---

### 10. **generator_blurbs** (Optional customization)

**Purpose:** Custom prompt templates for AI generation

```javascript
{
  name: string,
  prompt: string,
  category?: string,
  order?: number,

  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

---

### 11. **generator_history** (Editor-only)

**Purpose:** Track all generated documents for auditing/recovery

```javascript
{
  generatedAt: Timestamp,
  generatedBy: string,  // Email
  type: "resume" | "cover_letter",
  jobTitle: string,
  company: string,
  documentUrl: string,  // GCS URL
  metadata: {
    model: string,
    provider: "claude" | "openai" | "gemini"
  }
}
```

---

### 12. **contact-submissions** (Contact form data - Portfolio)

**Purpose:** Store contact form submissions for follow-up

```javascript
{
  name: string,
  email: string,
  message: string,
  createdAt: Timestamp,
  status?: "new" | "reviewed" | "responded"
}
```

**Note:** Being moved out of portfolio-staging to portfolio only

---

---

## Cross-Database Issues & Data Integrity Problems

### Issue 1: Duplication Across Staging & Production

**Problem:**

- `portfolio-staging` contains duplicate copies of:
  - `experience-entries`
  - `experience-blurbs`
  - `contact-submissions`

**Root Cause:**

- Historical data migration strategy
- No clear separation between portfolio data and job-finder data

**Resolution:**

- Portfolio data (experience, blurbs) → belongs only in `portfolio` database
- Job-finder data (queue, matches, companies, sources) → belongs in `portfolio-staging` for dev, `portfolio` for production

**Script:** `job_finder/scripts/database/cleanup_firestore.py`

- Backs up duplicate collections to `../legacy-data/`
- Removes duplicates from portfolio-staging
- Preserves production data in portfolio

### Issue 2: Partial Records in job-matches

**Problems:**

- Empty `companyInfo` fields
- Missing `location` (shows as "Unknown")
- Missing `salary` range
- Missing `resumeIntakeData`

**Root Cause:**

- Company info not fetched at job analysis time
- Failed company info lookup
- Stale cached company data

**Impact:**

- Incomplete information for users
- Can't generate tailored resumes (need atsKeywords from resumeIntakeData)

**Cleanup:** `job_finder/scripts/database/cleanup_job_matches.py`

- Identifies incomplete records
- Prioritizes fixing by:
  1. Triggering company info fetcher
  2. Merging duplicate records
  3. Re-analyzing with better company data

### Issue 3: Duplicate Companies

**Problem:**

- Multiple records for same company with different names:
  - "Cloudflare" and "Cloudflare, Inc."
  - "Netflix" and "Netflix, Inc."

**Root Cause:**

- Company name variations in job postings
- Multiple data entry points

**Solution:**

- Use `name_normalized` field for deduplication
- `normalize_company_name()` removes common suffixes and variations

**Cleanup:** `job_finder/scripts/database/cleanup_firestore.py`

- Groups companies by normalized name
- Merges data from duplicates
- Keeps record with best scoring data (tier/priorityScore)
- Deletes redundant copies

### Issue 4: Legacy Pipeline Items

**Problem:**

- Old job queue items without `sub_task` field (monolithic processing)
- Can't resume individual steps
- All-or-nothing processing

**Impact:**

- If JOB_ANALYZE fails, entire job is marked failed
- Can't restart just the analysis step
- Memory-inefficient (single step handles all data)

**Resolution:**

- All new items use granular pipeline (REQUIRED `sub_task`)
- Legacy items still processable but not optimal
- Eventually phase out legacy support

---

## Data Validation & Schema Compliance

### Python Models (job-finder)

**File:** `job_finder/src/job_finder/queue/models.py`

Using **Pydantic** for runtime validation:

```python
class JobQueueItem(BaseModel):
    """Queue item with validation."""

    # Required fields
    type: QueueItemType  # Enforced enum
    status: QueueStatus = QueueStatus.PENDING
    url: str = ""
    company_name: str = ""
    company_id: Optional[str] = None

    # Optional fields with defaults
    retry_count: int = 0
    max_retries: int = 3

    # Timestamps
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(use_enum_values=True)

    def to_firestore(self) -> Dict[str, Any]:
        """Convert to Firestore format (excludes None values)."""
        return self.model_dump(exclude_none=True, exclude={"id"})

    @classmethod
    def from_firestore(cls, doc_id: str, data: Dict[str, Any]) -> "JobQueueItem":
        """Create from Firestore document."""
        data["id"] = doc_id
        return cls(**data)
```

**Validation Features:**

- Enum validation for enums (QueueItemType, QueueStatus, JobSubTask, CompanySubTask)
- String length validation
- Default values for optional fields
- Field name mapping (snake_case ↔ camelCase)

### TypeScript Types (shared-types)

**File:** `job-finder-shared-types/src/queue.types.ts`

Using **TypeScript interfaces** for compile-time checking:

```typescript
export interface QueueItem {
  id?: string;
  type: QueueItemType;
  status: QueueStatus;
  url: string;
  company_name: string;
  // ... more fields
}

// Type guards for runtime validation
export function isQueueStatus(status: string): status is QueueStatus {
  return [
    "pending",
    "processing",
    "success",
    "failed",
    "skipped",
    "filtered",
  ].includes(status);
}
```

---

## Data Migration & Seed Scripts

### Migration Scripts

#### 1. **migrate-personal-info.ts**

**Purpose:** Rename generator/default → generator/personal-info
**Features:**

- Dry-run mode (preview without changes)
- Validates migration state
- Tracks migration with metadata fields
- Can be run on both staging and production

```bash
# Dry run
DRY_RUN=true DATABASE_ID=portfolio-staging npx tsx scripts/migrate-personal-info.ts

# Live migration
DATABASE_ID=portfolio npx tsx scripts/migrate-personal-info.ts
```

#### 2. **seed-generator-defaults.ts**

**Purpose:** Initialize generator/default document with personal info
**Usage:**

```bash
npx tsx scripts/seed-generator-defaults.ts [--force]
```

#### 3. **cleanup_job_matches.py**

**Purpose:** Analyze and fix job-matches data quality

```bash
python scripts/database/cleanup_job_matches.py
```

Steps:

1. Analyze both databases
2. Report on data quality issues
3. Remove duplicate URLs (keeps most complete record)
4. Score records by:
   - Field completeness
   - Resume intake data presence
   - Match score value

#### 4. **cleanup_firestore.py**

**Purpose:** Clean up database structure and remove duplicates

```bash
python scripts/database/cleanup_firestore.py
```

Steps:

1. Back up legacy collections to `../legacy-data/`
2. Remove duplicate collections from portfolio-staging
3. Analyze and merge duplicate companies
4. Summary report

---

## Firestore Security & Access Patterns

### Database-Level Access Control

**portfolio-staging:**

- Used by job-finder dev/testing
- Lower security requirements
- Allows data deletion for testing

**portfolio:**

- Used by production
- Stricter access rules
- Editor role required for changes
- Audit logging

### Authentication Middleware (Portfolio)

```typescript
// Requires Firebase Auth token + "editor" custom claim
verifyAuthenticatedEditor(req, res);

// Optional App Check for additional defense
```

---

## Performance & Scaling Considerations

### Query Patterns

**job-queue (FIFO processing):**

```python
query = db.collection("job-queue")
  .where("status", "==", "pending")
  .order_by("created_at")  # Oldest first
  .limit(10)
```

**Firestore indexes needed:**

- Composite: (status, created_at)

**job-matches (sorting):**

```python
query = db.collection("job-matches")
  .where("matchScore", ">=", 80)
  .order_by("matchScore", DESCENDING)
  .limit(100)
```

**Firestore indexes needed:**

- Composite: (matchScore descending, createdAt)

**companies (normalization):**

```python
query = db.collection("companies")
  .where("name_normalized", "==", normalized_name)
  .limit(1)
```

**Firestore indexes needed:**

- Simple: name_normalized

### Collection Sizes & Growth

| Collection         | Typical Size | Growth Rate | Notes                                  |
| ------------------ | ------------ | ----------- | -------------------------------------- |
| job-queue          | 100-500      | ~50-100/day | Auto-archived after completion         |
| job-matches        | 50-200       | ~20-50/day  | Grows over time, cleanup script needed |
| companies          | 50-150       | ~5-10/day   | Deduplication reduces growth           |
| job-sources        | 20-50        | ~1-2/day    | Stable, manually managed               |
| experience-entries | 10-20        | ~0/day      | Stable, user-managed                   |
| experience-blurbs  | 5-10         | ~0/day      | Stable, user-managed                   |

---

## Data Integrity Recommendations

### Immediate Actions

1. **Run cleanup scripts:**

   ```bash
   python scripts/database/cleanup_firestore.py  # Remove duplicates
   python scripts/database/cleanup_job_matches.py  # Fix partial records
   ```

2. **Validate data consistency:**
   - job-matches.company_id → companies.id (referential integrity)
   - job-matches.url uniqueness per database
   - job-queue.created_at ordering for FIFO

3. **Migrate personal-info:**
   ```bash
   DRY_RUN=true DATABASE_ID=portfolio npx tsx scripts/migrate-personal-info.ts
   DATABASE_ID=portfolio npx tsx scripts/migrate-personal-info.ts
   ```

### Ongoing Maintenance

1. **Weekly cleanup of incomplete job-matches:**
   - Remove old "pending" queue items (>7 days old)
   - Re-analyze jobs with missing company info

2. **Monthly company deduplication:**
   - Check for new duplicate companies
   - Merge similar names
   - Update priority scores

3. **Quarterly data archival:**
   - Archive old job-queue items to separate collection
   - Compress job-matches history

### Schema Improvements Needed

1. **Firestore composite indexes:**

   ```
   - job-queue: (status, created_at)
   - job-matches: (matchScore DESC, createdAt DESC)
   - companies: name_normalized
   ```

2. **Add data validation rules:**
   - Ensure url field is non-empty for job-matches
   - Require company_name for company documents
   - Validate match_score range [0-100]

3. **Add audit logging:**
   - Track who/when deleted duplicates
   - Log schema migrations
   - Record cleanup operations

---

## File Locations Reference

### Database Models & Managers

| File                                                       | Purpose                                |
| ---------------------------------------------------------- | -------------------------------------- |
| `job-finder/src/job_finder/queue/models.py`                | Python Pydantic models for queue items |
| `job-finder/src/job_finder/storage/firestore_storage.py`   | Job matches storage & field mapping    |
| `job-finder/src/job_finder/storage/companies_manager.py`   | Company info CRUD                      |
| `job-finder/src/job_finder/storage/job_sources_manager.py` | Job source configurations              |
| `job-finder/src/job_finder/queue/manager.py`               | Queue item management                  |
| `job-finder-shared-types/src/queue.types.ts`               | TypeScript interface definitions       |
| `portfolio/functions/src/types/content-item.types.ts`      | New unified content item types         |
| `portfolio/functions/src/experience.ts`                    | Experience endpoint handlers           |
| `portfolio/functions/src/services/experience.service.ts`   | Experience CRUD service                |

### Scripts

| Script                                                   | Purpose                                  |
| -------------------------------------------------------- | ---------------------------------------- |
| `portfolio/functions/scripts/migrate-personal-info.ts`   | Migrate generator defaults               |
| `portfolio/functions/scripts/seed-generator-defaults.ts` | Seed initial generator data              |
| `job-finder/scripts/database/cleanup_job_matches.py`     | Clean up job-matches duplicates          |
| `job-finder/scripts/database/cleanup_firestore.py`       | Remove duplicate collections & companies |

---

## Summary

This job-application pipeline uses a well-structured Firestore schema with:

**Strengths:**

- Clear separation of concerns (queue, matches, companies, sources)
- Shared type definitions across Python and TypeScript
- Granular pipeline processing for cost optimization
- Comprehensive field mapping for camelCase/snake_case conversion

**Current Issues:**

- Duplicate collections across staging and production
- Partial records in job-matches (missing company info)
- Duplicate companies due to name variations
- Legacy pipeline items without granular processing

**Recommended Actions:**

1. Run cleanup scripts to remove duplicates
2. Re-analyze job-matches with company fetcher
3. Implement automated deduplication logic
4. Add Firestore composite indexes for performance
5. Monitor data quality metrics going forward
