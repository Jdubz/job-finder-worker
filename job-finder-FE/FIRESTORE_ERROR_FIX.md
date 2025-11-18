# Firestore Error Comprehensive Fix

## Issues Identified

### 1. FIRESTORE INTERNAL ASSERTION FAILED (ID: b815, ca9)
**Root Cause:** Firestore SDK 12.4.0 has known issues with deprecated `enableMultiTabIndexedDbPersistence()` API causing internal state assertion failures.

**Symptoms:**
- `Unexpected state (ID: b815)` errors
- `Unexpected state (ID: ca9)` errors  
- Page crashes and continuous flashing
- Navigation blocked

**Fix Applied:**
- Migrated from deprecated `getFirestore()` + `enableMultiTabIndexedDbPersistence()` to modern `initializeFirestore()` with `persistentLocalCache()` API
- This eliminates the internal state assertion errors

### 2. Missing or Insufficient Permissions
**Root Cause:** Firestore security rules not deployed to both databases (`portfolio` and `portfolio-staging`)

**Symptoms:**
- `Missing or insufficient permissions` errors
- Empty data on Settings page
- Job matches not loading

**Fix Applied:**
- Deployed updated Firestore rules to both `portfolio` and `portfolio-staging` databases
- Rules allow all authenticated users to access all collections (single-owner system)

### 3. Database Mismatch (400 Bad Request)
**Root Cause:** Frontend trying to connect to wrong database (default `(default)` instead of `portfolio`)

**Symptoms:**
- 400 Bad Request errors on Firestore Listen channel
- WebChannel transport errors
- Firestore connection failures

**Fix Applied:**
- Ensured `VITE_FIRESTORE_DATABASE_ID` is set to `portfolio` in staging environment
- Updated firebase.ts to always use `portfolio` as default if not specified
- Changed condition to exclude "(default)" from databaseId parameter

### 4. Subscription Memory Leaks
**Root Cause:** Firestore subscriptions continuing to fire callbacks after unsubscribe, causing:
- Multiple error handlers firing
- State updates on unmounted components
- Error loops

**Fix Applied:**
- Added `unsubscribed` flag to prevent callbacks after unsubscribe
- Wrapped `onSnapshot` unsubscribe function to set flag before calling original unsubscribe
- Prevents "Unexpected state" errors from callbacks racing with cleanup

## Code Changes

### 1. firebase.ts - Modern Persistence API
```typescript
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore"

const databaseId = import.meta.env.VITE_FIRESTORE_DATABASE_ID || "portfolio"

export const db: Firestore = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
  ...(databaseId !== "(default)" && { databaseId }),
})
```

### 2. FirestoreService.ts - Subscription Cleanup
```typescript
subscribeToCollection<K extends keyof CollectionTypeMap>(
  // ... params
): UnsubscribeFn {
  // ... setup
  let unsubscribed = false
  
  const unsubscribe = onSnapshot(q, 
    (snapshot) => {
      if (unsubscribed) return // Prevent callbacks after unsubscribe
      // ... handle data
    },
    (error) => {
      if (unsubscribed) return // Prevent error handlers after unsubscribe
      // ... handle error
    }
  )
  
  return () => {
    unsubscribed = true
    unsubscribe()
  }
}
```

## Environment Configuration

### Staging (.env.staging)
```bash
VITE_FIRESTORE_DATABASE_ID=portfolio
VITE_FIREBASE_PROJECT_ID=static-sites-257923
```

### Production (.env.production)  
```bash
VITE_FIRESTORE_DATABASE_ID=portfolio
VITE_FIREBASE_PROJECT_ID=static-sites-257923
```

## Deployment Checklist

- [x] Updated firebase.ts with modern persistence API
- [x] Fixed subscription cleanup in FirestoreService.ts
- [x] Deployed Firestore rules to both databases
- [x] Verified VITE_FIRESTORE_DATABASE_ID in environment configs
- [ ] Test staging deployment
- [ ] Monitor for errors in staging
- [ ] Deploy to production
- [ ] Monitor for errors in production

## Testing

### Verify Fixes Work:
1. **Check no internal assertion errors:**
   - Open staging site
   - Navigate between pages
   - Should not see "INTERNAL ASSERTION FAILED" errors

2. **Check permissions work:**
   - Login to staging
   - Visit Settings page
   - Should load personal info without permission errors

3. **Check database connection:**
   - Open Network tab
   - Should see requests to `portfolio` database, not `(default)`
   - Should not see 400 errors on Firestore Listen channel

4. **Check subscription cleanup:**
   - Navigate between pages rapidly
   - Should not see error loops
   - Should not see callbacks firing after component unmount

## Monitoring

### Key Metrics to Watch:
- Firestore Listen channel errors (should be 0)
- Permission denied errors (should be 0)  
- Internal assertion errors (should be 0)
- User reports of flashing/crashing pages (should be 0)

### Rollback Plan:
If errors persist:
1. Revert firebase.ts changes
2. Revert FirestoreService.ts changes  
3. Investigate further with Firebase support

## Additional Notes

### Why Modern Cache API?
The deprecated `enableMultiTabIndexedDbPersistence()` has known issues in Firestore SDK 12.x:
- Internal state machine bugs
- Race conditions during cleanup
- Incompatibility with newer Firebase features

The modern `persistentLocalCache()` API:
- Fixes these issues
- Better multi-tab coordination
- More reliable state management
- Recommended by Firebase team

### Why Single-Owner Model?
The application is designed for a single owner (the developer):
- All authenticated users can try features
- No user-specific data isolation needed
- Simplifies permission model
- All rules check `isAuthenticated()` only

## References
- [Firebase Firestore Persistence Docs](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
- [Firestore Security Rules Guide](https://firebase.google.com/docs/firestore/security/get-started)
- [Firestore SDK Release Notes](https://firebase.google.com/support/release-notes/js)
