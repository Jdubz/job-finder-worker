# OAuth Configuration Fix - Staging & Production

## Issue Summary

**Problem**: Staging environment authentication is failing because Google OAuth client is configured with production callback URL only.

**Root Cause**: Both staging and production share the same Firebase project (`static-sites-257923`) and Firebase App ID (`1:789847666726:web:2128b2081a8c38ba5f76e7`), which means they use the same Google OAuth client. The OAuth client's authorized redirect URIs must include BOTH staging and production domains.

## Current Configuration

### Environment Settings

**Staging** (`.env.staging`):
- Auth Domain: `job-finder-staging.joshwentworth.com`
- Firebase Project: `static-sites-257923`
- App ID: `1:789847666726:web:2128b2081a8c38ba5f76e7`

**Production** (`.env.production`):
- Auth Domain: `job-finder.joshwentworth.com`
- Firebase Project: `static-sites-257923`
- App ID: `1:789847666726:web:2128b2081a8c38ba5f76e7`

### Problem

Google OAuth client currently has only ONE authorized redirect URI:
```
https://job-finder.joshwentworth.com/__/auth/handler
```

But staging needs:
```
https://job-finder-staging.joshwentworth.com/__/auth/handler
```

## Solution: Update Google Cloud Console OAuth Configuration

### Step 1: Navigate to Google Cloud Console

1. Go to: https://console.cloud.google.com/
2. Select project: **static-sites-257923**
3. Navigate to: **APIs & Services** → **Credentials**

### Step 2: Find the OAuth 2.0 Client ID

Look for the OAuth client with:
- **Type**: Web application
- **Name**: Should contain "firebase" or "job-finder"
- **Client ID**: Should match the Firebase configuration

### Step 3: Edit Authorized Redirect URIs

Click **Edit** on the OAuth client and update **Authorized redirect URIs** to include BOTH:

```
https://job-finder.joshwentworth.com/__/auth/handler
https://job-finder-staging.joshwentworth.com/__/auth/handler
```

**Important**: Firebase automatically uses the pattern `https://{authDomain}/__/auth/handler` for OAuth callbacks.

### Step 4: Add Authorized JavaScript Origins (if needed)

Also ensure **Authorized JavaScript origins** include:

```
https://job-finder.joshwentworth.com
https://job-finder-staging.joshwentworth.com
```

### Step 5: Save Changes

Click **Save** at the bottom of the page.

## Verification

### Test Staging Authentication

1. Navigate to: https://job-finder-staging.joshwentworth.com/login
2. Click "Sign in with Google"
3. Complete OAuth flow
4. Should successfully authenticate and redirect to dashboard

### Test Production Authentication

1. Navigate to: https://job-finder.joshwentworth.com/login
2. Click "Sign in with Google"
3. Complete OAuth flow
4. Should successfully authenticate and redirect to dashboard

## Alternative Solution: Separate Firebase Apps

If you want staging and production to have completely independent OAuth configurations:

### Option A: Create Separate Firebase Apps

1. In Firebase Console, create a new web app for staging
2. Update `.env.staging` with new staging-specific App ID
3. Configure OAuth client for staging app separately

**Pros**:
- Complete isolation between environments
- Independent OAuth configurations
- No shared settings

**Cons**:
- More complex setup
- Need to manage two Firebase apps
- Requires updating environment variables

### Option B: Keep Shared Configuration (Current - Recommended)

Keep using the same Firebase App ID for both environments but ensure OAuth client includes both redirect URIs.

**Pros**:
- Simpler configuration
- Single Firebase app to manage
- Shared analytics and Firebase features

**Cons**:
- OAuth client must include all environment redirect URIs
- Any OAuth changes affect both environments

**Recommendation**: Use Option B (current setup) and simply add both redirect URIs to the OAuth client.

## Firebase Hosting Configuration

The Firebase Hosting is correctly configured with separate targets:

```json
{
  "targets": {
    "static-sites-257923": {
      "hosting": {
        "staging": ["job-finder-staging"],
        "production": ["job-finder-production"]
      }
    }
  }
}
```

This maps to:
- **Staging**: `job-finder-staging.web.app` → `job-finder-staging.joshwentworth.com`
- **Production**: `job-finder-production.web.app` → `job-finder.joshwentworth.com`

## Error Messages to Watch For

### redirect_uri_mismatch

```
Error 400: redirect_uri_mismatch
The redirect URI in the request: https://job-finder-staging.joshwentworth.com/__/auth/handler
does not match the ones authorized for the OAuth client.
```

**Fix**: Add the redirect URI to Google Cloud Console as described above.

### Invalid Origin

```
Error: Not a valid origin for the client
```

**Fix**: Add the origin to **Authorized JavaScript origins** in Google Cloud Console.

## DNS and SSL Configuration

Ensure custom domains are properly configured:

### Staging Domain

```bash
# Check DNS
dig job-finder-staging.joshwentworth.com

# Should point to Firebase Hosting
# CNAME or A record to Firebase
```

### Production Domain

```bash
# Check DNS
dig job-finder.joshwentworth.com

# Should point to Firebase Hosting
# CNAME or A record to Firebase
```

### SSL Certificates

Firebase Hosting automatically provisions SSL certificates for custom domains. Allow 24-48 hours after DNS configuration for certificates to be issued.

## Testing Checklist

After updating OAuth configuration:

- [ ] Staging login works with Google OAuth
- [ ] Production login works with Google OAuth
- [ ] Logout works in both environments
- [ ] Session persists across page reloads
- [ ] Protected routes redirect correctly
- [ ] No console errors related to authentication
- [ ] OAuth redirect completes successfully (no 400 errors)

## Additional Resources

- **Firebase Auth Docs**: https://firebase.google.com/docs/auth/web/google-signin
- **Google OAuth 2.0**: https://developers.google.com/identity/protocols/oauth2
- **Firebase Hosting Custom Domains**: https://firebase.google.com/docs/hosting/custom-domain

## Support

If issues persist after following these steps:

1. Check browser console for detailed error messages
2. Verify DNS records are propagating (`dig` command)
3. Ensure SSL certificates are active (check in Firebase Console)
4. Test in incognito mode to rule out cache issues
5. Check Google Cloud Console Logs for OAuth errors

## Implementation Status

**Date**: 2025-10-20
**Status**: Awaiting OAuth client update in Google Cloud Console
**Next Steps**: Update authorized redirect URIs to include staging domain
