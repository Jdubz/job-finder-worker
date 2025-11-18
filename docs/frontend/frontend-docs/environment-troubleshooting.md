# Environment Configuration Troubleshooting

**Last Updated**: 2025-10-20
**Maintainer**: Worker B

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Environment Overview](#environment-overview)
3. [Common Issues](#common-issues)
4. [Switching Environments](#switching-environments)
5. [Obtaining Firebase Credentials](#obtaining-firebase-credentials)
6. [Validation and Testing](#validation-and-testing)
7. [Troubleshooting Guide](#troubleshooting-guide)

---

## Quick Start

### First-Time Setup

```bash
# 1. Copy the template
cp .env.template .env.development

# 2. Edit .env.development with your Firebase credentials
# Get credentials from: https://console.firebase.google.com/project/static-sites-257923/settings/general

# 3. Validate your configuration
npm run check:env

# 4. Start development server
npm run dev
```

### Quick Environment Check

```bash
# Validate environment variables
npm run check:env

# Check what environment Vite will use
npm run dev -- --mode development  # or staging, or production
```

---

## Environment Overview

### Project Structure

The Job Finder frontend uses **one Firebase project** (`static-sites-257923`) for all environments:
- **Development**: Local emulators + `job-finder-dev` app config
- **Staging**: `static-sites-257923` project with `-staging` function suffixes
- **Production**: `static-sites-257923` project with no function suffixes

### Environment Files

| File | Purpose | When Used |
|------|---------|-----------|
| `.env.template` | Template with placeholders | Reference for required variables |
| `.env.development` | Local development config | `npm run dev` |
| `.env.staging` | Staging preview config | `npm run build -- --mode staging` |
| `.env.production` | Production config | `npm run build` (default) |
| `.env` | Active environment | Auto-loaded by Vite |
| `.env.local` | Local overrides | Gitignored, for local customization |

**Priority Order** (highest to lowest):
1. `.env.[mode].local`
2. `.env.local`
3. `.env.[mode]`
4. `.env`

---

## Common Issues

### Issue 1: "Firebase: Error (auth/api-key-not-valid)"

**Symptom**: Cannot sign in, auth errors in console

**Cause**: Invalid or missing `VITE_FIREBASE_API_KEY`

**Solution**:
```bash
# 1. Check your .env file has a valid API key
grep VITE_FIREBASE_API_KEY .env.development

# 2. Ensure it's a real Firebase API key (starts with "AIza" and is 39 characters)
# 3. Get the correct key from Firebase Console

# 4. Validate
npm run check:env
```

### Issue 2: "Failed to fetch" or Network Errors

**Symptom**: API calls fail with network errors

**Causes**:
1. Wrong `VITE_API_BASE_URL`
2. Firebase Functions not deployed
3. CORS issues

**Solution**:
```bash
# 1. Check your API base URL
grep VITE_API_BASE_URL .env.staging

# Should be: https://us-central1-static-sites-257923.cloudfunctions.net

# 2. Verify functions are deployed (staging example)
curl -I https://us-central1-static-sites-257923.cloudfunctions.net/manageJobQueue-staging
# Should return: HTTP/2 401 (auth required, means function exists)

# 3. Check browser console for actual URL being called
```

### Issue 3: "Function does not exist"

**Symptom**: Error says Cloud Function not found

**Cause**: Missing or wrong function suffix

**What to Check**:
- **Staging**: Functions have `-staging` suffix
  - Example: `manageJobQueue-staging`
- **Production**: Functions have NO suffix
  - Example: `manageJobQueue`

**Verify**:
```bash
# Check what mode you're in
npm run dev  # Prints mode in terminal

# Staging should call:
https://us-central1-static-sites-257923.cloudfunctions.net/manageJobQueue-staging

# Production should call:
https://us-central1-static-sites-257923.cloudfunctions.net/manageJobQueue
```

### Issue 4: Wrong Firebase Project

**Symptom**: Firestore data doesn't show up, auth fails

**Cause**: `VITE_FIREBASE_PROJECT_ID` points to wrong project

**Solution**:
```bash
# ALL environments should use: static-sites-257923
# Check your .env files:
grep VITE_FIREBASE_PROJECT_ID .env.*

# Should see:
# .env.development:VITE_FIREBASE_PROJECT_ID=job-finder-dev (for emulators)
# .env.staging:VITE_FIREBASE_PROJECT_ID=static-sites-257923
# .env.production:VITE_FIREBASE_PROJECT_ID=static-sites-257923
```

### Issue 5: Emulators Not Working

**Symptom**: "ECONNREFUSED localhost:5001"

**Solution**:
```bash
# 1. Start Firebase emulators first
firebase emulators:start

# 2. In another terminal, start dev server
npm run dev

# 3. Ensure VITE_USE_EMULATORS=true in .env.development
grep VITE_USE_EMULATORS .env.development
```

---

## Switching Environments

### Switch to Staging Preview

```bash
# 1. Copy staging config
cp .env.staging .env

# 2. Build with staging mode
npm run build -- --mode staging

# 3. Preview locally
npm run preview

# 4. Open browser to http://localhost:4173
```

### Switch to Production Preview

```bash
# 1. Copy production config
cp .env.production .env

# 2. Build
npm run build

# 3. Preview
npm run preview

# 4. Test in browser
```

### Back to Development

```bash
# 1. Copy dev config
cp .env.development .env

# 2. Start dev server
npm run dev
```

---

## Obtaining Firebase Credentials

### For Development (Local Emulators)

1. No real credentials needed if using emulators
2. Use placeholder values in `.env.development`
3. Set `VITE_USE_EMULATORS=true`

### For Staging/Production

#### Step 1: Access Firebase Console
Go to: https://console.firebase.google.com/project/static-sites-257923/settings/general

#### Step 2: Select Your App
- Click on "Your apps" section
- Find the web app configuration (icon looks like `</>`
)

#### Step 3: Copy Configuration
You'll see a config object like:
```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "job-finder-staging.joshwentworth.com",
  projectId: "static-sites-257923",
  storageBucket: "static-sites-257923.appspot.com",
  messagingSenderId: "789847666726",
  appId: "1:789847666726:web:..."
};
```

#### Step 4: Add to .env File
```bash
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=job-finder-staging.joshwentworth.com
VITE_FIREBASE_PROJECT_ID=static-sites-257923
VITE_FIREBASE_STORAGE_BUCKET=static-sites-257923.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=789847666726
VITE_FIREBASE_APP_ID=1:789847666726:web:...
```

### Regenerating Web App Credentials

If credentials are compromised:

1. Go to Firebase Console > Project Settings
2. Scroll to "Your apps"
3. Click the gear icon next to your web app
4. Click "Delete app" (if needed)
5. Click "Add app" → Web
6. Copy the new configuration
7. Update all `.env.*` files

---

## Validation and Testing

### Validate Environment Configuration

```bash
# Run the validation script
npm run check:env

# Expected output:
# ✅ All required environment variables are configured
```

### Test API Connectivity

#### Staging
```bash
# Test staging function (should return 401 - auth required)
curl -I https://us-central1-static-sites-257923.cloudfunctions.net/manageJobQueue-staging

# Expected: HTTP/2 401
```

#### Production
```bash
# Test production function
curl -I https://us-central1-static-sites-257923.cloudfunctions.net/manageJobQueue

# Expected: HTTP/2 401
```

### Test Build

```bash
# Build and check for errors
npm run build

# Check built files reference correct URLs
grep -r "static-sites-257923" dist/assets/*.js

# Should find references to Cloud Functions
```

### Test in Browser

1. Start preview: `npm run preview`
2. Open browser DevTools
3. Go to Network tab
4. Try to submit a job or generate document
5. Verify API calls go to correct URLs:
   - Staging: `https://us-central1-static-sites-257923.cloudfunctions.net/...-staging`
   - Production: `https://us-central1-static-sites-257923.cloudfunctions.net/...`

---

## Troubleshooting Guide

### Debug Checklist

When something doesn't work:

- [ ] Run `npm run check:env` - all variables present?
- [ ] Check browser console for errors
- [ ] Check Network tab - what URLs are being called?
- [ ] Verify Firebase Functions are deployed
- [ ] Check Firebase project ID matches in all places
- [ ] Confirm you're in the right MODE (dev/staging/prod)
- [ ] Try clearing browser cache and rebuilding

### Environment-Specific Debug

#### Development Mode
```bash
# Check emulators are running
firebase emulators:list

# Check VITE_USE_EMULATORS
grep VITE_USE_EMULATORS .env.development
# Should be: true

# Check emulator ports
# Auth: localhost:9099
# Firestore: localhost:8080
# Functions: localhost:5001
```

#### Staging Mode
```bash
# Verify project ID
grep VITE_FIREBASE_PROJECT_ID .env.staging
# Should be: static-sites-257923

# Verify function suffix
curl -I https://us-central1-static-sites-257923.cloudfunctions.net/manageJobQueue-staging
# Should return: 401
```

#### Production Mode
```bash
# Verify project ID
grep VITE_FIREBASE_PROJECT_ID .env.production
# Should be: static-sites-257923

# Verify NO function suffix
curl -I https://us-central1-static-sites-257923.cloudfunctions.net/manageJobQueue
# Should return: 401 (when deployed)
```

### Getting Help

1. **Check docs/environment-verification-matrix.md** for known issues
2. **Run diagnostic**: `npm run check:env`
3. **Check logs**:
   - Browser console
   - Firebase Functions logs: https://console.firebase.google.com/project/static-sites-257923/functions/logs
4. **Ask for help** with:
   - Environment mode you're using
   - Error message from console
   - URL being called (from Network tab)
   - Output of `npm run check:env`

---

## Quick Reference

### Required Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `VITE_FIREBASE_API_KEY` | Firebase Web API Key | `AIzaSy...` |
| `VITE_FIREBASE_AUTH_DOMAIN` | Auth domain | `job-finder-staging.joshwentworth.com` |
| `VITE_FIREBASE_PROJECT_ID` | Project ID | `static-sites-257923` |
| `VITE_FIREBASE_STORAGE_BUCKET` | Storage bucket | `static-sites-257923.appspot.com` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Messaging ID | `789847666726` |
| `VITE_FIREBASE_APP_ID` | App ID | `1:789847666726:web:...` |

### Optional Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `VITE_API_BASE_URL` | Override auto-detection | Auto-configured |
| `VITE_USE_EMULATORS` | Use local emulators | `false` |
| `VITE_FIRESTORE_DATABASE_ID` | Firestore DB | `(default)` |
| `VITE_ENVIRONMENT` | Metadata | `development` |
| `VITE_ENABLE_ANALYTICS` | Google Analytics | `false` (dev), `true` (prod) |

### Commands Reference

```bash
# Validation
npm run check:env

# Development
npm run dev

# Build staging
npm run build -- --mode staging

# Build production
npm run build

# Preview build
npm run preview

# Type check
npm run type-check

# Lint
npm run lint
```

---

**For more information**, see:
- [Environment Verification Matrix](./environment-verification-matrix.md)
- [README.md - Environment Variables section](../README.md#environment-variables)
- [.env.template](../.env.template)
