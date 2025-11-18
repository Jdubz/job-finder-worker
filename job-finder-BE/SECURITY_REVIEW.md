# Job Finder Security Architecture Review

## Executive Summary

**CRITICAL ISSUE IDENTIFIED**: The authentication flow has a fundamental misconfiguration between how user roles are stored vs. how they're validated.

### The Problem

There's a disconnect between three security layers:

1. **Backend Cloud Functions** (auth.middleware.ts) - Checks `decodedToken.role` (Firebase Auth custom claims)
2. **Firestore Rules** (firestore.rules) - Checks `request.auth.token.role` (Firebase Auth custom claims)
3. **User Role Scripts** (add-editor-role.ts) - Sets `role` in Firestore `users` collection (NOT custom claims)

**Result**: Users cannot access protected endpoints even after "adding editor role" because:
- The script adds role to Firestore documents
- The middleware/rules check Firebase Auth custom claims
- These are two completely different systems

---

## Security Architecture

### Layer 1: Firebase Authentication (Frontend)

**Location**: `job-finder-FE/src/config/firebase.ts`

**Configuration**:
```typescript
VITE_USE_EMULATORS=true
Auth Emulator: localhost:9099
Firestore Emulator: localhost:8080
```

**Token Flow**:
1. User signs in via Firebase Auth
2. Frontend calls `auth.currentUser.getIdToken()` (base-client.ts:64)
3. Token sent as `Authorization: Bearer <token>` header

**Status**: ✅ Properly configured

---

### Layer 2: Cloud Functions Auth Middleware

**Location**: `job-finder-BE/functions/src/middleware/auth.middleware.ts`

**Validation Steps**:
1. Extract Bearer token from Authorization header
2. Verify token with `admin.auth().verifyIdToken(idToken)` (line 105, 279)
3. Check `decodedToken.role === 'editor' || 'admin'` (line 47)
4. Verify email is verified (line 154)

**Endpoints Using Auth**:
- `manageContentItems` - `verifyAuthenticatedEditor` ✅
- `manageExperience` - `verifyAuthenticatedEditor` ✅
- `manageGenerator` - `verifyAuthenticatedEditor` ✅
- `manageJobQueue` - `verifyAuthenticatedUser` (line 879), `verifyAuthenticatedEditor` (line 913) ✅
- `resumeUpload` - `verifyAuthenticatedEditor` ✅

**Status**: ✅ Properly implemented

---

### Layer 3: Firestore Security Rules

**Location**: `job-finder-BE/firestore.rules`

**Role Requirements**:

```javascript
function isEditor() {
  return isAuthenticated() &&
         request.auth.token.role == 'editor';
}

function isAdmin() {
  return isAuthenticated() &&
         request.auth.token.role == 'admin';
}

function isAnyRole() {
  return isAuthenticated() &&
         request.auth.token.role in ['viewer', 'editor', 'admin'];
}
```

**Collection Security**:

| Collection | Read | Write | Notes |
|------------|------|-------|-------|
| `job-queue` | Owner/Admin | Owner (pending only) | ✅ |
| `generator-documents` | Owner | Editor (own docs) | ✅ |
| `content-items` | Owner | Editor (own items) | ✅ |
| `experiences` | Owner | Editor (own items) | ✅ |
| `personal-info` | Owner | Editor (own info) | ✅ |
| `user-profiles` | Owner | Authenticated (create) | ✅ |
| `job-matches` | Owner (any role) | Service account only | ✅ |
| `companies` | Authenticated | Admin only | ✅ |
| `job-sources` | Authenticated | Admin only | ✅ |

**Default**: Deny all (line 257) ✅

**Status**: ✅ Rules are correct, but rely on custom claims that aren't being set

---

## THE CRITICAL BUG

### Current Role Assignment Script

**Location**: `job-finder-BE/scripts/users/add-editor-role.ts`

**What it does** (WRONG):
```typescript
// Line 146 - Updates Firestore document
await userRef.update({
  role: 'editor',
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
});
```

This updates the `/users/{userId}` document in Firestore.

**What it SHOULD do**:
```typescript
// Set Firebase Auth custom claims
await admin.auth().setCustomUserClaims(userId, {
  role: 'editor'
});
```

This sets custom claims on the Firebase Authentication user token.

### Impact

1. **All authenticated requests fail** with `403 Forbidden - editor role required`
2. **All Firestore access fails** with permission denied (rules check `request.auth.token.role`)
3. **Users appear to have roles** in Firestore but tokens don't include them

---

## Solution

### Fix 1: Update Role Assignment Script

**Create**: `job-finder-BE/scripts/users/set-custom-claims.ts`

```typescript
#!/usr/bin/env ts-node

import * as admin from 'firebase-admin';

async function setCustomClaims(userId: string, role: 'viewer' | 'editor' | 'admin') {
  // Set custom claims on Firebase Auth token
  await admin.auth().setCustomUserClaims(userId, { role });

  console.log(`✅ Custom claims set for user ${userId}`);
  console.log(`   Role: ${role}`);

  // Also update Firestore for UI display (optional)
  await admin.firestore().collection('users').doc(userId).update({
    role,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  console.log('📄 Firestore document updated');
  console.log('');
  console.log('⚠️  User must sign out and sign back in for claims to take effect');
}
```

### Fix 2: Token Refresh Required

After setting custom claims, users MUST:
1. Sign out
2. Sign back in (to get new token with updated claims)

OR implement force token refresh:

```typescript
// Frontend: Force token refresh
await auth.currentUser.getIdToken(true); // true = force refresh
```

### Fix 3: Emulator Considerations

**Important**: Firebase Auth Emulator **DOES NOT persist custom claims** between restarts.

For local development, you need to:

1. **Option A**: Set claims on every emulator startup
2. **Option B**: Create test users with claims already set
3. **Option C**: Mock auth in emulator (disable claim checks)

---

## Recommended Actions

### Immediate (Critical)

1. ✅ **Create new script**: `set-custom-claims.ts` that uses `admin.auth().setCustomUserClaims()`
2. ✅ **Add package script**: `"script:set-claims": "ts-node scripts/users/set-custom-claims.ts"`
3. ✅ **Run for existing users**: Set claims for all users who need access
4. ✅ **Update documentation**: Clarify difference between Firestore roles and custom claims

### Short Term

1. ⚠️ **Add claim verification endpoint**: Create `/api/auth/verify` to check current claims
2. ⚠️ **Frontend error handling**: Better messaging when auth fails (show role requirement)
3. ⚠️ **Development setup script**: Auto-set claims for test users in emulator
4. ⚠️ **Admin UI**: Create interface to manage user claims (safer than scripts)

### Long Term

1. 📊 **Audit logging**: Log all role changes
2. 📊 **Role management service**: Centralized API for role assignment
3. 📊 **Automated testing**: Test auth flow with different roles
4. 📊 **Documentation**: Comprehensive security architecture docs

---

## Testing Checklist

### Verify Auth Flow

1. **Create test user**:
```bash
# In Firebase Auth Emulator UI (http://localhost:4000/auth)
Email: test@example.com
Password: test123
```

2. **Set custom claims**:
```bash
cd job-finder-BE
npm run script:set-claims -- <USER_ID> editor local
```

3. **Sign in to frontend**:
```typescript
import { signInWithEmailAndPassword } from 'firebase/auth';
await signInWithEmailAndPassword(auth, 'test@example.com', 'test123');
```

4. **Get token and verify claims**:
```typescript
const user = auth.currentUser;
const token = await user.getIdToken();
console.log('Token:', token);

// Decode to see claims (use jwt.io or):
const decodedToken = JSON.parse(atob(token.split('.')[1]));
console.log('Claims:', decodedToken);
// Should see: { role: 'editor', ... }
```

5. **Test protected endpoint**:
```typescript
// Should succeed now
await generatorClient.getUserDefaults();
```

### Verify Firestore Rules

1. **Try to read own content** (should succeed):
```typescript
const contentRef = doc(db, 'content-items', 'item-id');
const contentDoc = await getDoc(contentRef);
```

2. **Try to read other user's content** (should fail):
```typescript
// Should get permission denied
```

3. **Try to write to job-matches** (should fail from client):
```typescript
// Should get permission denied (only service account can write)
```

---

## Security Best Practices

### Current Implementation

✅ **Good**:
- CORS properly configured (localhost ports + production domains)
- Tokens use Bearer scheme
- Auth middleware validates tokens with Firebase Admin
- Email verification required for editor actions
- Firestore rules use principle of least privilege
- Default deny-all rule
- Role-based access control (RBAC)
- Request ID tracking for audit logs

⚠️ **Needs Improvement**:
- Custom claims not being set (CRITICAL BUG)
- No token refresh handling in frontend
- No auth error recovery/retry logic
- No claim verification endpoint
- Emulator setup requires manual claim configuration

❌ **Missing**:
- Rate limiting on auth endpoints
- Account lockout after failed attempts
- Session management/revocation
- Multi-factor authentication (MFA)
- Audit logging for security events

---

## Environment-Specific Concerns

### Local Development (Emulators)

**Current Setup**:
```env
VITE_USE_EMULATORS=true
VITE_FIREBASE_AUTH_DOMAIN=localhost
```

**Issues**:
1. Custom claims don't persist across emulator restarts
2. Email verification bypassed in emulator
3. No rate limiting

**Recommendations**:
- Create seeding script that sets up test users with claims
- Document emulator limitations clearly
- Consider mock auth for rapid development

### Staging

**Database**: `portfolio-staging`
**Project**: `static-sites-257923`

**Status**: Needs custom claims verification

### Production

**Database**: `(default)`
**Project**: `static-sites-257923`

**Status**: Needs custom claims verification

---

## Quick Fix Commands

### 1. Create Custom Claims Script

```bash
cd /home/jdubz/Development/job-finder-app-manager/job-finder-BE
# Create the new script (see Fix 1 above)
```

### 2. Set Claims for Current User

```bash
# Get user ID from Firebase Auth Emulator UI
# Then run:
npm run script:set-claims -- <USER_ID> editor local
```

### 3. Sign Out and Back In

```typescript
// In frontend
await signOut(auth);
await signInWithEmailAndPassword(auth, email, password);
```

### 4. Verify Claims

```typescript
const user = auth.currentUser;
const idTokenResult = await user.getIdTokenResult();
console.log('Custom claims:', idTokenResult.claims);
// Should see: { role: 'editor' }
```

---

## Contact

For questions about this security architecture, contact the development team.

**Last Updated**: 2025-10-21
**Reviewed By**: Claude Code (Worker B)
**Severity**: CRITICAL - Auth system non-functional without custom claims
