# Configuration Validation System

## Problem This Solves

**The staging environment keeps getting deployed with the wrong database configuration**, causing 400 errors because it tries to connect to `(default)` database which doesn't exist in our project.

## Solution

Automated config validation tests that run **before every build** to ensure:
- ✅ Correct database is selected (never `(default)`)
- ✅ Staging builds use `portfolio-staging` database
- ✅ Production builds use `portfolio` database  
- ✅ All required environment variables are set
- ✅ Firebase project ID is correct

## How It Works

### 1. Pre-Build Validation

All build commands now run `npm run validate:config` first:

```bash
npm run build:staging    # Validates staging config, then builds
npm run build:production # Validates production config, then builds
```

**If config is wrong, the build will FAIL with clear error messages.**

### 2. Test File

`src/__tests__/config-validation.test.ts` contains comprehensive checks:

- ✅ Required env vars exist
- ✅ Database ID is set and not `(default)`
- ✅ Environment-specific database names
- ✅ Firebase project ID matches
- ✅ API URLs are correct
- ✅ Logs current config for debugging

### 3. Build Integration

Updated `package.json` scripts:

```json
{
  "build:staging": "npm run validate:config && tsc -b && vite build --mode staging",
  "build:production": "npm run validate:config && tsc -b && vite build --mode production",
  "validate:config": "vitest run src/__tests__/config-validation.test.ts --reporter=verbose"
}
```

## Example Error Messages

### Missing Database ID

```
❌ CRITICAL: VITE_FIRESTORE_DATABASE_ID is not set! 
This will cause 400 errors in production.
```

### Wrong Database for Staging

```
❌ STAGING BUILD ERROR: Must use 'portfolio-staging' database
Expected: "portfolio-staging"
Received: "(default)"
```

### Wrong Database for Production

```
❌ PRODUCTION BUILD ERROR: Must use 'portfolio' database
Expected: "portfolio"
Received: "portfolio-staging"
```

## Running Validation Manually

```bash
# Run config validation tests
npm run validate:config

# See current configuration
npm run validate:config 2>&1 | grep "=== Current"
```

## Environment Files

Make sure you have correct `.env` files:

### `.env.staging`
```env
VITE_FIRESTORE_DATABASE_ID=portfolio-staging
VITE_FIREBASE_PROJECT_ID=static-sites-257923
VITE_API_BASE_URL=https://us-central1-static-sites-257923.cloudfunctions.net
```

### `.env.production`
```env
VITE_FIRESTORE_DATABASE_ID=portfolio
VITE_FIREBASE_PROJECT_ID=static-sites-257923
VITE_API_BASE_URL=https://us-central1-static-sites-257923.cloudfunctions.net
```

## CI/CD Integration

The validation automatically runs in CI/CD pipelines because it's part of the build command.

**Build will fail if config is wrong**, preventing bad deployments.

## Testing

The validation tests work in all environments:

- ✅ `test` mode: Uses demo Firebase config (skips production checks)
- ✅ `staging` mode: Validates staging-specific config
- ✅ `production` mode: Validates production-specific config

## Troubleshooting

### Build fails with "database must be portfolio-staging"

**Solution:** You're building for staging with wrong env vars.

```bash
# Make sure .env.staging exists and has:
VITE_FIRESTORE_DATABASE_ID=portfolio-staging
```

### Build fails with "VITE_FIRESTORE_DATABASE_ID is not set"

**Solution:** Environment variable not loaded.

```bash
# Check .env file exists
ls -la .env.staging

# Make sure MODE matches your build command
# staging build → .env.staging
# production build → .env.production
```

### Tests pass locally but fail in CI

**Solution:** CI environment might not have `.env` files.

Make sure your deployment pipeline sets environment variables correctly.

## Related Documentation

- Firebase Multi-Database Setup: `/FIRESTORE_RULES_MULTI_DATABASE_FIX.md`
- Environment Configuration: `/.env.example`
- Staging Deployment: `/docs/deployment/staging-parity-checklist.md`

## Implementation Date

**2025-10-28** - Added to prevent recurring 400 database errors in staging
