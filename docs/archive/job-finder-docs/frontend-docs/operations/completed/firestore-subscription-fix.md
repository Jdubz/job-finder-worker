# Firestore Subscription Error Loop Fix

## Problem

The staging frontend was experiencing infinite error loops that froze the UI and eventually crashed the app. The logs showed:

1. **Permission Errors**: Multiple "Missing or insufficient permissions" errors for collections:
   - `job-finder-config/ai-prompts`
   - `job-matches`
   - `job-finder-config/personal-info`
   - `job-queue` (repeated 15+ times)

2. **Infinite Retry Loop**: Firestore subscriptions were retrying indefinitely after errors, causing:
   - UI freezes
   - Browser crashes
   - Hundreds of identical error messages

## Root Causes

### 1. Subscription Error Handling
The Firestore service's `subscribeToCollection` and `subscribeToDocument` methods had inadequate error handling:
- Errors were logged but the subscription wasn't terminated
- The `hasError` flag prevented multiple error callbacks but didn't stop Firestore's internal retry mechanism
- React components would re-render and potentially re-subscribe

### 2. Missing Firestore Rules Deployment
The Firestore security rules allowing public read access may not have been properly deployed to the `portfolio-staging` database.

## Solution

### 1. Fixed Subscription Error Handling

**FirestoreService.ts Changes**:
```typescript
// OLD: Error handler that didn't stop subscription
(error) => {
  if (unsubscribed) return
  if (!hasError) {
    hasError = true
    console.error(`Error...`, error)
    onError(error as Error)
  }
}

// NEW: Immediately unsubscribe on error to prevent retry loops
(error) => {
  if (unsubscribed || hasError) return
  
  hasError = true
  console.error(`Error...`, error)
  
  // Immediately unsubscribe on error to prevent retry loops
  if (unsubscribeFn) {
    unsubscribeFn()
  }
  
  onError(error as Error)
}
```

**Key Changes**:
- Store unsubscribe function reference early
- Call `unsubscribe()` immediately when error occurs
- This terminates Firestore's connection and prevents retries
- Applied to both `subscribeToCollection` and `subscribeToDocument`

### 2. Enhanced useFirestoreCollection Hook

**useFirestoreCollection.ts Changes**:
```typescript
// Added state to track subscription errors
const [hasSubscriptionError, setHasSubscriptionError] = useState(false)

useEffect(() => {
  // Don't re-subscribe if there's already an error
  if (!enabled || hasSubscriptionError) {
    setLoading(false)
    return
  }
  
  const unsubscribe = subscribeToCollection(
    collectionName,
    (newData) => {
      setData(newData)
      setLoading(false)
      setHasSubscriptionError(false) // Reset on success
    },
    (err) => {
      setError(err)
      setLoading(false)
      setHasSubscriptionError(true) // Prevent re-subscription
    },
    // ...
  )
}, [/* ... */, hasSubscriptionError])
```

**Key Changes**:
- Added `hasSubscriptionError` state flag
- Prevents re-subscription when an error has occurred
- Only the `refetch()` method can reset this flag
- Included in useEffect dependencies to react to error state changes

### 3. Deployed Firestore Rules

Executed:
```bash
cd job-finder-BE
firebase deploy --only firestore:rules --project static-sites-257923
```

This deployed the public read rules to both:
- `portfolio-staging` database
- `portfolio` (production) database

**Current Rules** (from firestore.rules):
```javascript
// All collections allow public read
function canRead() {
  return true;
}

match /job-queue/{queueId} {
  allow read: if canRead();
  // ... write rules for authenticated users
}

match /job-finder-config/{configId} {
  allow read: if canRead();
  // ... write rules for authenticated users
}

// ... similar for all collections
```

## Testing

All tests pass:
```bash
✅ npm run lint - passed
✅ npm run type-check - passed  
✅ npm test - 19 tests passed
```

## Deployment

Changes committed and pushed to staging:
```bash
git commit -m "fix: prevent infinite subscription error loops"
git push origin staging
```

GitHub Actions will:
1. Run lint, type-check, and tests
2. Build the application
3. Deploy to Firebase Hosting (staging)

## Expected Outcome

After deployment:
1. ✅ No infinite error loops
2. ✅ Subscriptions terminate cleanly on permission errors
3. ✅ UI remains responsive even with errors
4. ✅ Public read access works for unauthenticated users
5. ✅ Error messages appear once, not hundreds of times

## Verification Steps

1. Open staging site: https://staging.joshuawilliams.tech (or configured staging URL)
2. Open browser DevTools → Console
3. Navigate through pages that use Firestore subscriptions
4. Verify:
   - No repeated error messages
   - UI remains responsive
   - Data loads correctly (or shows single error if permissions truly denied)
   - No browser freezes or crashes

## Files Changed

- `src/services/firestore/FirestoreService.ts` - Fixed subscription error handling
- `src/hooks/useFirestoreCollection.ts` - Added error state tracking
- `job-finder-BE/firestore.rules` - Deployed to staging

## Related Issues

- Prevents regression of the DialogContent warning loop
- Fixes "client is offline" errors that cascade into infinite loops
- Addresses permission-denied errors freezing the UI

## Future Improvements

Consider:
1. Add exponential backoff for transient errors (network issues)
2. Distinguish between fatal errors (permissions) and retryable errors (network)
3. Add error boundary components to catch and display Firestore errors gracefully
4. Implement circuit breaker pattern for repeated failures
5. Add telemetry to track error frequencies and types
