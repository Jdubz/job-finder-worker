# Firestore Rules Deployment - Multi-Database Fix

**Date:** 2025-10-27
**Issue:** Permission errors on staging Document Builder page
**Status:** ✅ RESOLVED

## Problem

The staging environment was throwing permission errors:

```
Failed to load job matches: FirebaseError: Missing or insufficient permissions.
POST .../Firestore/Listen/channel ... 400 (Bad Request)
```

## Root Cause

Firestore rules were not properly deployed to the named databases (`portfolio-staging` and `portfolio`). The project uses multiple named databases, not the default `(default)` database.

## Solution

Deploy rules to specific named databases using:

```bash
# Deploy to staging database
firebase deploy --only firestore:portfolio-staging --project=static-sites-257923

# Deploy to production database
firebase deploy --only firestore:portfolio --project=static-sites-257923
```

## Configuration

The `firebase.json` file correctly configures both databases:

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

## Key Learnings

1. **Named databases require specific deployment**: Use `firebase deploy --only firestore:<databaseId>` for named databases
2. **Generic deploy doesn't work**: `firebase deploy --only firestore:rules` doesn't deploy to named databases properly
3. **Each database needs separate deployment**: Must deploy rules to each named database individually

## Verification

After deployment, both databases show:

- ✅ Rules compiled successfully
- ✅ Indexes deployed successfully
- ✅ Rules released to cloud.firestore

## Testing

To verify the fix works:

1. Visit staging: https://job-finder-staging.joshwentworth.com
2. Sign in with your account
3. Navigate to Document Builder page
4. Verify job matches load without permission errors

## Future Deployments

When updating Firestore rules in the future, always deploy to both databases:

```bash
cd job-finder-BE

# Deploy to staging
firebase deploy --only firestore:portfolio-staging --project=static-sites-257923

# Deploy to production
firebase deploy --only firestore:portfolio --project=static-sites-257923
```

Or deploy to both at once:

```bash
firebase deploy --only firestore --project=static-sites-257923
```

## References

- Firebase docs: https://firebase.google.com/docs/firestore/manage-databases
- Web search: Firebase deploy firestore rules multiple databases
- Local docs: `/home/jdubz/Development/job-finder-app-manager/STAGING_PERMISSION_ERROR_ANALYSIS.md`
