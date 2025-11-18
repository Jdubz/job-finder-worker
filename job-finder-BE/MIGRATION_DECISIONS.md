# Cloud Functions Migration Decisions

This document tracks key architectural decisions made during the migration of Firebase Cloud Functions from Portfolio to job-finder-BE.

## Date: October 19, 2025

### AI Provider Strategy

**Decision:** Use OpenAI only (for now)
- **Provider:** OpenAI GPT-4o-2024-08-06
- **Rationale:** Focus on single provider for initial implementation
- **Status:** Gemini provider temporarily removed
- **Future:** May add Gemini back later for cost optimization

**Implementation Notes:**
- `gemini.service.ts` - NOT implemented
- `openai.service.ts` - TO BE implemented
- `ai-provider.factory.ts` - Simplified to OpenAI only
- Secret Manager only needs `OPENAI_API_KEY`

### Deprecated Services

**Blurb Service - REMOVED**
- **Reason:** Functionality deprecated in favor of direct content items
- **Impact:** Remove all blurb-related code and references
- **Files Affected:**
  - `blurb.service.ts` - NOT migrating
  - Generator function - remove blurb references
  - Type definitions - remove BlurbEntry types

**Email Service - REMOVED**
- **Reason:** Not needed for job-finder (contact form was Portfolio-specific)
- **Impact:** No email functionality in job-finder-BE
- **Files Affected:**
  - `email.service.ts` - NOT migrating
  - Mailgun dependencies - remove from package.json

### Shared Types Strategy

**Decision:** Maximize shared types in job-finder-shared-types repo
- **Ownership:** Worker B is responsible for creating shared types
- **Location:** `job-finder-shared-types/src/`
- **Rationale:** Type safety across frontend and backend

**Types to Create in Shared Repo:**
1. `generator.types.ts` - AI generation types, document types
2. `content-item.types.ts` - Resume content types
3. `job-queue.types.ts` - Job queue types
4. `common.types.ts` - Shared interfaces (TokenUsage, etc.)

**Types to Keep in BE Repo:**
- Service-specific implementation types (not exposed to FE)
- Internal middleware types
- Configuration types

### Service Layer Requirements

**Required Services:**
1. ✅ Firestore Service (generic CRUD)
2. ✅ Secret Manager Service (API keys)
3. ⏳ OpenAI Service (AI generation)
4. ⏳ PDF Service (document generation with Handlebars)
5. ⏳ Storage Service (Cloud Storage operations)
6. ⏳ Generator Service (orchestration)
7. ⏳ Experience Service (experience CRUD)
8. ⏳ Content Item Service (content CRUD)
9. ⏳ Job Queue Service (queue management)

**Removed Services:**
- ❌ Gemini Service (temporarily)
- ❌ Blurb Service (deprecated)
- ❌ Email Service (not needed)

### Migration Status

**Completed:**
- Project structure initialization
- Configuration files (6 files)
- Middleware (3 files: auth, app-check, rate-limit)
- Base utilities (logger, request-id, date-format)
- Foundational services (Firestore, Secret Manager)

**In Progress:**
- Shared types creation
- OpenAI service

**Pending:**
- PDF service
- Storage service
- Business logic services (generator, experience, content-item, job-queue)
- Handlebars templates
- Function implementations (5 functions)
- Firestore rules and indexes
- CI/CD workflows
- Frontend integration

### Technical Notes

**Package Dependencies to Add:**
- `openai` - OpenAI SDK
- `handlebars` - Template engine for PDFs
- `puppeteer` or `pdf-lib` - PDF generation
- `busboy` - File upload parsing

**Package Dependencies to Remove:**
- `@google/generative-ai` - Gemini (not using yet)
- Any Mailgun-related packages

**Environment Variables:**
- `OPENAI_API_KEY` - Required from Secret Manager
- Remove: `GEMINI_API_KEY` (not using yet)

### Coordination with Worker A

**Worker A's Scope:**
- Frontend development
- Shared types consumption (NOT creation)
- API integration testing

**Worker B's Scope (This Worker):**
- Backend Cloud Functions
- Shared types creation and maintenance
- Service layer implementation
- Infrastructure setup

**Explicit Boundaries:**
- Worker B creates types in shared-types repo
- Worker A consumes types but doesn't modify them
- Both workers can use shared-types package
