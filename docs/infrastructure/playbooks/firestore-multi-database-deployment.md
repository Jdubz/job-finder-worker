# Firestore Rules Multi-Database Deployment

> Status: Active
> Owner: @jdubz
> Last Updated: 2025-11-25

## Architecture

- **Project:** `static-sites-257923` (shared for all environments)
- **Staging Database:** `portfolio-staging`
- **Production Database:** `portfolio`
- **No Default Database:** The project does NOT have a `(default)` database

## Configuration

The frontend is correctly configured to use named databases:

- `.env.staging` sets `VITE_FIRESTORE_DATABASE_ID=portfolio-staging`
- `.env.production` sets `VITE_FIRESTORE_DATABASE_ID=portfolio`

## Multi-Database Configuration

The `firebase.json` must explicitly configure rules for both named databases:

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

**Important:** When running `firebase deploy --only firestore:rules`, Firebase only deploys to the default database. Since this project uses **named databases** (`portfolio-staging` and `portfolio`), the security rules must be explicitly configured for each database.

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

The `firebase.json` configuration ensures that rules are deployed to both `portfolio-staging` and `portfolio` databases automatically.

## Additional Context

- Firestore rules require authentication for all operations (see `job-finder-BE/firestore.rules`)
- All rules check `isAuthenticated()` which requires `request.auth != null`
- Without deployed rules, Firestore denies all operations by default
