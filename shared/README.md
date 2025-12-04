# Job Finder Shared Types

Shared TypeScript definitions that live inside the `job-finder-worker` monorepo. They are shipped as a local workspace package (`@shared/types`) that emits both ESM and CJS bundles plus `.d.ts` files via `tsup`. Add `@shared/types` as a dependency (e.g., `"@shared/types": "file:../shared"`) and run `npm run build --workspace shared` whenever you change the schemas.

## Overview

This package contains TypeScript type definitions that are:
- **Used directly** by the job-finder-FE project (TypeScript/Firebase)
- **Mirrored** in Pydantic models by the job-finder project (Python)

## Usage

### TypeScript Projects

1. Declare the dependency in the workspace that needs it:

```json
{
  "devDependencies": {
    "@shared/types": "file:../shared"
  }
}
```

2. Build (or watch) the shared package:

```bash
npm run build --workspace shared
# or
npm run dev --workspace shared
```

3. Import from the package:

```ts
import type { JobMatch } from "@shared/types"
```

### Python Projects

Mirror the schemas using Pydantic models. The `shared/src` directory is the source of truth for the database schema and queue/job payloads.

## Usage

### TypeScript

```typescript
import {
  QueueItem,
  QueueStatus,
  JobMatch,
  JobListing,
  ResumeIntakeData,
  StopList,
  AISettings,
  QueueSettings
} from "@shared/types"

// Use types in your code
const queueItem: QueueItem = {
  type: 'job',
  status: 'pending',
  url: 'https://example.com/job/123',
  company_name: 'Example Corp',
  // ...
}

const jobListing: JobListing = {
  title: 'Senior Software Engineer',
  company: 'Example Corp',
  companyWebsite: 'https://example.com',
  location: 'Remote',
  description: 'We are looking for...',
  url: 'https://example.com/job/123',
  // Optional fields
  postedDate: '2025-10-15',
  salary: '$120k - $180k',
}
```

### Python (Pydantic)

```python
from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime

class JobQueueItem(BaseModel):
    """Mirrors QueueItem from shared/src"""
    type: Literal["job", "company"]
    status: Literal["pending", "processing", "success", "failed", "skipped"]
    url: str
    company_name: str
    # ... mirror all fields from TypeScript definition
```

## Type Definitions

### Core Types

#### `QueueItem`
Represents an item in the job processing queue.

**Fields:**
- `id?: string` - Database record ID
- `type: QueueItemType` - "job" or "company"
- `status: QueueStatus` - Current processing status
- `url: string` - Job or company URL
- `company_name: string` - Company name
- `source: QueueSource` - Where the item came from
- `submitted_by: string` - User ID who submitted
- `retry_count: number` - Number of retry attempts (currently 0 while retrying is disabled)
- `max_retries: number` - Maximum retries allowed
- `created_at: Date` - Creation timestamp
- `updated_at: Date` - Last update timestamp
- `processed_at?: Date` - When processing started
- `completed_at?: Date` - When processing finished
- `result_message?: string` - Result description
- `error_details?: string` - Error information if failed

#### `QueueStatus`
Processing status enum: `"pending"` | `"processing"` | `"success"` | `"failed"` | `"skipped"`

#### `JobListing`
Standard job data structure returned by scrapers (before AI analysis).

**Required Fields:**
- `title: string` - Job title/role
- `company: string` - Company name
- `companyWebsite: string` - Company website URL
- `location: string` - Job location
- `description: string` - Full job description
- `url: string` - Job posting URL (unique identifier)

**Optional Fields:**
- `postedDate?: string | null` - Job posting date (null if not found)
- `salary?: string | null` - Salary range (null if not listed)

**Added During Processing:**
- `companyInfo?: string` - Company about/culture (fetched after scraping)
- `companyId?: string` - Company record ID (added during analysis)
- `resumeIntakeData?: ResumeIntakeData` - AI-generated resume customization

#### `ResumeIntakeData`
AI-generated resume customization data for tailoring applications.

**Key Fields:**
- `targetSummary: string` - Tailored professional summary (2-3 sentences)
- `skillsPriority: string[]` - Priority-ordered skills list
- `experienceHighlights: ExperienceHighlight[]` - Work experience to emphasize
- `projectsToInclude: ProjectRecommendation[]` - Relevant projects (2-3)
- `achievementAngles: string[]` - How to frame achievements
- `atsKeywords: string[]` - **ATS optimization keywords (10-15 terms)** ⚠️ **SINGLE SOURCE OF TRUTH**
- `gapMitigation?: GapMitigation[]` - Strategies for addressing missing skills

**Important:** The `atsKeywords` field is the ONLY place ATS keywords are stored. There is NO job-level "keywords" field (removed in data cleanup).

#### `JobMatch`
AI-analyzed job match result (saved to job-matches collection).

**Fields:**
- `id?: string` - Database record ID
- `url: string` - Job posting URL
- `companyName: string` - Company name
- `companyId?: string | null` - Company record ID
- `jobTitle: string` - Job title/role
- `matchScore: number` - AI match score (0-100)
- `matchedSkills: string[]` - Skills matching requirements
- `missingSkills: string[]` - Skills/requirements missing
- `matchReasons: string[]` - Why this job matches
- `keyStrengths: string[]` - Key strengths for this application
- `potentialConcerns: string[]` - Potential gaps or concerns
- `experienceMatch: number` - Experience level match (0-100)
- `customizationRecommendations: string[]` - Application customization tips
- `resumeIntakeData?: ResumeIntakeData` - **Contains atsKeywords**
- Plus timestamps, user info, and queue reference

#### `Company`
Company record (companies collection).

**Fields:**
- `id?: string` - Database record ID
- `name: string` - Company name
- `website: string` - Company website URL
- `about?: string | null` - About/mission statement
- `culture?: string | null` - Company culture
- `headquartersLocation?: string | null` - HQ location
- `companySizeCategory?: "large" | "medium" | "small" | null` - Size category
- `techStack?: string[]` - Detected technologies
- `tier?: "S" | "A" | "B" | "C" | "D" | null` - Priority tier for scraping
- Plus analysis status and timestamps

#### `StopList`
Exclusion list for filtering jobs.

**Fields:**
- `excludedCompanies: string[]` - Companies to skip
- `excludedKeywords: string[]` - Keywords to avoid
- `excludedDomains: string[]` - Domains to block

#### `QueueSettings`
Queue processing configuration.

**Fields:**
- `processingTimeoutSeconds: number` - Max processing time (seconds)

#### `AISettings`
AI provider configuration with multi-tier selection.

**Fields:**
- `worker.selected: AIProviderSelection` - Provider/interface/model used by the worker pipeline
- `documentGenerator.selected: AIProviderSelection` - Provider/interface/model for document generation
- `options: AIProviderOption[]` - Tiered provider → interface → models list (each interface has `enabled`/`reason`)
- `updatedAt?: TimestampLike` - Last update timestamp
- `updatedBy?: string | null` - User who last updated

#### `JobMatchConfig`
Job matching configuration.

**Fields:**
- `minMatchScore: number` - Minimum match score (0-100)
- `portlandOfficeBonus: number` - Bonus for Portland office jobs
- `userTimezone: number` - User timezone offset from UTC
- `preferLargeCompanies: boolean` - Apply bonus for large companies
- `generateIntakeData: boolean` - Generate resume intake data for matches

### Helper Types

- `QueueItemType`: `"job"` | `"company"`
- `QueueSource`: `"user_submission"` | `"scraper"` | `"api"` | `"manual"`
- `StopListCheckResult`: Validation result with `allowed` and optional `reason`
- `QueueStats`: Statistics with counts by status

## Type Guards

Type guards provide runtime type checking for validating data structures. These are especially useful when reading from SQLite or validating API inputs.

### Available Type Guards

#### Queue Types
- `isQueueStatus(value)` - Validates QueueStatus enum
- `isQueueItemType(value)` - Validates QueueItemType enum
- `isQueueSource(value)` - Validates QueueSource enum
- `isQueueItem(value)` - Validates complete QueueItem structure
- `isStopList(value)` - Validates StopList configuration
- `isQueueSettings(value)` - Validates QueueSettings configuration
- `isAIProvider(value)` - Validates AIProvider enum
- `isAISettings(value)` - Validates AISettings configuration

#### Job Types
- `isJobListing(value)` - Validates JobListing structure
- `isJobMatch(value)` - Validates JobMatch structure
- `isCompany(value)` - Validates Company structure
- `isResumeIntakeData(value)` - Validates ResumeIntakeData structure
- `isExperienceHighlight(value)` - Validates ExperienceHighlight structure
- `isProjectRecommendation(value)` - Validates ProjectRecommendation structure
- `isGapMitigation(value)` - Validates GapMitigation structure

#### Content Items
- `isContentItemVisibility(value)` - Validates ContentItemVisibility enum
- `isContentItem(value)` - Validates the unified ContentItem payload

### Usage Examples

```typescript
import {
  isQueueItem,
  isJobMatch,
  isContentItem,
  QueueItem,
  JobMatch
} from '@jdubz/job-finder-shared-types'

// Example 1: Validating data loaded from SQLite (or any source)
async function getQueueItem(id: string): Promise<QueueItem | null> {
  const row = await db.get('SELECT * FROM job_queue WHERE id = ?', id)

  if (isQueueItem(row)) {
    console.log(`Status: ${row.status}`)
    return row
  }

  console.error('Invalid queue item data')
  return null
}

// Example 2: Validating API request body
function handleSubmitJob(body: unknown) {
  if (isQueueItem(body)) {
    // Safe to use as QueueItem
    processQueueItem(body)
  } else {
    throw new Error('Invalid queue item format')
  }
}

// Example 3: Type narrowing with union types
function processContentItem(item: unknown) {
  if (isContentItem(item)) {
    // TypeScript knows item is ContentItem
    console.log(`Type: ${item.type}, ID: ${item.id}`)
    
    // Further narrow the type
    if (isProjectItem(item)) {
      console.log(`Project: ${item.name}`)
    } else if (isCompanyItem(item)) {
      console.log(`Company: ${item.company}`)
    }
  }
}
```

## Type Mapping

### TypeScript → Python Mapping Table

| TypeScript | Python | Example |
|------------|--------|---------|
| `string` | `str` | `url: str` |
| `number` | `int` or `float` | `retry_count: int` |
| `boolean` | `bool` | `allowed: bool` |
| `Date` | `datetime` | `created_at: datetime` |
| `string[]` | `List[str]` | `excludedCompanies: List[str]` |
| `Type \| null` | `Optional[Type]` | `id: Optional[str]` |
| `"a" \| "b"` | `Literal["a", "b"]` | `status: Literal["pending", ...]` |
| Enum | `class MyEnum(str, Enum)` | See Python examples |

### Python Model Example

```python
from pydantic import BaseModel, Field
from typing import Optional, Literal, List
from datetime import datetime
from enum import Enum

class QueueItemType(str, Enum):
    JOB = "job"
    COMPANY = "company"

class QueueStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"

class JobQueueItem(BaseModel):
    """Mirrors QueueItem from @jdubz/job-finder-shared-types"""
    
    # Required fields
    type: QueueItemType
    status: QueueStatus = QueueStatus.PENDING
    url: str
    company_name: str
    source: Literal["user_submission", "scraper", "api", "manual"]
    submitted_by: str
    retry_count: int = 0
    max_retries: int = 3
    
    # Timestamps
    created_at: datetime
    updated_at: datetime
    processed_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    # Optional fields
    id: Optional[str] = None
    company_id: Optional[str] = None
    result_message: Optional[str] = None
    error_details: Optional[str] = None
    metadata: Optional[dict] = None
    
    class Config:
        use_enum_values = True
```

## Integration Architecture

```
┌─────────────────────────────────────────────────────────┐
│              @jdubz/job-finder-shared-types              │
│                  (TypeScript Definitions)                │
│                   [Single Source of Truth]               │
└────────────┬──────────────────────────────┬──────────────┘
             │                              │
             ▼                              ▼
   ┌──────────────────┐          ┌──────────────────┐
   │    job-finder-FE     │          │   Job-Finder     │
   │   (TypeScript)   │          │     (Python)     │
   │                  │          │                  │
   │ Direct Import    │          │ Pydantic Models  │
   │ import { ... }   │          │ (Mirrored)       │
   └──────────────────┘          └──────────────────┘
             │                              │
             │         SQLite DB           │
             └───────────(shared)───────────┘
```

## Workflow

### Making Changes

1. **Update TypeScript types** in this repository
2. **Rebuild the package:** `npm run build`
3. **Commit and push** to GitHub
4. **Update job-finder-FE:** `npm update @jdubz/job-finder-shared-types`
5. **Update Python models** in job-finder to mirror changes
6. **Test both projects** together
7. **Deploy from `main`** (production-only) after verifying locally/in CI

### Version Management

This package uses semantic versioning:
- **Major:** Breaking changes to types
- **Minor:** New types or optional fields added
- **Patch:** Documentation or non-breaking fixes

## Development

### Building

```bash
npm install
npm run build
```

### Testing Types

```bash
npm test
```

This runs TypeScript compilation without emitting files to catch type errors.

### Publishing
Publishing is automated via GitHub Actions whenever a new semantic version tag is pushed.

#### Publishing Workflow

1. **Update the version** following [Semantic Versioning](https://semver.org/):
  ```bash
  npm version patch  # Bug fixes (1.1.1 -> 1.1.2)
  npm version minor  # New features (1.1.2 -> 1.2.0)
  npm version major  # Breaking changes (1.2.0 -> 2.0.0)
  ```

2. **Update `CHANGELOG.md`**:
  - Document changes in the `[Unreleased]` section
  - Move them into a new version section using [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format

3. **Commit the release**:
  ```bash
  git add .
  git commit -m "chore: release vX.Y.Z"
  ```

4. **Push code and tags**:
  ```bash
  git push
  git push --tags
  ```

5. **Monitor the workflow**:
  - GitHub Actions runs `npm test` and `npm run build`
  - Confirms the version is new on npm
  - Publishes the package if everything succeeds
  - Track progress at https://github.com/Jdubz/job-finder-shared-types/actions

6. **Verify publication**:
  ```bash
  open https://www.npmjs.com/package/@jdubzw/job-finder-shared-types
  npm install @jdubzw/job-finder-shared-types@latest
  ```

**Note:** Ensure the `NPM_TOKEN` secret is configured in repository settings; see [.github/workflows/README.md](.github/workflows/README.md) for details.

#### Manual Publishing (Not Recommended)

If emergency publishing is required:

```bash
npm run clean && npm run build
npm publish --dry-run
npm publish  # Requires NPM_TOKEN in local env
```

#### Troubleshooting

- **Version already exists**: Bump version with `npm version patch`
- **Authentication error**: Ensure `NPM_TOKEN` secret is set in GitHub repo settings
- **Build fails**: Run `npm test` and `npm run build` locally first
- **Tag conflicts**: Delete local tag with `git tag -d v1.x.x` and remote with `git push origin :refs/tags/v1.x.x`

## Related Projects

- **job-finder-FE:** [github.com/Jdubz/portfolio](https://github.com/Jdubz/portfolio)
- **Job-Finder:** [github.com/Jdubz/job-finder](https://github.com/Jdubz/job-finder)

## Documentation

For detailed integration documentation, see:
- [Type Synchronization Guide](./docs/synchronization.md) (TODO)
- [Python Pydantic Examples](./docs/python-examples.md) (TODO)
- [job-finder-FE Integration](https://github.com/Jdubz/portfolio/blob/main/CLAUDE.md)
- [Job-Finder Integration](https://github.com/Jdubz/job-finder/blob/main/CLAUDE.md)

## License

MIT © Josh Wentworth

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Ensure types build successfully
5. Submit a pull request

**Important:** When modifying types:
- Update this README if new types are added
- Update Python examples in job-finder documentation
- Test changes in both portfolio and job-finder projects
- Consider backward compatibility

## Support

For issues or questions:
- **Issues:** [GitHub Issues](https://github.com/Jdubz/job-finder-shared-types/issues)
- **Discussions:** [GitHub Discussions](https://github.com/Jdubz/job-finder-shared-types/discussions)
