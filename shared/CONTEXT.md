# CONTEXT.md

This file provides guidance to Claude Code when working with the shared-types repository.

## Repository Overview

`@jdubz/shared-types` is a centralized TypeScript type definitions package that serves as the **single source of truth** for data structures shared across the Job Finder project.

<<<<<<< HEAD
1. **job-finder-FE** (TypeScript/Gatsby + Firebase Functions)
2. **Job-finder** (Python with Firestore integration)
=======
### Project Management

**IMPORTANT**: This repository is part of a multi-repository project managed centrally.

- **Task Tracking**: ALL task tracking is done in [job-finder-app-manager](https://github.com/Jdubz/job-finder-app-manager)
- **Workflow**: Push changes directly to `main` branch (no PR required for types)
- **Coordination**: Discuss type changes with team before implementation
- **Documentation**: Architecture docs live here, project management in manager repo

### Integration

This types package is used by:

1. **job-finder-FE** (TypeScript/React) - Frontend application
2. **job-finder-BE** (TypeScript/Firebase Functions) - Backend API
3. **job-finder** (Python with Firestore) - Queue worker (mirrors types in Pydantic)
>>>>>>> 9f441a0 (Update documentation: Add project management context)

By maintaining types in this shared repository, we ensure:
- Type consistency across TypeScript and Python codebases
- Single location for schema changes
- Easier integration and refactoring
- Clear contracts between systems

## Architecture Context

<<<<<<< HEAD
### Integration with job-finder-FE
=======
### Integration with Frontend (job-finder-FE)
>>>>>>> 9f441a0 (Update documentation: Add project management context)

The frontend imports this package as a dependency:

```json
{
  "dependencies": {
    "@shared/types": "^1.x.x"
  }
}
```

**Used in:**
- `src/api/` - API client type definitions
- `src/types/` - Component prop types
- `src/contexts/` - State management types

### Integration with Backend (job-finder-BE)

The backend Firebase Functions import this package:

```json
{
  "dependencies": {
    "@shared/types": "^1.x.x"
  }
}
```

**Used in:**
- `functions/src/` - Cloud Function API contracts
- Firestore data validation
- API request/response types

### Integration with Queue Worker (job-finder)

The job-finder Python project references these types as the authoritative schema:

- Python models in `job_finder/queue/models.py` mirror TypeScript interfaces
- Pydantic models provide runtime validation matching TypeScript types
- Firestore documents use consistent field names and structures

## Package Structure

```
@jdubz/shared-types/
├── src/
│   ├── index.ts           # Main entry point (exports all types)
│   └── queue.types.ts     # Queue and job matching types
├── dist/                  # Compiled JavaScript + type declarations
├── package.json           # Package metadata
├── tsconfig.json          # TypeScript configuration
├── README.md              # Usage documentation
└── CONTEXT.md             # This file (Claude Code guidance)
```

## Available Types

### Queue Processing Types (`queue.types.ts`)

**Core Types:**
- `QueueStatus` - Lifecycle status: pending → processing → success/failed/skipped
- `QueueItemType` - Item type: "job" | "company"
- `QueueSource` - Submission source: user_submission, automated_scan, etc.
- `QueueItem` - Complete Firestore document structure for job-queue collection

**Configuration Types:**
- `StopList` - Filtering rules (excluded companies, keywords, domains)
- `QueueSettings` - Queue processing parameters (retries, timeouts)
- `AISettings` - AI provider configuration (provider, model, cost limits)

**Result Types:**
- `JobMatch` - AI-analyzed job match result stored in job-matches collection
- `QueueStats` - Aggregated statistics for queue dashboard
- `StopListCheckResult` - Validation result from stop-list filtering

**API Types:**
- `SubmitJobRequest` - Request body for job submission API
- `SubmitJobResponse` - Response format for job submission API

**Helper Functions:**
- `isQueueStatus()` - Type guard for queue status validation
- `isQueueItemType()` - Type guard for queue item type validation

## Development Workflow

### Making Changes to Types

When modifying any type definition:

1. **Update TypeScript types first** (this repository)
2. **Build the package:**
   ```bash
   npm run build
   ```
3. **Update portfolio project:**
   - Reinstall if needed: `cd portfolio && npm install`
   - Update code using the types
   - Run tests: `npm test`
4. **Update job-finder Python models:**
   - Mirror changes in `job_finder/queue/models.py`
   - Update Pydantic validators if needed
   - Run tests: `pytest`
5. **Test integration** on staging environment
6. **Deploy both projects** together

### Building the Package

```bash
# One-time build
npm run build

# Watch mode during development
npm run watch

# Clean build artifacts
npm run clean
```

### TypeScript Configuration

- **Target:** ES2020 (modern JavaScript features)
- **Module:** CommonJS (Node.js compatibility)
- **Output:** `dist/` directory with `.js` files and `.d.ts` declarations
- **Source:** `src/` directory

## Type Mapping: TypeScript ↔ Python

When implementing Python equivalents, use this mapping:

| TypeScript | Python (Pydantic) | Notes |
|------------|-------------------|-------|
| `string` | `str` | - |
| `number` | `int` or `float` | Context-dependent |
| `boolean` | `bool` | - |
| `Date` | `datetime` | Use `from datetime import datetime` |
| `string[]` | `List[str]` | Import from `typing` |
| `Record<string, any>` | `Dict[str, Any]` | Import from `typing` |
| `Type \| null` | `Optional[Type]` | Import from `typing` |
| `Type \| undefined` | `Optional[Type]` | Same as null in Python |
| `"literal" \| "union"` | `Literal["literal", "union"]` | Import from `typing` |
| `interface MyType` | `class MyType(BaseModel)` | Pydantic model |
| Custom type alias | `NewType("MyType", str)` | Or just type alias |

### Firestore Timestamp Handling

```typescript
// TypeScript - Union type for flexibility
created_at: Date | FirebaseFirestore.Timestamp

// Python - Firestore SDK auto-converts
from google.cloud.firestore import SERVER_TIMESTAMP
created_at: datetime  # Auto-converted from Firestore Timestamp
```

## Common Development Tasks

### Adding a New Shared Type

1. **Create or update type file** in `src/`
2. **Export from `src/index.ts`:**
   ```typescript
   export * from "./new-type"
   ```
3. **Add JSDoc comments** for documentation
4. **Build the package:** `npm run build`
5. **Update README.md** with usage examples
6. **Update this CONTEXT.md** with type description
7. **Create corresponding Python model** in job-finder

### Deprecating a Type

1. **Mark as deprecated** with JSDoc:
   ```typescript
   /**
    * @deprecated Use NewType instead
    */
   export interface OldType { }
   ```
2. **Update portfolio code** to use new type
3. **Update job-finder code** to use new type
4. **Remove after both projects are updated**

### Breaking Changes

When making breaking changes:

1. **Bump version** in `package.json` (major version)
2. **Document changes** in README.md changelog section
3. **Update both portfolio and job-finder** simultaneously
4. **Test integration** thoroughly on staging
5. **Deploy together** to avoid runtime mismatches

## Integration Examples

### job-finder-FE (TypeScript)

**Functions API:**
```typescript
import type { QueueItem, SubmitJobRequest } from '@jdubz/shared-types'

export const handleJobSubmission = async (
  data: SubmitJobRequest
): Promise<SubmitJobResponse> => {
  const queueItem: QueueItem = {
    type: "job",
    status: "pending",
    url: data.url,
    company_name: data.companyName || "Unknown",
    // ...
  }
  await db.collection("job-queue").add(queueItem)
  return { status: "success", message: "Job queued" }
}
```

**Web API Client:**
```typescript
import type { SubmitJobRequest, SubmitJobResponse } from '@jdubz/shared-types'

class JobQueueClient extends ApiClient {
  async submitJob(url: string, companyName?: string): Promise<SubmitJobResponse> {
    const request: SubmitJobRequest = { url, companyName }
    return this.post<SubmitJobResponse>("/submitJob", request)
  }
}
```

### Job-Finder (Python)

**Python Model:**
```python
from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime

# Mirrors QueueItem from TypeScript
class JobQueueItem(BaseModel):
    id: Optional[str] = None
    type: Literal["job", "company"]
    status: Literal["pending", "processing", "success", "failed", "skipped"]
    url: str
    company_name: str
    company_id: Optional[str] = None
    source: str
    submitted_by: Optional[str] = None
    retry_count: int = 0
    max_retries: int = 3
    result_message: Optional[str] = None
    error_details: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    processed_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
```

## Related Documentation

- **job-finder-FE:** `/home/jdubz/Development/portfolio/CLAUDE.md`
- **Job-finder:** `/home/jdubz/Development/job-finder/CONTEXT.md`
- **Integration Guide:** `/home/jdubz/Development/portfolio/PORTFOLIO_INTEGRATION_GUIDE.md`
- **Package README:** `./README.md`

## Best Practices

1. **Always document types** with JSDoc comments explaining purpose and usage
2. **Use descriptive names** that are clear in both TypeScript and Python contexts
3. **Avoid platform-specific types** in shared definitions
4. **Include validation helpers** when appropriate (type guards, validators)
5. **Version carefully** - breaking changes affect multiple projects
6. **Test cross-project integration** on staging before production
7. **Keep Python models in sync** - automated checks would be ideal

## Important Notes

- This package uses **local file: dependency** - changes take effect immediately after rebuild
- **No npm publishing** required - package stays within the development environment
- **Both projects must be updated together** when making breaking changes
- **Firestore field names** must exactly match type properties (snake_case convention)
- **Type guards** help with runtime validation in TypeScript contexts
