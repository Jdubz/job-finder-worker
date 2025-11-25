# Firestore Monitoring Quick Reference

> Status: Active
> Owner: @jdubz
> Last Updated: 2025-11-25

## What to Monitor

### 1. Console Errors (Chrome DevTools)

**Check For:**

- ❌ `FIRESTORE INTERNAL ASSERTION FAILED`
- ❌ `Unexpected state (ID: b815)`
- ❌ `Unexpected state (ID: ca9)`
- ❌ `Missing or insufficient permissions`
- ❌ `400 Bad Request` on Firestore Listen channel

**Expected:**

- ✅ No assertion errors
- ✅ No permission errors
- ✅ All Firestore requests return 200 OK

### 2. Network Tab

**Check URL Pattern:**

```
https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel?
database=projects%2Fstatic-sites-257923%2Fdatabases%2Fportfolio
```

**Verify:**

- ✅ Database is `portfolio` (or `portfolio-staging`)
- ✅ NOT `(default)` database
- ✅ Status codes are 200
- ✅ No 400 errors

### 3. Application Behavior

**Check:**

- ✅ Pages load without crashing
- ✅ No continuous flashing/reloading
- ✅ Smooth navigation between pages
- ✅ Settings page loads personal info
- ✅ Job matches display correctly
- ✅ No error boundary screens

## Quick Tests

### Test 1: Settings Page

1. Navigate to `/settings`
2. Should load personal info without errors
3. Console should be clean

### Test 2: Navigation

1. Rapidly navigate between pages
2. Should not see errors or crashes
3. No infinite loops

### Test 3: Job Matches

1. Navigate to job matches page
2. Should load data without permission errors
3. Should display matches correctly

## Error Recovery

### If You See Assertion Errors:

1. Clear browser cache and reload
2. Check browser console for full error stack
3. Verify environment variables are correct
4. Check Firebase console for database status

### If You See Permission Errors:

1. Check Firebase console: Firestore > Rules
2. Verify rules are deployed to correct database
3. Check user is authenticated
4. Verify database ID matches environment config

### If You See 400 Errors:

1. Check Network tab for database parameter
2. Verify `VITE_FIRESTORE_DATABASE_ID` is set correctly
3. Clear browser cache
4. Hard reload (Ctrl+Shift+R)

## Environment Variables

### Staging

```bash
VITE_FIRESTORE_DATABASE_ID=portfolio-staging
VITE_FIREBASE_PROJECT_ID=static-sites-257923
```

### Production

```bash
VITE_FIRESTORE_DATABASE_ID=portfolio
VITE_FIREBASE_PROJECT_ID=static-sites-257923
```

## Firebase Console Checks

### 1. Check Database

- Go to: https://console.firebase.google.com/project/static-sites-257923/firestore
- Verify databases exist:
  - `portfolio` (production)
  - `portfolio-staging` (staging)

### 2. Check Rules

- Click on "Rules" tab
- Select database from dropdown
- Verify rules match `firestore.rules` file
- Check last deployment date

### 3. Check Indexes

- Click on "Indexes" tab
- Verify all indexes are built (not "Building")
- Check for any errors

## Success Indicators

✅ **Clean Console**

- No red errors
- Only expected warnings (e.g., Headless UI descriptions)

✅ **Correct Database**

- Network requests go to `portfolio` or `portfolio-staging`
- No requests to `(default)` database

✅ **Fast Loading**

- Pages load quickly
- No retry loops
- Smooth transitions

✅ **No Crashes**

- Can navigate freely
- No error boundaries
- No flashing screens

## Rollback Commands

If issues persist:

```bash
# Frontend rollback
cd job-finder-FE
git reset --hard c059926  # Previous working commit
git push origin staging --force

# Firestore rules rollback (if needed)
cd job-finder-BE
git checkout HEAD~1 -- firestore.rules
firebase deploy --only firestore:rules
```
