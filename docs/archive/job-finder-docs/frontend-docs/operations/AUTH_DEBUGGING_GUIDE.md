# Firebase Authentication Debugging Guide

## Current Configuration

### Environment Setup
- **Project ID**: `static-sites-257923`
- **Staging Auth Domain**: `job-finder-staging.joshwentworth.com`
- **Production Auth Domain**: `job-finder.joshwentworth.com`
- **Staging Hosting**: `job-finder-staging.web.app`
- **Production Hosting**: `job-finder-production.web.app` (or custom domain)

### Cloudflare Setup (if using Cloudflare)
- Cloudflare may be proxying the custom domains
- This can interfere with Firebase Auth redirects

## Step-by-Step Troubleshooting

### 1. Verify Firebase Console Settings

#### 1.1 Check Authorized Domains
Go to: Firebase Console → Authentication → Settings → Authorized domains

**Required domains:**
```
✅ localhost (for development)
✅ job-finder-staging.joshwentworth.com (staging custom domain)
✅ job-finder.joshwentworth.com (production custom domain)
✅ job-finder-staging.web.app (staging Firebase hosting)
✅ job-finder-production.web.app (production Firebase hosting)
✅ static-sites-257923.firebaseapp.com (default Firebase domain)
```

#### 1.2 Check Google OAuth Client Configuration
Go to: Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs

**Authorized JavaScript origins:**
```
http://localhost:5173 (development)
https://job-finder-staging.joshwentworth.com (staging)
https://job-finder.joshwentworth.com (production)
https://job-finder-staging.web.app (staging Firebase)
https://job-finder-production.web.app (production Firebase)
https://static-sites-257923.firebaseapp.com (default)
```

**Authorized redirect URIs:**
```
http://localhost:5173/__/auth/handler (development)
https://job-finder-staging.joshwentworth.com/__/auth/handler (staging)
https://job-finder.joshwentworth.com/__/auth/handler (production)
https://job-finder-staging.web.app/__/auth/handler (staging Firebase)
https://job-finder-production.web.app/__/auth/handler (production Firebase)
https://static-sites-257923.firebaseapp.com/__/auth/handler (default)
```

### 2. Browser Console Debugging

#### 2.1 Enable Verbose Logging
Add this to `src/config/firebase.ts` temporarily:

```typescript
import { getAuth, type Auth, connectAuthEmulator } from "firebase/auth"

// After initializing auth
export const auth: Auth = getAuth(app)

// Add debug logging
if (import.meta.env.DEV) {
  auth.onAuthStateChanged((user) => {
    console.log('🔐 Auth State Changed:', {
      user: user ? {
        uid: user.uid,
        email: user.email,
        emailVerified: user.emailVerified
      } : null
    })
  })
}
```

#### 2.2 Check Browser Console
When clicking "Sign in with Google":

1. **Look for CORS errors**:
   ```
   Access to fetch at 'https://...' has been blocked by CORS policy
   ```
   → Check authorized domains in Firebase Console

2. **Look for redirect URI errors**:
   ```
   redirect_uri_mismatch
   ```
   → Check OAuth client redirect URIs in Google Cloud Console

3. **Look for auth domain errors**:
   ```
   auth/unauthorized-domain
   ```
   → Check authorized domains in Firebase Console

4. **Look for network errors**:
   ```
   auth/network-request-failed
   ```
   → Check internet connection and Firebase status

### 3. Network Tab Debugging

#### 3.1 Check Network Requests
1. Open DevTools → Network tab
2. Filter by "Fetch/XHR"
3. Click "Sign in with Google"
4. Look for these requests:

**Expected request chain:**
```
1. POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp
   Status: 200 OK

2. POST https://identitytoolkit.googleapis.com/v1/accounts:lookup
   Status: 200 OK
```

**Common failures:**
```
❌ 400 Bad Request → Invalid OAuth client configuration
❌ 401 Unauthorized → API key issues
❌ 403 Forbidden → Domain not authorized
```

#### 3.2 Examine Request Headers
Check the failing request's headers:
```
Origin: https://job-finder-staging.joshwentworth.com
Referer: https://job-finder-staging.joshwentworth.com/
```

These must match authorized domains in Firebase Console.

### 4. Common Issues and Solutions

#### Issue 1: "auth/unauthorized-domain"
**Cause**: Current domain not in Firebase authorized domains list

**Fix**:
1. Go to Firebase Console → Authentication → Settings → Authorized domains
2. Click "Add domain"
3. Add your domain (e.g., `job-finder-staging.joshwentworth.com`)
4. Wait 1-2 minutes for propagation
5. Clear browser cache and retry

#### Issue 2: "redirect_uri_mismatch"
**Cause**: OAuth redirect URI not configured in Google Cloud Console

**Fix**:
1. Copy the redirect URI from error message
2. Go to Google Cloud Console → Credentials
3. Edit your OAuth 2.0 Client ID
4. Add the redirect URI under "Authorized redirect URIs"
5. Save and retry (may take a few minutes to propagate)

#### Issue 3: Popup closes immediately
**Cause**: Usually a CORS or cookie issue

**Fix**:
1. Check browser's cookie settings (must allow third-party cookies for Firebase Auth)
2. Try in incognito mode to rule out extensions
3. Check for ad blockers or privacy extensions blocking popups
4. Verify no Content Security Policy (CSP) violations in console

#### Issue 4: "auth/popup-blocked"
**Cause**: Browser blocked the popup window

**Fix**:
1. Allow popups for your domain
2. Or switch to redirect-based auth (see below)

#### Issue 5: Auth works on Firebase subdomain but not custom domain
**Cause**: Custom domain not properly configured

**Fix**:
1. Verify DNS records point to Firebase Hosting
2. Check Cloudflare proxy settings (should be "DNS only" for auth domain)
3. Add custom domain to Firebase authorized domains
4. Update OAuth client origins and redirect URIs

### 5. Switch to Redirect-Based Auth (Alternative)

If popups continue to fail, use redirect-based auth:

**Update `src/components/auth/AuthModal.tsx`:**
```typescript
import { signInWithRedirect, GoogleAuthProvider, getRedirectResult } from "firebase/auth"

// In component
useEffect(() => {
  // Handle redirect result on mount
  getRedirectResult(auth)
    .then((result) => {
      if (result) {
        console.log('✅ Signed in via redirect:', result.user.email)
        onOpenChange(false)
      }
    })
    .catch((error) => {
      console.error('❌ Redirect sign-in error:', error)
      setError(error.message)
    })
}, [])

const handleGoogleSignIn = async () => {
  setIsSigningIn(true)
  setError(null)

  try {
    const provider = new GoogleAuthProvider()
    await signInWithRedirect(auth, provider)
    // User will be redirected away, then back after auth
  } catch (err) {
    console.error("Sign in error:", err)
    setError(err.message)
    setIsSigningIn(false)
  }
}
```

### 6. Cloudflare-Specific Issues

If using Cloudflare for custom domains:

#### 6.1 Check Proxy Status
- Auth domain should be **DNS only** (grey cloud), not proxied
- Or ensure Cloudflare SSL/TLS mode is "Full (strict)"

#### 6.2 Check Firewall Rules
- Ensure Cloudflare isn't blocking Firebase Auth requests
- Check Security → Events for blocked requests

#### 6.3 Check Page Rules
- Ensure no page rules interfering with `/__/auth/*` paths

### 7. Testing Checklist

Test auth on each environment:

**Development (localhost:5173):**
```bash
npm run dev
# Click auth icon, sign in with Google
# Should open popup and complete auth
```

**Staging (job-finder-staging.joshwentworth.com):**
```bash
# Deploy to staging first
firebase deploy --only hosting:staging

# Visit https://job-finder-staging.joshwentworth.com
# Click auth icon, sign in with Google
# Should complete auth
```

**Production (job-finder.joshwentworth.com):**
```bash
# Deploy to production
firebase deploy --only hosting:production

# Visit https://job-finder.joshwentworth.com
# Click auth icon, sign in with Google
# Should complete auth
```

### 8. Debugging Commands

**Check current Firebase project:**
```bash
firebase use
# Should show: Now using project static-sites-257923
```

**Check hosting targets:**
```bash
cat .firebaserc
# Verify staging and production targets are configured
```

**Check environment variables:**
```bash
# Staging
cat .env.staging | grep VITE_FIREBASE_AUTH_DOMAIN
# Should show: job-finder-staging.joshwentworth.com

# Production
cat .env.production | grep VITE_FIREBASE_AUTH_DOMAIN
# Should show: job-finder.joshwentworth.com
```

### 9. Quick Diagnostic Script

Create `scripts/check-auth-config.sh`:

```bash
#!/bin/bash

echo "🔍 Checking Firebase Auth Configuration..."
echo ""

# Check .env files
echo "📋 Environment Variables:"
echo "Staging auth domain: $(grep VITE_FIREBASE_AUTH_DOMAIN .env.staging)"
echo "Production auth domain: $(grep VITE_FIREBASE_AUTH_DOMAIN .env.production)"
echo ""

# Check Firebase project
echo "🔥 Firebase Project:"
firebase use
echo ""

# Check hosting targets
echo "🎯 Hosting Targets:"
cat .firebaserc | grep -A 10 "hosting"
echo ""

echo "✅ Next steps:"
echo "1. Verify these domains in Firebase Console → Authentication → Settings → Authorized domains"
echo "2. Verify OAuth client in Google Cloud Console has matching origins and redirect URIs"
echo "3. Test auth flow in browser with DevTools Network tab open"
```

### 10. Contact Information

If you're still stuck:

1. **Check Firebase Status**: https://status.firebase.google.com/
2. **Firebase Support**: Firebase Console → Support
3. **Stack Overflow**: Tag questions with `firebase-authentication`

## Most Common Root Causes

Based on typical auth failures:

1. **Domain not in authorized list** (60% of cases)
2. **OAuth client misconfigured** (25% of cases)
3. **Cloudflare proxy interfering** (10% of cases)
4. **Browser blocking popups/cookies** (5% of cases)

Start with #1 and work down the list.
