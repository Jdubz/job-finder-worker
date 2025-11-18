# Staging Permission Error - Root Cause Analysis

**Date:** 2025-10-27
**Environment:** Staging (job-finder-staging.joshwentworth.com)
**Status:** ROOT CAUSE IDENTIFIED

## Issue Summary

Staging environment completely broken with errors:

```
Failed to load job matches: FirebaseError: Missing or insufficient permissions
POST .../Firestore/Listen/channel ... 400 (Bad Request)
FIRESTORE (12.4.0) INTERNAL ASSERTION FAILED: Unexpected state
```

## Root Causes Identified

### 1. Firestore Rules Not Deployed to Named Databases (FIXED)

**Problem**: Firestore security rules were only deployed to default database, but the project uses named databases (`portfolio-staging`, `portfolio`).

**Solution Applied**:

- Updated `job-finder-BE/firebase.json` to configure rules for both named databases
- Deployed rules successfully

**Files Modified**:

- `/home/jdubz/Development/job-finder-app-manager/job-finder-BE/firebase.json`
- Created `/home/jdubz/Development/job-finder-app-manager/FIRESTORE_RULES_MULTI_DATABASE_FIX.md`

**Status**: ✅ FIXED - Rules now deployed to both databases

### 2. User Not Authenticated or Missing Custom Claims (ONGOING)

**Problem**: Even after deploying rules, user gets permission errors because:

1. User might not be authenticated properly
2. User doesn't have Firebase Auth custom claims set
3. Firestore rules require `request.auth.token.role` to be set

**Current Architecture Issue**:

- Firestore rules require authentication + role checks
- Roles must be set via custom claims: `npm run script:set-claims`
- Custom claims don't persist in emulator across restarts
- User IDs change between environments, breaking everything

**Example from `firestore.rules:200-202`**:

```javascript
match /job-matches/{matchId} {
  allow read: if isAuthenticated();  // ✓ User is authenticated
  // But rules also check role for other operations
}
```

### 3. Fundamental Architecture Mismatch (CRITICAL)

**The Real Problem**: The entire application is designed for multi-user with ownership tracking, but the actual use case is:

- **ONE owner** (you)
- **Multiple viewers** (for demo purposes)
- **No need for user ownership tracking**
- **User IDs change during development**, breaking queries

**Evidence**:

- 83+ files contain user ownership tracking (`submittedBy`, `userId`)
- Every query filters by user: `where("submittedBy", "==", userId)`
- Complex role system (viewer/editor/admin) with custom claims
- DocumentHistoryPage redundant (you have admin pages)
- Personal info stored per-user (but only one user exists)

**Impact**:

```typescript
// Every query looks like this
const matches = await jobMatchesClient.getMatches(user.uid, filters);
// → where("submittedBy", "==", userId)

// But user.uid changes between environments:
// Local: "demo-user-123"
// Staging: "AbCdEfGh123456"  ← Different!
// Production: "XyZ987654321"    ← Different again!

// Result: Queries return NO DATA
```

## Comprehensive Solution Created

**Document**: `/home/jdubz/Development/job-finder-app-manager/docs/plans/AUTH_PERMISSIONS_REDESIGN.md`

### Key Changes Proposed:

1. **Remove All User Ownership Tracking**
   - Remove `submittedBy`, `userId` fields from collections
   - Remove user filtering from all queries
   - Single set of data (owner's data)

2. **Simplify Firestore Rules**
   - All authenticated users can read everything
   - Limited writes for specific collections
   - Optional `isOwner()` check for admin pages only

3. **Simplify Authentication**
   - Remove viewer/editor/admin role system
   - Add simple `isOwner` flag (email check)
   - No custom claims needed

4. **Remove Redundant Features**
   - Delete DocumentHistoryPage (redundant with admin pages)
   - Consolidate personal-info to single document
   - Simplify navigation based on isOwner

5. **Fix Development Pain**
   - Data works across local/staging/production
   - No more user ID changes breaking things
   - Consistent experience in all environments

### Implementation Phases:

**Phase 1: Critical Fixes (THIS WEEK)**

- Update Firestore rules (simplify to `isAuthenticated()` only)
- Remove user filtering from frontend queries
- Fix staging environment immediately

**Phase 2-3: Cleanup (NEXT WEEK)**

- Remove DocumentHistoryPage
- Simplify AuthContext
- Update navigation

**Phase 4-8: Full Migration (AS NEEDED)**

- Backend cleanup
- Database migration
- Documentation updates
- Comprehensive testing

## Immediate Action Required

To fix staging NOW, you can do ONE of two things:

### Option 1: Set Custom Claims for Your User (Quick Fix)

```bash
# Get your user ID from staging
# Then run:
cd job-finder-BE
npm run script:set-claims -- <YOUR_USER_ID> editor staging

# Then in browser, force token refresh:
# Open dev console and run:
firebase.auth().currentUser.getIdToken(true)
```

**Downside**: Temporary fix, doesn't solve fundamental architecture issue.

### Option 2: Implement Phase 1 of AUTH_PERMISSIONS_REDESIGN (Permanent Fix)

This is recommended as it solves the root cause permanently.

**Steps**:

1. Update `job-finder-BE/firestore.rules` (remove role checks)
2. Deploy rules: `firebase deploy --only firestore:rules`
3. Update `job-finder-FE/src/api/job-matches-client.ts` (remove user filtering)
4. Test staging

**Estimated Time**: 2-4 hours
**Benefits**: Permanent fix, simpler architecture, works across all environments

## Decision Point

Choose your path:

### Path A: Quick Fix (15 minutes)

- Set custom claims for staging user
- Continue with current architecture
- **Problem**: Will break again on next user ID change

### Path B: Proper Fix (2-4 hours today)

- Implement Phase 1 of redesign plan
- Fix architecture fundamentally
- **Benefit**: Never have this problem again

### Path C: Hybrid (30 minutes + planned work)

- Quick fix for staging NOW
- Plan Phase 1 implementation for this week
- **Benefit**: Staging works immediately, proper fix soon

## Recommendation

**Go with Path B (Proper Fix)**

**Reasoning**:

1. You've already spent time diagnosing this issue
2. The fix addresses a fundamental architectural problem
3. Will prevent future issues in all environments
4. Makes development easier going forward
5. Simplifies codebase significantly (83+ files affected)
6. Only 2-4 hours of work for permanent solution

**Next Steps**:

1. Review `docs/plans/AUTH_PERMISSIONS_REDESIGN.md`
2. Approve Phase 1 implementation
3. I'll implement the changes
4. Test in staging
5. Document the new architecture

## Questions?

- Want me to implement Phase 1 now?
- Need clarification on any part of the redesign plan?
- Want to go with quick fix instead?

Let me know how you'd like to proceed!
