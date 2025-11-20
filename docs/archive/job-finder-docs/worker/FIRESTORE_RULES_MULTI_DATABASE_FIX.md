# Firestore Rules Multi-Database Deployment Fix

## Issue Summary

**Date:** 2025-10-27
**Environment:** Staging (job-finder-staging.joshwentworth.com)
**Root Cause:** Firestore security rules were not deployed to named databases

## Problem

The staging environment was completely broken with the following errors:

```
Failed to load job matches: FirebaseError: Missing or insufficient permissions
POST .../Firestore/Listen/channel ... 400 (Bad Request)
FIRESTORE (12.4.0) INTERNAL ASSERTION FAILED: Unexpected state
```

## Root Cause Analysis

### Architecture

- **Project:** `static-sites-257923` (shared for all environments)
- **Staging Database:** `portfolio-staging`
- **Production Database:** `portfolio`
- **No Default Database:** The project does NOT have a `(default)` database

### Configuration

The frontend was correctly configured to use named databases:

- `.env.staging` sets `VITE_FIRESTORE_DATABASE_ID=portfolio-staging`
- `.env.production` sets `VITE_FIRESTORE_DATABASE_ID=portfolio`

### The Issue

The original `firebase.json` only configured rules for the default database:

```json
"firestore": {
  "rules": "firestore.rules",
  "indexes": "firestore.indexes.json"
}
```

When running `firebase deploy --only firestore:rules`, Firebase only deploys to the default database. Since our project uses **named databases** (`portfolio-staging` and `portfolio`), the security rules were never deployed to them.

**Result:** All Firestore operations failed with permission errors because the named databases had no security rules.

## Solution

Updated `job-finder-BE/firebase.json` to explicitly configure rules for both named databases:

```json
"firestore": [
  {
    "database": "portfolio-staging",
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  {
    "database": "portfolio",
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  }
]
```

Then deployed the rules to both databases:

```bash
cd job-finder-BE
firebase deploy --only firestore:rules --project static-sites-257923
```

## Files Modified

- `/home/jdubz/Development/job-finder-app-manager/job-finder-BE/firebase.json`
  - Changed `firestore` from object to array of database configurations
  - Configured both `portfolio-staging` and `portfolio` databases
  - Removed `(default)` database (doesn't exist in this project)

## Deployment Commands

To deploy Firestore rules to all databases:

```bash
cd job-finder-BE
firebase deploy --only firestore:rules --project static-sites-257923
```

To deploy Firestore indexes to all databases:

```bash
cd job-finder-BE
firebase deploy --only firestore:indexes --project static-sites-257923
```

## Verification

1. Check that both databases exist:

```bash
firebase firestore:databases:list --project static-sites-257923
```

Expected output:

```
┌─────────────────────────────────────────────────────────────┐
│ Database Name                                               │
├─────────────────────────────────────────────────────────────┤
│ projects/static-sites-257923/databases/portfolio            │
├─────────────────────────────────────────────────────────────┤
│ projects/static-sites-257923/databases/portfolio-staging    │
└─────────────────────────────────────────────────────────────┘
```

2. Test the staging environment:
   - Visit https://job-finder-staging.joshwentworth.com
   - Log in with your credentials
   - Verify that job matches load without permission errors
   - Check browser console for any errors

3. Test the production environment:
   - Visit https://job-finder.joshwentworth.com
   - Log in with your credentials
   - Verify that job matches load without permission errors

## Prevention

**Important:** Whenever you update Firestore security rules, you MUST deploy to both databases:

```bash
# Always run this command to deploy to both staging and production databases
firebase deploy --only firestore:rules --project static-sites-257923
```

The `firebase.json` configuration now ensures that rules are deployed to both `portfolio-staging` and `portfolio` databases automatically.

## Related Documentation

- Architecture: `/docs/architecture/DATABASE_SCHEMA_REPORT.md`
- Staging Parity: `/docs/deployment/staging-parity-checklist.md`
- Firestore Setup: `/docs/deployment/FIRESTORE_SETUP_COMPLETE.md`

## Additional Context

- Firestore rules require authentication for all operations (see `job-finder-BE/firestore.rules`)
- All rules check `isAuthenticated()` which requires `request.auth != null`
- Without deployed rules, Firestore denies all operations by default
- This fix resolves the staging environment breakage reported on 2025-10-27
