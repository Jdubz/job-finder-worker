# Backend Migration Plan: Portfolio → job-finder-BE

## Executive Summary

Firebase Cloud Functions for the job-finder application currently live in the `../portfolio` repository. This document outlines the complete migration strategy to extract these functions and move them to the dedicated `job-finder-BE` repository while keeping the Python worker (`job-finder/`) responsible for queue processing, scraping, and AI analysis. The migrated Functions will focus on serving data and configuration to the frontend.

## Current State Analysis

### Portfolio Repository (`../portfolio/functions/`)

**Contains ALL job-finder backend functions that need to be migrated:**

1. **`job-queue.js/ts`** - Job queue management functions
2. **`generator.js/ts`** - AI document generation functions
3. **`content-items.js/ts`** - Content items management functions
4. **`experience.js/ts`** - Experience management functions
5. **`resume.js/ts`** - Resume-specific functions

**KEEP in Portfolio (DO NOT migrate):**

- **`index.js/ts`** - Contact form handler (`handleContactForm`)
- **`contact-form/`** - Contact form specific code
- **Gatsby App** - Portfolio website (in `web/` directory)

### Shared Infrastructure (Migrate with modifications)

- **`config/`** - Configuration files (database, CORS, secrets, etc.)
- **`middleware/`** - Auth, rate limiting, app check middleware
- **`services/`** - Firestore, email, secret manager, storage, PDF, AI services
- **`utils/`** - Logger, date formatting, request ID utilities
- **`types/`** - TypeScript type definitions
- **`templates/`** - Handlebars templates for document generation
- **`firestore.rules`** - Firestore security rules (job-finder specific)
- **`firestore.indexes.json`** - Firestore indexes (job-finder specific)
- **`storage.rules`** - Storage security rules (job-finder specific)

### job-finder-FE Repository

**Currently has API clients expecting these endpoints:**

- `/submitJob`, `/submitScrape`, `/submitCompany`, `/queue/*`
- `/generateDocument`, `/history`, `/defaults`
- `/manageContentItems` (CRUD operations)
- Health and monitoring endpoints

### job-finder-BE Repository

- **Current State**: Empty repository (just cloned)
- **Target State**: Full Firebase Functions backend for job-finder

## Migration Strategy

### Phase 1: Repository Setup & Infrastructure (Worker A)

**Week 1-2: Set up job-finder-BE repository foundation**

#### Tasks:

1. **Initialize Firebase Functions project structure**

   ```bash
   cd job-finder-BE
   firebase init functions
   # Select TypeScript
   # Set up ESLint
   ```

2. **Copy shared infrastructure from portfolio**
   - `config/` → Modify for job-finder context
   - `middleware/` → Keep auth, rate-limit, app-check
   - `utils/` → Copy logger, request-id, date-format
   - `services/firestore.service.ts` → Adapt for job-finder collections
   - `services/secret-manager.service.ts` → Copy as-is

3. **Set up package.json with dependencies**

   ```json
   {
     "dependencies": {
       "firebase-admin": "^13.5.0",
       "firebase-functions": "^6.5.0",
       "cors": "^2.8.5",
       "express-rate-limit": "^8.1.0",
       "joi": "^17.13.3",
       "zod": "^4.1.12",
       "handlebars": "^4.7.8"
     }
   }
   ```

4. **Configure firebase.json**

   ```json
   {
     "functions": {
       "source": "functions",
       "runtime": "nodejs20"
     },
     "firestore": {
       "rules": "firestore.rules",
       "indexes": "firestore.indexes.json"
     },
     "storage": {
       "rules": "storage.rules"
     }
   }
   ```

5. **Set up CI/CD pipeline**
   - Create `.github/workflows/deploy.yml`
   - Configure staging and production environments
   - Set up automated testing

6. **Environment and secrets setup**
   - Configure Firebase project
   - Set up Secret Manager secrets
   - Create `.env` files for local development

### Phase 2: Core API Migration (Week 3-5)

#### Worker A: Job Queue & Config APIs

**Task 2.1: Migrate Job Queue Functions**

```typescript
// functions/src/job-queue.ts
export const submitJob = functions.https.onCall(...)
export const submitScrape = functions.https.onCall(...)
export const submitCompany = functions.https.onCall(...)
export const getQueue = functions.https.onCall(...)
export const getQueueStats = functions.https.onCall(...)
export const retryQueueItem = functions.https.onCall(...)
export const cancelQueueItem = functions.https.onCall(...)
```

**Files to migrate:**

- `portfolio/functions/dist/job-queue.js` → `job-finder-BE/functions/src/job-queue.ts`
- `portfolio/functions/dist/services/job-queue.service.js` → `job-finder-BE/functions/src/services/job-queue.service.ts`
- `portfolio/functions/dist/types/job-queue.types.js` → `job-finder-BE/functions/src/types/job-queue.types.ts`

**Task 2.2: Set up Firestore Integration**

- Migrate firestore service
- Configure collections: `job-queue`, `job-matches`, `job-finder-config`
- Set up real-time listeners
- Implement query and filter logic

**Task 2.3: Implement Config API**

- Stop lists management
- Queue settings management
- AI settings management

#### Worker B: Generator & Content Items APIs

**Task 2.4: Migrate Generator Functions**

```typescript
// functions/src/generator.ts
export const generateDocument = functions.https.onCall(...)
export const getGenerationHistory = functions.https.onCall(...)
export const getUserDefaults = functions.https.onCall(...)
export const deleteDocument = functions.https.onCall(...)
```

**Files to migrate:**

- `portfolio/functions/dist/generator.js` → `job-finder-BE/functions/src/generator.ts`
- `portfolio/functions/dist/resume.js` → `job-finder-BE/functions/src/resume.ts`
- `portfolio/functions/dist/services/generator.service.js` → `job-finder-BE/functions/src/services/generator.service.ts`
- `portfolio/functions/dist/services/pdf.service.js` → `job-finder-BE/functions/src/services/pdf.service.ts`
- `portfolio/functions/dist/services/ai-provider.factory.js` → `job-finder-BE/functions/src/services/ai-provider.factory.ts`
- `portfolio/functions/dist/services/gemini.service.js` → `job-finder-BE/functions/src/services/gemini.service.ts`
- `portfolio/functions/dist/services/openai.service.js` → `job-finder-BE/functions/src/services/openai.service.ts`
- `portfolio/functions/dist/templates/` → `job-finder-BE/functions/src/templates/`
- `portfolio/functions/dist/types/generator.types.js` → `job-finder-BE/functions/src/types/generator.types.ts`

**Task 2.5: Migrate Content Items Functions**

```typescript
// functions/src/content-items.ts
export const manageContentItems = functions.https.onRequest(...)
// GET, POST, PUT, DELETE operations
```

**Files to migrate:**

- `portfolio/functions/dist/content-items.js` → `job-finder-BE/functions/src/content-items.ts`
- `portfolio/functions/dist/experience.js` → `job-finder-BE/functions/src/experience.ts`
- `portfolio/functions/dist/services/content-item.service.js` → `job-finder-BE/functions/src/services/content-item.service.ts`
- `portfolio/functions/dist/services/experience.service.js` → `job-finder-BE/functions/src/services/experience.service.ts`
- `portfolio/functions/dist/types/content-item.types.js` → `job-finder-BE/functions/src/types/content-item.types.ts`

### Phase 3: Frontend Integration (Week 6-7)

#### Worker B: Update job-finder-FE

**Task 3.1: Update API Configuration**

```typescript
// job-finder-FE/src/config/api.ts
export const FUNCTION_URLS = {
  jobQueue: "https://us-central1-YOUR-PROJECT.cloudfunctions.net",
  generator: "https://us-central1-YOUR-PROJECT.cloudfunctions.net",
  contentItems: "https://us-central1-YOUR-PROJECT.cloudfunctions.net",
  // Remove Portfolio backend references
};
```

**Task 3.2: Update Environment Variables**

```bash
# job-finder-FE/.env
VITE_JOB_QUEUE_API_URL=https://us-central1-YOUR-PROJECT.cloudfunctions.net
VITE_GENERATOR_API_URL=https://us-central1-YOUR-PROJECT.cloudfunctions.net
VITE_CONTENT_ITEMS_API_URL=https://us-central1-YOUR-PROJECT.cloudfunctions.net
```

**Task 3.3: Test All API Integrations**

- Test job submission workflows
- Test document generation
- Test content items management
- Verify real-time Firestore listeners
- Test error handling and recovery

### Phase 4: Portfolio Cleanup (Week 8)

#### Worker A & Worker B: Clean up Portfolio Repository

**Task 4.1: Remove job-finder functions from portfolio**

```bash
cd /home/jdubz/Development/portfolio/functions/dist
rm -rf job-queue.js job-queue.d.ts job-queue.js.map
rm -rf generator.js generator.d.ts generator.js.map
rm -rf content-items.js content-items.d.ts content-items.js.map
rm -rf experience.js experience.d.ts experience.js.map
rm -rf resume.js resume.d.ts resume.js.map
rm -rf types/job-queue.types.*
rm -rf types/generator.types.*
rm -rf types/content-item.types.*
rm -rf services/job-queue.service.*
rm -rf services/generator.service.*
rm -rf services/content-item.service.*
rm -rf services/experience.service.*
rm -rf services/pdf.service.*
rm -rf services/ai-provider.factory.*
rm -rf services/gemini.service.*
rm -rf services/openai.service.*
```

**Task 4.2: Update portfolio/functions/src/**

- Remove job-finder TypeScript source files
- Keep only contact form handler and related services
- Update imports and exports

**Task 4.3: Update portfolio firebase.json**

- Remove job-finder firestore rules/indexes if separate
- Keep only portfolio-specific configuration

**Task 4.4: Update portfolio documentation**

- Remove job-finder references from README
- Update CONTEXT.md to reflect contact-form-only functions
- Archive migration documentation

### Phase 5: Testing & Validation (Week 9)

#### Both Workers: Comprehensive Testing

**Task 5.1: Unit Testing**

- Test individual Cloud Functions
- Test service layer methods
- Test middleware functionality
- Test type validation

**Task 5.2: Integration Testing**

- Test frontend → backend communication
- Test Firestore operations
- Test Firebase Auth integration
- Test real-time listeners

**Task 5.3: End-to-End Testing**

- Test complete user workflows:
  - Job submission → Queue processing → Match creation
  - Job match → Document generation → PDF delivery
  - Content items CRUD operations
- Test error scenarios and recovery
- Test rate limiting and security

**Task 5.4: Performance Testing**

- Load testing for API endpoints
- Concurrent user testing
- Database query performance
- Function cold start times

**Task 5.5: Security Testing**

- Authentication and authorization
- Input validation and sanitization
- Rate limiting effectiveness
- Secret management security

### Phase 6: Deployment & Migration (Week 10)

#### Task 6.1: Staging Deployment

1. Deploy job-finder-BE to staging environment
2. Update job-finder-FE staging to use new backend
3. Comprehensive staging testing
4. Monitor logs and metrics

#### Task 6.2: Production Deployment Strategy

**Zero-Downtime Deployment:**

1. **Pre-deployment**
   - Backup all Firestore data
   - Document rollback procedures
   - Prepare monitoring and alerts

2. **Deployment Steps**

   ```bash
   # Deploy new backend
   cd job-finder-BE
   firebase deploy --only functions --project=production

   # Deploy updated frontend
   cd job-finder-FE
   npm run deploy:production

   # Verify health endpoints
   curl https://us-central1-YOUR-PROJECT.cloudfunctions.net/health
   ```

3. **Post-deployment**
   - Monitor error rates
   - Check function execution times
   - Verify data consistency
   - Test critical user workflows

4. **Portfolio Cleanup (Final)**
   ```bash
   cd /home/jdubz/Development/portfolio
   firebase deploy --only functions --project=portfolio
   # This deploys only the contact-form function
   ```

#### Task 6.3: Rollback Plan

If issues occur:

1. Revert job-finder-FE to previous version
2. Traffic will route back to portfolio functions (if still deployed)
3. Investigate and fix issues
4. Redeploy when ready

## File Migration Checklist

### Functions to Migrate

- [ ] `job-queue.ts` + service + types
- [ ] `generator.ts` + service + types
- [ ] `resume.ts`
- [ ] `content-items.ts` + service + types
- [ ] `experience.ts` + service
- [ ] `pdf.service.ts`
- [ ] `ai-provider.factory.ts`
- [ ] `gemini.service.ts`
- [ ] `openai.service.ts`
- [ ] `storage.service.ts`
- [ ] Templates directory (`*.hbs` files)

### Shared Infrastructure to Adapt

- [ ] `config/database.ts`
- [ ] `config/firestore.ts`
- [ ] `config/cors.ts`
- [ ] `config/secrets.ts`
- [ ] `middleware/auth.middleware.ts`
- [ ] `middleware/rate-limit.middleware.ts`
- [ ] `middleware/app-check.middleware.ts`
- [ ] `services/firestore.service.ts`
- [ ] `services/secret-manager.service.ts`
- [ ] `utils/logger.ts`
- [ ] `utils/request-id.ts`
- [ ] `utils/date-format.ts`

### Configuration Files

- [ ] `firebase.json`
- [ ] `firestore.rules`
- [ ] `firestore.indexes.json`
- [ ] `storage.rules`
- [ ] `package.json`
- [ ] `tsconfig.json`
- [ ] `.eslintrc` / `eslint.config.mjs`

### Files to Keep in Portfolio

- [x] `index.ts` (contact form handler)
- [x] `services/email.service.ts`
- [x] `web/` (Gatsby app)
- [x] Portfolio-specific configuration

## Risk Assessment

### High-Risk Areas

1. **Data Migration**: Firestore collections and documents
   - **Mitigation**: Backup before migration, test extensively
2. **Authentication**: Breaking user sessions
   - **Mitigation**: Use same Firebase project, maintain auth state
3. **API Compatibility**: Breaking existing frontend
   - **Mitigation**: Maintain API contracts, version endpoints
4. **Secrets**: API keys and credentials
   - **Mitigation**: Use Secret Manager, test in staging first

### Medium-Risk Areas

1. **Performance**: Function cold starts
   - **Mitigation**: Use minimum instances for critical functions
2. **Dependencies**: Package version conflicts
   - **Mitigation**: Match versions from portfolio, test thoroughly
3. **CORS**: Cross-origin request issues
   - **Mitigation**: Configure CORS properly, test from frontend

## Success Criteria

### Technical Success

- [ ] All functions deployed and operational in job-finder-BE
- [ ] Frontend successfully communicating with new backend
- [ ] No data loss or corruption
- [ ] Performance meets or exceeds current benchmarks
- [ ] All tests passing (unit, integration, E2E)
- [ ] Security requirements met
- [ ] Portfolio functions cleaned up (contact-form only)

### Operational Success

- [ ] Zero-downtime deployment achieved
- [ ] Monitoring and alerting configured
- [ ] Documentation updated across all repositories
- [ ] Team trained on new architecture
- [ ] Rollback procedures documented and tested

## Timeline

- **Week 1-2**: Repository setup & infrastructure (Worker A)
- **Week 3-5**: Core API migration (Worker A & B)
- **Week 6-7**: Frontend integration (Worker B)
- **Week 8**: Portfolio cleanup (Worker A & B)
- **Week 9**: Testing & validation (Both Workers)
- **Week 10**: Deployment & migration (Both Workers)

**Total Estimated Time**: 10 weeks

## Next Steps

1. **Immediate**: Update `.gitignore` to include job-finder-BE ✅
2. **Week 1**: Clone job-finder-BE and initialize Firebase ✅
3. **Week 1**: Set up repository structure and CI/CD
4. **Week 2**: Copy shared infrastructure from portfolio
5. **Week 3**: Begin job queue function migration
