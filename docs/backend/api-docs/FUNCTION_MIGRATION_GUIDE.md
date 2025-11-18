> Status: Archived
> Owner: @jdubz
> Last Updated: 2025-11-18

# Function Migration Guide

This document outlines the process for migrating remaining functions from the portfolio repository to job-finder-BE.

## Overview

The following functions need to be migrated from the portfolio repository (commit `a06adc6^` before removal):

### Functions to Migrate

1. **manageGenerator** (Issue #8)
   - Source: `portfolio/functions/src/generator.ts` (1873 lines)
   - Purpose: Resume & cover letter AI generation with PDF output
   - Dependencies: OpenAI, Gemini, Puppeteer, GCS Storage
   - Related functions: `uploadResume`

2. **manageContentItems** (Issue #9)
   - Source: `portfolio/functions/src/content-items.ts`
   - Purpose: Portfolio content management (projects, skills, etc.)
   - Dependencies: Firestore, authentication

3. **manageExperience** (Issue #9)
   - Source: `portfolio/functions/src/experience.ts`
   - Purpose: Work experience management
   - Dependencies: Firestore, authentication

4. **uploadResume** (Issue #8)
   - Source: `portfolio/functions/src/resume.ts`
   - Purpose: Resume PDF upload to GCS with validation
   - Dependencies: GCS Storage, Busboy

## Migration Process

### Step 1: Extract Source Files from Git History

```bash
# Navigate to portfolio repository
cd /home/jdubz/Development/portfolio

# Extract files from git history (commit before removal)
git show a06adc6^:functions/src/generator.ts > /tmp/generator.ts
git show a06adc6^:functions/src/content-items.ts > /tmp/content-items.ts
git show a06adc6^:functions/src/experience.ts > /tmp/experience.ts
git show a06adc6^:functions/src/resume.ts > /tmp/resume.ts

# Copy to job-finder-BE
cp /tmp/generator.ts /home/jdubz/Development/job-finder-app-manager/job-finder-BE/src/
cp /tmp/content-items.ts /home/jdubz/Development/job-finder-app-manager/job-finder-BE/src/
cp /tmp/experience.ts /home/jdubz/Development/job-finder-app-manager/job-finder-BE/src/
cp /tmp/resume.ts /home/jdubz/Development/job-finder-app-manager/job-finder-BE/src/
```

### Step 2: Extract Service Dependencies

The following service files also need to be extracted:

```bash
# Generator services
git show a06adc6^:functions/src/services/generator.service.ts > /tmp/generator.service.ts
git show a06adc6^:functions/src/services/experience.service.ts > /tmp/experience.service.ts
git show a06adc6^:functions/src/services/blurb.service.ts > /tmp/blurb.service.ts
git show a06adc6^:functions/src/services/ai-provider.factory.ts > /tmp/ai-provider.factory.ts
git show a06adc6^:functions/src/services/pdf.service.ts > /tmp/pdf.service.ts
git show a06adc6^:functions/src/services/storage.service.ts > /tmp/storage.service.ts

# Copy to job-finder-BE
cp /tmp/*.service.ts /home/jdubz/Development/job-finder-app-manager/job-finder-BE/src/services/
cp /tmp/ai-provider.factory.ts /home/jdubz/Development/job-finder-app-manager/job-finder-BE/src/services/
```

### Step 3: Extract Type Definitions

```bash
# Generator types
git show a06adc6^:functions/src/types/generator.types.ts > /tmp/generator.types.ts

# Copy to job-finder-BE
cp /tmp/generator.types.ts /home/jdubz/Development/job-finder-app-manager/job-finder-BE/src/types/
```

### Step 4: Extract Utility Functions

```bash
# Generation steps utility
git show a06adc6^:functions/src/utils/generation-steps.ts > /tmp/generation-steps.ts

# Copy to job-finder-BE
cp /tmp/generation-steps.ts /home/jdubz/Development/job-finder-app-manager/job-finder-BE/src/utils/
```

### Step 5: Install Additional Dependencies

Add these to `package.json`:

```json
{
  "dependencies": {
    "@google-cloud/storage": "^7.7.0",
    "@google-cloud/vertexai": "^1.3.0",
    "@genkit-ai/ai": "^0.5.0",
    "@genkit-ai/googleai": "^0.5.0",
    "busboy": "^1.6.0",
    "puppeteer": "^22.6.0",
    "sharp": "^0.33.0"
  },
  "devDependencies": {
    "@types/busboy": "^1.5.4"
  }
}
```

### Step 6: Update Error Codes

Add generator and content-items specific error codes to `src/config/error-codes.ts`:

```typescript
export const GENERATOR_ERROR_CODES = {
  VALIDATION_FAILED: {
    code: "GENERATOR_VALIDATION_FAILED",
    status: 400,
    message: "Request validation failed"
  },
  // ... add all error codes from portfolio
};

export const CONTENT_ITEMS_ERROR_CODES = {
  // ... add content-items error codes
};
```

### Step 7: Update Exports in index.ts

```typescript
// Export generator functions
export { manageGenerator } from "./generator";
export { uploadResume } from "./resume";

// Export content management functions
export { manageContentItems } from "./content-items";
export { manageExperience } from "./experience";
```

### Step 8: Update CI/CD for New Functions

Update `.github/workflows/ci.yml` to deploy the new functions:

```yaml
- name: Deploy Cloud Functions to Staging
  run: |
    # Existing manageJobQueue
    gcloud functions deploy manageJobQueue-staging ...

    # New functions
    gcloud functions deploy manageGenerator-staging \
      --gen2 \
      --runtime=nodejs20 \
      --region=us-central1 \
      --source=. \
      --entry-point=manageGenerator \
      --trigger-http \
      --allow-unauthenticated \
      --memory=1024Mi \
      --timeout=540s \
      --project=static-sites-257923

    gcloud functions deploy uploadResume-staging \
      --gen2 \
      --runtime=nodejs20 \
      --region=us-central1 \
      --source=. \
      --entry-point=uploadResume \
      --trigger-http \
      --allow-unauthenticated \
      --memory=512Mi \
      --project=static-sites-257923

    gcloud functions deploy manageContentItems-staging \
      --gen2 \
      --runtime=nodejs20 \
      --region=us-central1 \
      --source=. \
      --entry-point=manageContentItems \
      --trigger-http \
      --allow-unauthenticated \
      --memory=256Mi \
      --project=static-sites-257923

    gcloud functions deploy manageExperience-staging \
      --gen2 \
      --runtime=nodejs20 \
      --region=us-central1 \
      --source=. \
      --entry-point=manageExperience \
      --trigger-http \
      --allow-unauthenticated \
      --memory=256Mi \
      --project=static-sites-257923
```

## Import Path Updates

After copying files, update all imports to use job-finder-BE paths:

### Common Import Changes

```typescript
// OLD (portfolio):
import { DATABASE_ID } from "./config/database"
import { logger } from "./utils/logger"
import { GENERATOR_ERROR_CODES } from "./config/error-codes"

// NEW (job-finder-BE): No changes needed if using relative imports
// Just ensure files are in correct locations
```

### Service Imports

```typescript
// Ensure services are imported from correct location
import { GeneratorService } from "./services/generator.service"
import { StorageService } from "./services/storage.service"
import { PDFService } from "./services/pdf.service"
```

## Configuration Updates

### Database Configuration

Ensure `src/config/database.ts` exports `DATABASE_ID` for Firestore database selection.

### Storage Configuration

Create or update `src/config/storage.ts`:

```typescript
export const STORAGE_BUCKET = process.env.NODE_ENV === 'production'
  ? 'static-sites-257923.appspot.com'
  : 'static-sites-257923-staging.appspot.com';
```

## Testing

After migration:

1. **Build locally**: `npm run build`
2. **Run linter**: `npm run lint`
3. **Run tests**: `npm test`
4. **Test in emulator**: `npm run serve`
5. **Deploy to staging**: Git push to staging branch
6. **Smoke test**: Test each endpoint manually
7. **Deploy to production**: Merge to main

## Checklist

- [x] Extract all source files from git history
- [x] Extract all service dependencies
- [x] Extract type definitions
- [x] Extract utility functions
- [x] Install additional dependencies
- [x] Update error codes
- [x] Update index.ts exports
- [x] Update CI/CD workflows
- [x] Update import paths (not needed - relative imports work correctly)
- [x] Update configuration (added all database collection constants)
- [x] Build succeeds locally
- [x] Lint passes (4 warnings, 0 errors)
- [ ] Tests pass
- [ ] Functions work in emulator
- [ ] Deploy to staging succeeds
- [ ] Smoke tests pass
- [ ] Deploy to production

## Notes

- Generator function requires 1024Mi memory due to Puppeteer PDF generation
- Upload function requires 512Mi memory for image processing
- All functions use `--allow-unauthenticated` but implement authentication at the application level
- Ensure Secret Manager secrets (openai-api-key, gemini-api-key) are accessible

## Related Issues

- #8 - Phase 2: Migrate generator functions from portfolio
- #9 - Phase 2: Migrate content-items functions from portfolio
