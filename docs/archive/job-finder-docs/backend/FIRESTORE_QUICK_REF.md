# Firestore Fixes - Quick Reference

## Problem

`FIRESTORE (12.4.0) INTERNAL ASSERTION FAILED: Unexpected state`

## Root Causes

1. **Subscription race conditions** - Multiple components unsubscribing simultaneously
2. **No offline persistence** - State corruption on reconnection
3. **Missing indexes** - Incomplete query optimization
4. **Poor error handling** - Unhandled exceptions in cleanup

## Solutions Applied

### 1. Reference Counting (FirestoreContext)

```typescript
// Before: No-op unsubscribe causing race conditions
return () => {
  /* Don't actually unsubscribe */
};

// After: Reference-counted cleanup
cached.subscriberCount++;
return () => {
  entry.subscriberCount--;
  if (entry.subscriberCount <= 0) {
    try {
      entry.unsubscribe();
    } catch (e) {
      console.warn(e);
    }
  }
};
```

### 2. Offline Persistence (firebase.ts)

```typescript
// Added IndexedDB persistence with multi-tab support
enableMultiTabIndexedDbPersistence(db).catch(handleError);
```

### 3. Additional Indexes (firestore.indexes.json)

- job-queue: status + created_at
- job-queue: created_at alone
- content-items: userId + createdAt
- content-items: userId + updatedAt
- experiences: userId + startDate

## Deployment Commands

```bash
# 1. Verify fixes
cd job-finder-BE
./verify-firestore-fixes.sh

# 2. Deploy Firestore config
./deploy-firestore-config.sh

# 3. Build frontend
cd ../job-finder-FE
npm run build

# 4. Deploy to staging
npm run deploy:staging

# 5. Monitor indexes (wait 5-15 min for build)
cd ../job-finder-BE
./monitor-firestore.sh

# 6. Deploy to production (after testing)
cd ../job-finder-FE
npm run deploy:production
```

## Testing Checklist

- [ ] No Firestore errors in console
- [ ] Collections load on page load
- [ ] Real-time updates work
- [ ] Multiple components can subscribe
- [ ] Component unmount doesn't error
- [ ] Page refresh works
- [ ] Offline mode works (airplane test)
- [ ] Multiple tabs work

## Monitoring

### Browser Console

```javascript
// Should NOT see:
"FIRESTORE INTERNAL ASSERTION FAILED";
"Unexpected state";

// Should see (optional debug):
"Connected to Firebase";
"Firestore subscription created";
```

### Firebase Console

- Check indexes: https://console.firebase.google.com/project/static-sites-257923/firestore/indexes
- Check usage: https://console.firebase.google.com/project/static-sites-257923/usage

## Rollback

If issues persist:

```bash
cd job-finder-FE
git revert HEAD
npm run build
npm run deploy:production
```

## Files Changed

- `job-finder-FE/src/services/firestore/types.ts` - Added subscriberCount
- `job-finder-FE/src/contexts/FirestoreContext.tsx` - Reference counting
- `job-finder-FE/src/config/firebase.ts` - Offline persistence
- `job-finder-BE/firestore.indexes.json` - 5 new indexes

## Success Indicators

✅ No "INTERNAL ASSERTION FAILED" errors
✅ Smooth real-time updates
✅ Offline support works
✅ Multiple tabs don't conflict
✅ Fast query performance

## Support

See detailed documentation: `FIRESTORE_FIXES_SUMMARY.md`
