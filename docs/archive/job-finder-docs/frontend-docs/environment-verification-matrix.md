# Environment Verification Matrix

**Created**: 2025-10-20
**Owner**: Worker B
**Issue**: FE-BUG-2

---

## Executive Summary

**🚨 CRITICAL FINDING**: Environment files reference non-existent Firebase projects while actual deployment uses `static-sites-257923`.

**Impact**: All API calls to Cloud Functions are failing in staging and production because URLs point to wrong projects.

**Root Cause**: After migration from Portfolio to job-finder-BE, environment files were not updated to reflect actual Firebase project structure.

---

## Environment Variable Audit

### Required Variables (from `src/config/`)

#### Firebase SDK Configuration (`src/config/firebase.ts`)
- `VITE_FIREBASE_API_KEY` ✅ Required
- `VITE_FIREBASE_AUTH_DOMAIN` ✅ Required
- `VITE_FIREBASE_PROJECT_ID` ✅ Required
- `VITE_FIREBASE_STORAGE_BUCKET` ✅ Required
- `VITE_FIREBASE_MESSAGING_SENDER_ID` ✅ Required
- `VITE_FIREBASE_APP_ID` ✅ Required

#### API Configuration (`src/config/api.ts`)
- `VITE_API_BASE_URL` ⚠️ Used in development only
- `VITE_USE_EMULATORS` ⚠️ Development only
- `VITE_ENVIRONMENT` ⚠️ Metadata only

#### Legacy Variables (deprecated, still present)
- `VITE_GENERATOR_API_URL` ❌ Deprecated
- `VITE_CONTENT_ITEMS_API_URL` ❌ Deprecated
- `VITE_JOB_QUEUE_API_URL` ❌ Deprecated
- `VITE_CONTACT_FUNCTION_URL` ❌ Deprecated

---

## API Client Matrix

| API Client | Endpoint Function | Required Env Vars | Status |
|------------|-------------------|-------------------|--------|
| `generator-client.ts` | `/manageGenerator` | Firebase config + BASE_URL | ❌ Wrong URL |
| `content-items-client.ts` | `/manageContentItems` | Firebase config + BASE_URL | ❌ Wrong URL |
| `job-queue-client.ts` | `/manageJobQueue` | Firebase config + BASE_URL | ❌ Wrong URL |
| `job-matches-client.ts` | Firestore direct | Firebase config only | ⚠️ Wrong project |
| `config-client.ts` | Firestore direct | Firebase config only | ⚠️ Wrong project |
| `prompts-client.ts` | Firestore direct | Firebase config only | ⚠️ Wrong project |
| `system-health-client.ts` | `/healthCheck` | BASE_URL | ❌ Wrong URL |

---

## Environment Testing Matrix

### Development Environment (`npm run dev` with `.env.development`)

**Configuration**:
- Project: `job-finder-dev`
- Functions: `http://localhost:5001/job-finder-dev/us-central1`
- Emulators: Enabled

| Component | Expected Behavior | Actual Status | Notes |
|-----------|-------------------|---------------|-------|
| Firebase Auth | Sign in/out works | ⚠️ UNTESTED | Requires emulator running |
| Job Queue API | POST to `/manageJobQueue` | ⚠️ UNTESTED | Requires emulator + function |
| Generator API | POST to `/manageGenerator` | ⚠️ UNTESTED | Requires emulator + function |
| Content Items API | CRUD operations | ⚠️ UNTESTED | Requires emulator + function |
| Firestore Direct | Read/write job matches | ⚠️ UNTESTED | Requires emulator |
| System Health | GET `/healthCheck` | ⚠️ UNTESTED | Requires function deployed |

**Verdict**: ⚠️ **Cannot verify without emulators** - Development requires Firebase emulators and Cloud Functions deployed locally.

---

### Staging Environment (Preview with `.env.staging`)

**Current Configuration** (INCORRECT):
```
Project: job-finder-staging  ❌ Does not exist
Functions: https://us-central1-job-finder-staging.cloudfunctions.net  ❌ Wrong URL
Auth Domain: job-finder-staging.joshwentworth.com
```

**Actual Deployment** (from Worker A's FE_RECOVERY_COMPLETION_SUMMARY.md):
```
Project: static-sites-257923  ✅ Actual project
Functions: https://us-central1-static-sites-257923.cloudfunctions.net  ✅ Correct URL
Hosting: https://job-finder-staging.web.app (origin)
Hosting: https://job-finder-staging.joshwentworth.com (Cloudflare front door)
```

**Function Endpoints** (from Worker A's verification):
- `manageJobQueue-staging` ✅ Exists, returns 401 (auth required)
- `manageGenerator-staging` ✅ Exists, returns 401 (auth required)
- `manageExperience-staging` ✅ Exists, returns 401 (auth required)
- `manageContentItems-staging` ✅ Exists, returns 401 (auth required)
- `contact-form-staging` ✅ Exists, returns 401 (auth required)

| Component | Current Config | Actual Deployment | Status |
|-----------|----------------|-------------------|--------|
| Firebase Project ID | `job-finder-staging` | `static-sites-257923` | ❌ MISMATCH |
| Functions Base URL | `us-central1-job-finder-staging.cloudfunctions.net` | `us-central1-static-sites-257923.cloudfunctions.net` | ❌ MISMATCH |
| Function Suffix | None | `-staging` suffix | ❌ MISMATCH |
| Auth Domain | `job-finder-staging.joshwentworth.com` | ✅ Correct | ✅ CORRECT |
| Hosting URL | N/A | `job-finder-staging.web.app` | ✅ DEPLOYED |

**Verdict**: ❌ **BROKEN** - All Cloud Function calls fail because URLs point to non-existent project.

---

### Production Environment (Preview with `.env.production`)

**Current Configuration** (INCORRECT):
```
Project: job-finder-prod  ❌ Does not exist
Functions: https://us-central1-job-finder-prod.cloudfunctions.net  ❌ Wrong URL
Auth Domain: job-finder.joshwentworth.com
```

**Actual Deployment** (from Worker A's documentation):
```
Project: static-sites-257923  ✅ Actual project
Functions: https://us-central1-static-sites-257923.cloudfunctions.net  ✅ Correct URL
Function Suffix: No suffix for production (NOT -staging, NOT -production)
Hosting: https://job-finder-production.web.app (origin)
Hosting: https://job-finder.joshwentworth.com (Cloudflare front door)
```

**Expected Function Endpoints** (production naming):
- `manageJobQueue` (no suffix)
- `manageGenerator` (no suffix)
- `manageExperience` (no suffix)
- `manageContentItems` (no suffix)
- `contact-form` (no suffix)

| Component | Current Config | Actual Deployment | Status |
|-----------|----------------|-------------------|--------|
| Firebase Project ID | `job-finder-prod` | `static-sites-257923` | ❌ MISMATCH |
| Functions Base URL | `us-central1-job-finder-prod.cloudfunctions.net` | `us-central1-static-sites-257923.cloudfunctions.net` | ❌ MISMATCH |
| Function Suffix | None | None (correct) | ⚠️ Config needs update |
| Auth Domain | `job-finder.joshwentworth.com` | ✅ Correct | ✅ CORRECT |
| Hosting URL | N/A | `job-finder-production.web.app` | ⏳ READY (not deployed) |

**Verdict**: ❌ **BROKEN** - All Cloud Function calls will fail because URLs point to non-existent project.

---

## Critical Issues Found

### Issue 1: Wrong Firebase Project References
**Severity**: 🔴 Critical
**Files Affected**: `.env.staging`, `.env.production`

**Problem**:
- `.env` files reference `job-finder-staging` and `job-finder-prod` projects
- Actual Firebase project is `static-sites-257923` (verified by Worker A)

**Evidence**:
- Worker A successfully deployed to `static-sites-257923` (see `FE_RECOVERY_COMPLETION_SUMMARY.md`)
- `.firebaserc` was corrected to use `static-sites-257923` in recent commit `43efd1b`
- `.env` files still reference old project IDs

**Impact**:
- ❌ All API calls fail with 404 or connection errors
- ❌ Cannot test staging/production features
- ❌ Deploy succeeds but app is non-functional

---

### Issue 2: Missing Function Suffix for Staging
**Severity**: 🔴 Critical
**Files Affected**: `src/config/api.ts`

**Problem**:
- Staging functions have `-staging` suffix: `manageJobQueue-staging`
- Production functions have NO suffix: `manageJobQueue`
- `api.ts` doesn't append suffixes

**Current Code**:
```typescript
// This doesn't add -staging suffix
manageJobQueue: `${BASE_URL}/manageJobQueue`
```

**Should Be**:
```typescript
// Staging mode
manageJobQueue: `${BASE_URL}/manageJobQueue${isStaging ? '-staging' : ''}`
```

**Impact**:
- ❌ Staging API calls hit non-existent endpoints
- ❌ Error: Function manageJobQueue does not exist

---

### Issue 3: Outdated .env.template
**Severity**: 🟡 Medium
**Files Affected**: `.env.template`

**Problem**:
- Template uses placeholder values that don't match actual structure
- Missing guidance on how to obtain real Firebase config
- Missing `VITE_USE_EMULATORS` and other dev-only vars

**Impact**:
- ⚠️ New developers can't set up environment correctly
- ⚠️ Unclear which variables are required vs optional

---

### Issue 4: Legacy Environment Variables
**Severity**: 🟢 Low
**Files Affected**: All `.env.*` files

**Problem**:
- Deprecated variables still present: `VITE_GENERATOR_API_URL`, etc.
- Not used by `src/config/api.ts` anymore
- Code comments say "deprecated - kept for backward compatibility"

**Impact**:
- ⚠️ Confusion about which variables to use
- ⚠️ Potential for using wrong URLs

---

## Recommended Fixes

### Fix 1: Update `.env.staging` (Immediate)

```env
# Staging environment variables
# Job Finder Frontend - Staging

# Firebase Configuration (static-sites-257923 project)
VITE_FIREBASE_API_KEY=AIzaSyAxzl0u55AkWKTKLjGJRX1pxtApS8yC39c
VITE_FIREBASE_AUTH_DOMAIN=job-finder-staging.joshwentworth.com
VITE_FIREBASE_PROJECT_ID=static-sites-257923
VITE_FIREBASE_STORAGE_BUCKET=static-sites-257923.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=789847666726
VITE_FIREBASE_APP_ID=1:789847666726:web:STAGING_APP_ID_HERE

# API Configuration (Cloud Functions - Staging)
VITE_API_BASE_URL=https://us-central1-static-sites-257923.cloudfunctions.net

# Firestore Database ID
VITE_FIRESTORE_DATABASE_ID=portfolio-staging

# Disable emulators in staging
VITE_USE_EMULATORS=false

# Build metadata
VITE_ENVIRONMENT=staging

# Analytics
VITE_ENABLE_ANALYTICS=true
```

### Fix 2: Update `.env.production` (Immediate)

```env
# Production environment variables
# Job Finder Frontend - Production

# Firebase Configuration (static-sites-257923 project)
VITE_FIREBASE_API_KEY=AIzaSyAxzl0u55AkWKTKLjGJRX1pxtApS8yC39c
VITE_FIREBASE_AUTH_DOMAIN=job-finder.joshwentworth.com
VITE_FIREBASE_PROJECT_ID=static-sites-257923
VITE_FIREBASE_STORAGE_BUCKET=static-sites-257923.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=789847666726
VITE_FIREBASE_APP_ID=1:789847666726:web:PRODUCTION_APP_ID_HERE

# API Configuration (Cloud Functions - Production)
VITE_API_BASE_URL=https://us-central1-static-sites-257923.cloudfunctions.net

# Firestore Database ID
VITE_FIRESTORE_DATABASE_ID=(default)

# Disable emulators in production
VITE_USE_EMULATORS=false

# Build metadata
VITE_ENVIRONMENT=production

# Analytics
VITE_ENABLE_ANALYTICS=true
```

### Fix 3: Update `src/config/api.ts` for Function Suffixes (Immediate)

```typescript
/**
 * Firebase Cloud Functions endpoints
 * Note: Staging functions have -staging suffix, production has none
 */
const functionSuffix = isStaging ? '-staging' : '';

export const api = {
  baseUrl: BASE_URL,

  functions: {
    manageGenerator: `${BASE_URL}/manageGenerator${functionSuffix}`,
    manageContentItems: `${BASE_URL}/manageContentItems${functionSuffix}`,
    handleContactForm: `${BASE_URL}/contact-form${functionSuffix}`,
    manageJobQueue: `${BASE_URL}/manageJobQueue${functionSuffix}`,
    manageSettings: `${BASE_URL}/manageSettings${functionSuffix}`,
    manageExperience: `${BASE_URL}/manageExperience${functionSuffix}`,
  },

  // ... rest unchanged
}
```

### Fix 4: Update `.env.template` (Important)

```env
# Firebase Configuration
# Get these values from Firebase Console > Project Settings > General > Your apps
VITE_FIREBASE_API_KEY=your_firebase_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your-domain.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id

# API Configuration
# For local dev with emulators, use localhost URLs
# For staging/production, this is auto-configured by src/config/api.ts
VITE_API_BASE_URL=http://localhost:5001/your-project-id/us-central1

# Firebase Emulator Configuration (development only)
VITE_USE_EMULATORS=true  # Set to true for local dev, false for staging/production
VITE_EMULATOR_HOST=localhost

# Firestore Database ID
VITE_FIRESTORE_DATABASE_ID=(default)

# Environment metadata
VITE_ENVIRONMENT=development

# Analytics
VITE_ENABLE_ANALYTICS=false  # Disable in development
```

---

## Next Steps

1. ✅ **Immediate**: Update `.env.staging` and `.env.production` with correct project ID
2. ✅ **Immediate**: Update `src/config/api.ts` to add function suffixes
3. ✅ **Important**: Update `.env.template` with better guidance
4. ⏭️ **Nice-to-have**: Remove deprecated legacy env vars
5. ⏭️ **Nice-to-have**: Add env validation script
6. ⏭️ **Documentation**: Create `docs/environment-troubleshooting.md`

---

## Testing Plan

After fixes are applied:

```bash
# 1. Test build with staging config
cp .env.staging .env
npm run build
# Inspect dist/assets/*.js for correct URLs

# 2. Test build with production config
cp .env.production .env
npm run build
# Inspect dist/assets/*.js for correct URLs

# 3. Verify function URLs in console
npm run dev
# Open browser console, check Network tab for API calls
# URLs should be: https://us-central1-static-sites-257923.cloudfunctions.net/manageJobQueue-staging

# 4. Preview staging build locally
cp .env.staging .env
npm run build
npm run preview
# Test job submission, document generation, etc.
```

---

## Success Criteria

- [x] Environment matrix created with all findings documented
- [ ] `.env.staging` updated with correct project ID and function URLs
- [ ] `.env.production` updated with correct project ID and function URLs
- [ ] `src/config/api.ts` updated to handle function suffixes
- [ ] `.env.template` updated with better guidance
- [ ] All API clients tested in preview mode
- [ ] Documentation created explaining environment setup

---

**Status**: Audit complete, fixes ready to implement
**Next**: Implement recommended fixes
