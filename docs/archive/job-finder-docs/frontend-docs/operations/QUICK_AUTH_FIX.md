# Quick Auth Fix Guide

## Immediate Steps to Try

### 1. Use the Debug Modal (Fastest Way to Diagnose)

Temporarily replace the AuthModal with the debug version:

**In `src/components/layout/Navigation.tsx`:**

```typescript
// Change this line:
import { AuthModal } from "@/components/auth/AuthModal"

// To this:
import { AuthModal } from "@/components/auth/AuthModalDebug"
```

The debug modal will show you:
- Real-time auth flow logs
- Exact error codes and messages
- Environment configuration
- Helpful troubleshooting tips

### 2. Most Common Fix: Check Firebase Console

**Go to Firebase Console → Authentication → Settings → Authorized domains**

Add these domains (click "Add domain" button):

```
localhost
job-finder-staging.joshwentworth.com
job-finder.joshwentworth.com
job-finder-staging.web.app
job-finder-production.web.app
static-sites-257923.firebaseapp.com
```

**IMPORTANT**: After adding domains, wait 1-2 minutes for changes to propagate.

### 3. Check Google OAuth Client

**Go to Google Cloud Console → APIs & Services → Credentials**

Find your OAuth 2.0 Client ID and verify:

**Authorized JavaScript origins:**
```
http://localhost:5173
https://job-finder-staging.joshwentworth.com
https://job-finder.joshwentworth.com
https://job-finder-staging.web.app
https://job-finder-production.web.app
```

**Authorized redirect URIs:**
```
http://localhost:5173/__/auth/handler
https://job-finder-staging.joshwentworth.com/__/auth/handler
https://job-finder.joshwentworth.com/__/auth/handler
https://job-finder-staging.web.app/__/auth/handler
https://job-finder-production.web.app/__/auth/handler
```

### 4. Clear Browser Data

Sometimes cached auth state causes issues:

1. Open DevTools (F12)
2. Right-click the refresh button
3. Click "Empty Cache and Hard Reload"
4. Or try in an incognito window

### 5. Test Locally First

Before testing on staging/production:

```bash
# Start dev server
npm run dev

# Open http://localhost:5173
# Click auth icon
# Watch the debug logs in the modal
```

## Error Code Quick Reference

| Error Code | Likely Cause | Quick Fix |
|------------|--------------|-----------|
| `auth/unauthorized-domain` | Domain not in Firebase authorized list | Add domain in Firebase Console |
| `redirect_uri_mismatch` | OAuth redirect URI not configured | Add `https://your-domain/__/auth/handler` to OAuth client |
| `auth/popup-blocked` | Browser blocked popup | Allow popups for your domain |
| `auth/popup-closed-by-user` | User closed popup | Not an error - user cancelled |
| `auth/network-request-failed` | Network/CORS issue | Check internet, Firebase status, browser console |
| `auth/operation-not-allowed` | Google provider not enabled | Enable in Firebase Console → Authentication → Sign-in method |

## Debugging Checklist

Run through these in order:

- [ ] Firebase Console → Authorized domains includes current domain
- [ ] Google Cloud Console → OAuth client has correct origins and redirect URIs
- [ ] Browser allows popups for your domain
- [ ] No ad blockers or privacy extensions interfering
- [ ] Correct Firebase project selected (`firebase use`)
- [ ] Environment variables match deployed domain
- [ ] Cloudflare (if used) not interfering with auth domain
- [ ] Test in incognito mode to rule out extensions

## Quick Test Script

Create a file `scripts/test-auth.sh`:

```bash
#!/bin/bash

echo "🔐 Testing Firebase Auth Configuration"
echo ""

# Check environment
echo "Current environment variables:"
echo "Project ID: $VITE_FIREBASE_PROJECT_ID"
echo "Auth Domain: $VITE_FIREBASE_AUTH_DOMAIN"
echo ""

# Check Firebase project
echo "Firebase project:"
firebase use
echo ""

# Start dev server
echo "Starting dev server..."
npm run dev
```

## Still Not Working?

1. **Check browser console** for the exact error message
2. **Check Network tab** in DevTools for failing requests
3. **Copy debug logs** from the debug modal and share with team
4. **Check Firebase status**: https://status.firebase.google.com/
5. **Review full guide**: `docs/troubleshooting/AUTH_DEBUGGING_GUIDE.md`

## Revert Debug Modal

Once fixed, revert back to production modal:

**In `src/components/layout/Navigation.tsx`:**

```typescript
// Change back to:
import { AuthModal } from "@/components/auth/AuthModal"
```

## Common Gotchas

1. **Cloudflare Proxy**: If using Cloudflare, set auth domain to "DNS only" (not proxied)
2. **Multiple Firebase Projects**: Make sure you're editing the right project
3. **Case Sensitivity**: Domain names must match exactly (including www or no www)
4. **Protocol**: Use `https://` not `http://` for production domains
5. **Trailing Slashes**: Don't include trailing slashes in domains
