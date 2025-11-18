# Firebase Auth Custom Domain Configuration Fix

## Issue Summary

**Problem**: Firebase authentication (`auth/internal-error`) fails on `job-finder-staging.joshwentworth.com` even though it works on `staging.joshwentworth.com` (portfolio).

**Root Cause**: Both apps use the same Firebase project (`static-sites-257923`) and App ID (`1:789847666726:web:2128b2081a8c38ba5f76e7`), but they use different custom domains as their `authDomain`. The job-finder custom domain is likely not properly configured in Firebase Console and Google Cloud Console.

## Key Findings

### Working Configuration (Portfolio)
- **Auth Domain**: `staging.joshwentworth.com`
- **Hosting Site**: `stagingjsw`
- **Status**: ✅ Authentication works

### Failing Configuration (Job-Finder)
- **Auth Domain**: `job-finder-staging.joshwentworth.com`
- **Hosting Site**: `job-finder-staging`
- **Status**: ❌ `auth/internal-error` when clicking "Sign in with Google"

### Shared Configuration
- **Firebase Project**: `static-sites-257923`
- **Firebase App ID**: `1:789847666726:web:2128b2081a8c38ba5f76e7`
- **OAuth Flow**: Google Sign-In

## How Firebase Auth Custom Domains Work

When using a custom domain as `authDomain` in Firebase:

1. **Reserved Path**: Firebase Auth redirects to `https://[authDomain]/__/auth/handler` during OAuth flow
2. **Hosting Requirement**: This path ONLY exists on Firebase Hosting - it's a reserved namespace
3. **Domain Authorization**: The custom domain must be:
   - Connected to Firebase Hosting (with DNS properly configured)
   - Added to Firebase Console's **Authorized Domains** list
   - Added to Google Cloud Console's **OAuth Client** configuration

## Fix Steps

### Step 1: Verify Firebase Hosting Custom Domain

**Check in Firebase Console**:
1. Go to [Firebase Console](https://console.firebase.google.com/project/static-sites-257923/hosting/sites)
2. Click on `job-finder-staging` site
3. Go to "Advanced" or "Domain" tab
4. Verify `job-finder-staging.joshwentworth.com` is listed as a connected domain

**Expected Result**:
- Domain status should be "Connected"
- SSL certificate should be provisioned
- DNS configuration should show as verified

**If Not Connected**:
```bash
# Add custom domain via Firebase Console UI
# OR via CLI (if supported):
firebase hosting:sites:domain:add job-finder-staging.joshwentworth.com \
  --site job-finder-staging \
  --project static-sites-257923
```

### Step 2: Verify DNS Configuration

**Required DNS Records** (check with your DNS provider):

```
# A Records (or CNAME)
job-finder-staging.joshwentworth.com    A    151.101.1.195
job-finder-staging.joshwentworth.com    A    151.101.65.195

# OR CNAME (alternative)
job-finder-staging.joshwentworth.com    CNAME    job-finder-staging.web.app

# TXT Record for Firebase ownership verification
_firebase.job-finder-staging.joshwentworth.com    TXT    [verification-code-from-console]
```

**Verify DNS Resolution**:
```bash
# Check DNS is resolving
dig job-finder-staging.joshwentworth.com

# Verify HTTPS works
curl -I https://job-finder-staging.joshwentworth.com

# Test the auth handler path specifically
curl -I https://job-finder-staging.joshwentworth.com/__/auth/handler
# Should return 200 or redirect (NOT 404)
```

### Step 3: Add to Firebase Authorized Domains

**Critical Step**: Even if the domain is connected to Hosting, it must be explicitly authorized for Authentication.

**In Firebase Console**:
1. Go to [Authentication → Settings](https://console.firebase.google.com/project/static-sites-257923/authentication/settings)
2. Scroll to "Authorized domains" section
3. Click "Add domain"
4. Add: `job-finder-staging.joshwentworth.com`
5. Save

**Expected Authorized Domains List**:
- ✅ `localhost` (for development)
- ✅ `static-sites-257923.firebaseapp.com` (default)
- ✅ `staging.joshwentworth.com` (portfolio - already working)
- ✅ `joshwentworth.com` (if production uses this)
- ✅ `job-finder-staging.joshwentworth.com` ⚠️ **ADD THIS**
- ✅ `job-finder.joshwentworth.com` (for production)

### Step 4: Update Google Cloud OAuth Client

**In Google Cloud Console**:
1. Go to [API Credentials](https://console.cloud.google.com/apis/credentials?project=static-sites-257923)
2. Click on the OAuth 2.0 Client ID used by Firebase
3. Under "Authorized JavaScript origins", add:
   ```
   https://job-finder-staging.joshwentworth.com
   https://job-finder.joshwentworth.com
   ```
4. Under "Authorized redirect URIs", add:
   ```
   https://job-finder-staging.joshwentworth.com/__/auth/handler
   https://job-finder.joshwentworth.com/__/auth/handler
   ```
5. Click "Save"

**Complete OAuth Client Configuration** should include:

**Authorized JavaScript origins**:
- `https://staging.joshwentworth.com` ✅ (portfolio staging - working)
- `https://joshwentworth.com` ✅ (portfolio production)
- `https://job-finder-staging.joshwentworth.com` ⚠️ **ADD THIS**
- `https://job-finder.joshwentworth.com` ⚠️ **ADD THIS**

**Authorized redirect URIs**:
- `https://staging.joshwentworth.com/__/auth/handler` ✅ (portfolio staging)
- `https://joshwentworth.com/__/auth/handler` ✅ (portfolio production)
- `https://job-finder-staging.joshwentworth.com/__/auth/handler` ⚠️ **ADD THIS**
- `https://job-finder.joshwentworth.com/__/auth/handler` ⚠️ **ADD THIS**

### Step 5: Update firebase.json (Optional but Recommended)

Add the `ignore` rule that portfolio uses for clarity (though Firebase handles this automatically):

```json
{
  "hosting": [
    {
      "target": "staging",
      "public": "dist",
      "ignore": [
        "firebase.json",
        "**/.*",
        "**/node_modules/**",
        "**/.DS_Store",
        "**/Thumbs.db",
        "__/auth/**"
      ],
      // ... rest of config
    }
  ]
}
```

### Step 6: Verify the Fix

After making all changes, test the authentication flow:

1. **Clear browser cache** (important!)
2. Go to `https://job-finder-staging.joshwentworth.com`
3. Click the auth icon to open the modal
4. Click "Sign in with Google"
5. Complete the OAuth flow

**Expected Behavior**:
- OAuth popup/redirect opens
- User selects Google account
- Redirects to `https://job-finder-staging.joshwentworth.com/__/auth/handler`
- Handler completes OAuth flow
- User is authenticated and redirected back to the app

## Testing Checklist

- [ ] DNS resolves to Firebase Hosting
- [ ] HTTPS certificate is valid
- [ ] `/__/auth/handler` path returns 200 (not 404)
- [ ] Domain is in Firebase Authorized Domains list
- [ ] Domain is in Google OAuth Client JavaScript origins
- [ ] Handler URL is in Google OAuth Client redirect URIs
- [ ] Browser cache cleared before testing
- [ ] Sign in with Google completes successfully

## Comparison with Working Portfolio Config

| Configuration | Portfolio (Working) | Job-Finder (Failing) | Action Needed |
|--------------|-------------------|---------------------|---------------|
| Firebase Project | `static-sites-257923` | `static-sites-257923` | ✅ Same |
| App ID | `1:789847666726:web:2128b2081a8c38ba5f76e7` | `1:789847666726:web:2128b2081a8c38ba5f76e7` | ✅ Same |
| Hosting Site | `stagingjsw` | `job-finder-staging` | ✅ Different (OK) |
| Auth Domain | `staging.joshwentworth.com` | `job-finder-staging.joshwentworth.com` | ⚠️ Verify configuration |
| Custom Domain Connected | ✅ Yes | ❓ Verify | 🔧 Check Step 1 |
| DNS Configured | ✅ Yes | ❓ Verify | 🔧 Check Step 2 |
| Firebase Authorized Domain | ✅ Yes | ❓ Likely Missing | 🔧 **Check Step 3** |
| OAuth JavaScript Origin | ✅ Yes | ❓ Likely Missing | 🔧 **Check Step 4** |
| OAuth Redirect URI | ✅ Yes | ❓ Likely Missing | 🔧 **Check Step 4** |

## Most Likely Root Cause

Based on the `auth/internal-error` and comparison with the working portfolio configuration, the most probable issues are:

1. **Firebase Authorized Domains** (Step 3) - Domain not whitelisted
2. **Google OAuth Client** (Step 4) - Missing JavaScript origin and redirect URI
3. **DNS/Hosting** (Steps 1-2) - Domain not properly connected or DNS not propagated

**Recommended Order**:
1. First verify Steps 1-2 (DNS and Hosting connection)
2. Then add to Step 3 (Firebase Authorized Domains) - **This is likely the main issue**
3. Finally update Step 4 (Google OAuth Client)

## Additional Resources

- [Firebase Custom Domain Documentation](https://firebase.google.com/docs/hosting/custom-domain)
- [Firebase Auth Custom Domains](https://firebase.google.com/support/troubleshooter/auth/domain)
- [Google OAuth Setup](https://support.google.com/cloud/answer/6158849)

## Related Files

- `.env.staging` - Contains `VITE_FIREBASE_AUTH_DOMAIN=job-finder-staging.joshwentworth.com`
- `firebase.json` - Firebase Hosting configuration
- `.firebaserc` - Hosting target mapping

## Post-Fix Verification

After implementing all fixes, verify:

```bash
# Test the staging environment
npx playwright test e2e/auth.spec.ts --project=chromium --grep @critical

# Should pass:
# ✓ should show authentication modal when clicking user icon
# ✓ should redirect unauthenticated users from protected routes to home
```
