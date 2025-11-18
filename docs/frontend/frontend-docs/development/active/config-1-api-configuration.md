# CONFIG-1 — API Configuration for job-finder-BE

> **Context**: See [CLAUDE.md](../../CLAUDE.md) for project overview and API integration patterns
> **Architecture**: Transitioning from Portfolio backend to dedicated job-finder-BE

---

## Issue Metadata

```yaml
Title: CONFIG-1 — API Configuration for job-finder-BE
Labels: priority-p1, repository-frontend, type-config, status-todo
Assignee: Worker B
Priority: P1-High
Estimated Effort: 3-5 hours
Repository: job-finder-FE
```

---

## Summary

**Problem**: The frontend currently references the old Portfolio backend infrastructure. As part of Phase 3 migration, the application needs to be reconfigured to point to the new dedicated job-finder-BE backend with correct API endpoints and environment-specific URLs.

**Goal**: Update all API configuration files, environment variables, and references to use the new job-finder-BE backend URLs for staging and production environments.

**Impact**: This is a critical configuration change that enables the frontend to communicate with the dedicated backend, improving separation of concerns and enabling independent scaling.

---

## Architecture References

> **📚 Read these docs first for context:**

- **[CLAUDE.md](../../CLAUDE.md)** - API integration patterns, config structure
- **[BACKEND_MIGRATION_PLAN.md](../architecture/BACKEND_MIGRATION_PLAN.md)** - Phase 3 migration details
- **[SYSTEM_ARCHITECTURE.md](../architecture/SYSTEM_ARCHITECTURE.md)** - Backend architecture

**Key concepts to understand**:

- **API Config**: Centralized configuration in `src/config/api.ts`
- **Environment Variables**: Vite env vars with VITE\_ prefix
- **Firebase Functions**: New job-finder-BE function endpoints
- **CORS Configuration**: Backend must allow frontend origins

---

## Tasks

### Phase 1: Update API Configuration

1. **Update api.ts configuration file**
   - What: Replace Portfolio URLs with job-finder-BE URLs
   - Where: `src/config/api.ts`
   - Why: Central location for all API endpoints
   - Test: All API calls use correct base URLs

2. **Remove Portfolio references**
   - What: Search and remove all Portfolio-related endpoints/comments
   - Where: Throughout `src/config/` directory
   - Why: Clean up old architecture references
   - Test: No remaining Portfolio mentions in config

### Phase 2: Environment Variables

3. **Update environment variable files**
   - What: Add job-finder-BE URLs for each environment
   - Where: `.env.development`, `.env.staging`, `.env.production`, `.env.example`
   - Why: Environment-specific backend URLs
   - Test: Correct URLs loaded in each environment

4. **Update Firebase project configuration**
   - What: Ensure Firebase config points to job-finder projects
   - Where: `.env` files, `.firebaserc`
   - Why: Connect to correct Firebase projects
   - Test: Firebase SDK connects to correct project

### Phase 3: Code Updates

5. **Update API service imports**
   - What: Verify all services use updated api config
   - Where: `src/services/` directory
   - Why: Ensure all API calls use new endpoints
   - Test: All API calls successfully reach backend

6. **Update documentation**
   - What: Update inline comments and config documentation
   - Where: `src/config/api.ts`, README.md
   - Why: Keep documentation current
   - Test: Documentation accurately reflects new setup

---

## Technical Details

### Files to Modify

```
MODIFY:
- src/config/api.ts - Main API configuration
- .env.development - Local/emulator URLs
- .env.staging - Staging backend URLs
- .env.production - Production backend URLs
- .env.example - Document all variables
- .firebaserc - Firebase project aliases
- README.md - Update API documentation

SEARCH & REPLACE:
- Remove all "Portfolio" references
- Update function URLs to job-finder-BE
- Update Firebase project IDs

REFERENCE:
- docs/architecture/BACKEND_MIGRATION_PLAN.md - New URLs and endpoints
```

### Key Implementation Notes

**Updated API Configuration**:

```typescript
// src/config/api.ts
const isDevelopment = import.meta.env.MODE === "development"
const isStaging = import.meta.env.MODE === "staging"

// Base URLs for different environments
const getBaseUrl = () => {
  if (isDevelopment) {
    // Local Firebase emulator or development backend
    return import.meta.env.VITE_USE_EMULATORS === "true"
      ? "http://localhost:5001/job-finder-dev/us-central1"
      : import.meta.env.VITE_API_BASE_URL
  }
  if (isStaging) {
    return "https://us-central1-job-finder-staging.cloudfunctions.net"
  }
  // Production
  return "https://us-central1-job-finder-prod.cloudfunctions.net"
}

const BASE_URL = getBaseUrl()

export const api = {
  baseUrl: BASE_URL,

  // Firebase Functions endpoints
  functions: {
    // Document generation
    manageGenerator: `${BASE_URL}/manageGenerator`,

    // Content management
    manageContentItems: `${BASE_URL}/manageContentItems`,

    // Contact form
    handleContactForm: `${BASE_URL}/handleContactForm`,

    // Future endpoints
    manageJobQueue: `${BASE_URL}/manageJobQueue`,
    manageSettings: `${BASE_URL}/manageSettings`,
  },

  // Firestore collections (accessed via Firebase SDK, not REST)
  collections: {
    jobMatches: "job-matches",
    jobQueue: "job-queue",
    contentItems: "content-items",
    documents: "generated-documents",
    settings: "job-finder-config",
  },
}

// Helper function for authenticated requests
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {},
  authToken: string
): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
  })
}
```

**Environment Variables Template**:

```bash
# .env.example

# Firebase Configuration
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-auth-domain
VITE_FIREBASE_PROJECT_ID=job-finder-prod
VITE_FIREBASE_STORAGE_BUCKET=your-storage-bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id

# Backend API Configuration
VITE_API_BASE_URL=https://us-central1-job-finder-prod.cloudfunctions.net

# Development Only - Set to 'true' to use Firebase emulators
VITE_USE_EMULATORS=false

# Optional - Analytics
VITE_GA_TRACKING_ID=your-ga-id
```

**.env.development**:

```bash
VITE_FIREBASE_PROJECT_ID=job-finder-dev
VITE_FIREBASE_AUTH_DOMAIN=localhost
VITE_USE_EMULATORS=true
VITE_API_BASE_URL=http://localhost:5001/job-finder-dev/us-central1
```

**.env.staging**:

```bash
VITE_FIREBASE_PROJECT_ID=job-finder-staging
VITE_FIREBASE_AUTH_DOMAIN=staging.jobfinder.app
VITE_USE_EMULATORS=false
VITE_API_BASE_URL=https://us-central1-job-finder-staging.cloudfunctions.net
```

**.firebaserc Update**:

```json
{
  "projects": {
    "default": "job-finder-prod",
    "staging": "job-finder-staging",
    "development": "job-finder-dev"
  }
}
```

**Integration Points**:

- **All API Services**: Update to use new base URLs
- **Firebase Functions**: New project-specific function URLs
- **CORS**: Backend must allow new frontend URLs
- **Environment Detection**: Vite MODE for environment switching

---

## Acceptance Criteria

- [ ] **API config updated**: `src/config/api.ts` uses job-finder-BE URLs
- [ ] **Portfolio references removed**: No mentions of old Portfolio backend
- [ ] **Environment variables set**: All .env files have correct URLs
- [ ] **Firebase config correct**: Points to job-finder Firebase projects
- [ ] **Development works**: Can connect to emulators or dev backend
- [ ] **Staging works**: Staging deployment connects to staging backend
- [ ] **Production ready**: Production config ready for deployment
- [ ] **Documentation updated**: README and comments reflect new setup
- [ ] **TypeScript passes**: No type errors after changes
- [ ] **Build succeeds**: Production build completes without errors

---

## Testing

### Test Commands

```bash
# Type check
npm run type-check

# Lint
npm run lint

# Build for each environment
npm run build -- --mode development
npm run build -- --mode staging
npm run build -- --mode production

# Run dev server
npm run dev
```

### Manual Testing

```bash
# Step 1: Test development environment
npm run dev
# Verify it connects to emulators or dev backend
# Check browser console for API calls
# Verify URLs match development config

# Step 2: Test API endpoint resolution
# 1. Open browser DevTools Network tab
# 2. Trigger an API call (e.g., generate document)
# 3. Verify request URL uses job-finder-BE domain
# 4. Check for CORS errors (should be none)

# Step 3: Test environment switching
NODE_ENV=staging npm run build
# Verify build uses staging URLs

NODE_ENV=production npm run build
# Verify build uses production URLs

# Step 4: Verify Firebase connection
# 1. Log in to the app
# 2. Check browser console
# 3. Verify Firebase connects to correct project
# 4. Check Firestore queries work

# Step 5: Test all API endpoints
# - manageGenerator (document generation)
# - manageContentItems (content management)
# - handleContactForm (contact form)
# Verify all return 200 or expected responses

# Step 6: Check for stale references
grep -r "Portfolio" src/
# Should return no results in config files
```

---

## Commit Message Template

```
config(api): update API configuration for job-finder-BE

Update all API configuration to use dedicated job-finder-BE backend
instead of Portfolio infrastructure. Remove old references and configure
environment-specific URLs for development, staging, and production.

Key changes:
- Update src/config/api.ts with job-finder-BE URLs
- Remove all Portfolio backend references
- Configure environment variables for all environments
- Update .firebaserc with job-finder project aliases
- Add helper functions for authenticated requests
- Update documentation with new API structure

Testing:
- Verified API calls reach correct backend in each environment
- Tested Firebase connection to correct projects
- Confirmed no CORS errors with new URLs
- Validated all environment builds succeed

Closes #9
```

---

## Related Issues

- **Depends on**: job-finder-BE deployment to staging/production
- **Blocks**: INTEGRATION-1 (API Integration Testing)
- **Related**: Backend migration Phase 3

---

## Resources

### Documentation

- **Vite Env Variables**: https://vitejs.dev/guide/env-and-mode.html
- **Firebase Projects**: https://firebase.google.com/docs/projects/learn-more
- **CORS Configuration**: https://firebase.google.com/docs/functions/http-events#cors

### Internal Documentation

- **BACKEND_MIGRATION_PLAN.md**: Details on new backend structure
- **SYSTEM_ARCHITECTURE.md**: System-wide architecture

---

## Success Metrics

**How we'll measure success**:

- **Zero CORS errors**: All API calls succeed without CORS issues
- **Correct routing**: 100% of API calls reach intended backend
- **Build success**: All environment builds complete without errors
- **Zero stale references**: No Portfolio mentions in config

---

## Notes

**Questions? Need clarification?**

- Comment on this issue with specific questions
- Tag @PM for guidance
- Check BACKEND_MIGRATION_PLAN.md for URL details

**Implementation Tips**:

- Use search/replace carefully to avoid breaking working code
- Test each environment after updating
- Verify CORS settings on backend match frontend URLs
- Keep .env.example up to date for team documentation
- Consider adding API health check endpoint
- Add logging for API errors to debug connection issues
- Document any custom headers or auth requirements

**Before Deploying**:

- [ ] Test all API endpoints in staging
- [ ] Verify CORS configuration on backend
- [ ] Confirm Firebase project access permissions
- [ ] Update CI/CD secrets with new environment variables
- [ ] Test authenticated and unauthenticated requests

---

**Created**: 2025-10-19
**Created By**: PM
**Last Updated**: 2025-10-19
**Status**: Todo
