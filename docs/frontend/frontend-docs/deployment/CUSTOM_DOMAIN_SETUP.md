# Custom Domain Setup Guide - Cloudflare to Firebase Hosting

**Date**: 2025-10-19  
**Owner**: Worker A  
**Domains**:

- Staging: `job-finder-staging.joshwentworth.com`
- Production: `job-finder.joshwentworth.com`

---

## Overview

This guide walks through connecting your custom domains from Cloudflare DNS to Firebase Hosting with proper SSL/TLS configuration.

---

## Prerequisites

✅ Cloudflare account with `joshwentworth.com` domain  
✅ Firebase Hosting sites configured:

- `job-finder-staging` → https://job-finder-staging.web.app
- `job-finder-production` → https://job-finder-production.web.app

---

## Part 1: Add Custom Domains in Firebase Console

### Step 1: Add Staging Domain

1. Go to [Firebase Console - Hosting](https://console.firebase.google.com/project/static-sites-257923/hosting/sites)

2. Click on **job-finder-staging** site

3. Click **"Add custom domain"**

4. Enter: `job-finder-staging.joshwentworth.com`

5. Click **"Continue"**

6. Firebase will show you DNS records to add. **Keep this page open** - you'll need these values.

   You should see something like:

   ```
   Type: A
   Name: job-finder-staging
   Value: 151.101.1.195, 151.101.65.195
   ```

### Step 2: Add Production Domain

1. Go back to [Firebase Console - Hosting](https://console.firebase.google.com/project/static-sites-257923/hosting/sites)

2. Click on **job-finder-production** site

3. Click **"Add custom domain"**

4. Enter: `job-finder.joshwentworth.com`

5. Click **"Continue"**

6. Firebase will show you DNS records. **Keep this page open** too.

---

## Part 2: Configure Cloudflare DNS

### Important SSL/TLS Settings First

1. Go to Cloudflare Dashboard → Select `joshwentworth.com` domain

2. Go to **SSL/TLS** → **Overview**

3. Set encryption mode to: **Full (strict)**
   - This ensures proper SSL between Cloudflare and Firebase
   - Required for Firebase custom domains

### Add Staging DNS Record

1. In Cloudflare Dashboard, go to **DNS** → **Records**

2. Click **"Add record"**

3. Configure:

   ```
   Type: A
   Name: job-finder-staging
   IPv4 address: 151.101.1.195
   Proxy status: Proxied (orange cloud ON)
   TTL: Auto
   ```

4. Click **"Save"**

5. **Add a second A record** (Firebase provides multiple IPs for redundancy):

   ```
   Type: A
   Name: job-finder-staging
   IPv4 address: 151.101.65.195
   Proxy status: Proxied (orange cloud ON)
   TTL: Auto
   ```

6. Click **"Save"**

### Add Production DNS Record

1. Click **"Add record"** again

2. Configure:

   ```
   Type: A
   Name: job-finder
   IPv4 address: 151.101.1.195
   Proxy status: Proxied (orange cloud ON)
   TTL: Auto
   ```

3. Click **"Save"**

4. **Add a second A record**:

   ```
   Type: A
   Name: job-finder
   IPv4 address: 151.101.65.195
   Proxy status: Proxied (orange cloud ON)
   TTL: Auto
   ```

5. Click **"Save"**

---

## Part 3: Verify in Firebase Console

### Verify Staging Domain

1. Go back to Firebase Console (the page you left open for staging)

2. Click **"Verify"** or **"Check status"**

3. Firebase will check DNS propagation

4. Once verified, click **"Finish"**

5. Wait 5-10 minutes for SSL certificate provisioning

### Verify Production Domain

1. Go back to Firebase Console (the page you left open for production)

2. Click **"Verify"** or **"Check status"**

3. Once verified, click **"Finish"**

4. Wait 5-10 minutes for SSL certificate provisioning

---

## Part 4: Update Environment Files

Update the auth domains in your environment files to match the custom domains.

### Update Staging Environment

```bash
cd /home/jdubz/Development/job-finder-app-manager/worktrees/worker-a-job-finder-FE
```

Edit `.env.staging`:

```bash
# Change from:
VITE_FIREBASE_AUTH_DOMAIN=staging.joshwentworth.com

# To:
VITE_FIREBASE_AUTH_DOMAIN=job-finder-staging.joshwentworth.com
```

### Update Production Environment

Edit `.env.production`:

```bash
# Change from:
VITE_FIREBASE_AUTH_DOMAIN=joshwentworth.com

# To:
VITE_FIREBASE_AUTH_DOMAIN=job-finder.joshwentworth.com
```

---

## Part 5: Update Firebase Auth Authorized Domains

1. Go to [Firebase Console - Authentication](https://console.firebase.google.com/project/static-sites-257923/authentication/settings)

2. Click **"Settings"** tab

3. Scroll to **"Authorized domains"**

4. Click **"Add domain"**

5. Add:
   - `job-finder-staging.joshwentworth.com`
   - `job-finder.joshwentworth.com`

6. Click **"Add"**

---

## Part 6: Rebuild and Redeploy

### Redeploy Staging with New Domain

```bash
cd /home/jdubz/Development/job-finder-app-manager/worktrees/worker-a-job-finder-FE

# Ensure on staging branch
git checkout staging

# Pull latest
git pull origin staging

# Copy staging env (with updated auth domain)
cp .env.staging .env

# Build
npm run build

# Deploy
firebase deploy --only hosting:staging
```

### Test Staging Domain

```bash
# Wait a few minutes for DNS propagation, then test
curl -I https://job-finder-staging.joshwentworth.com

# Should return HTTP 200
```

### Redeploy Production (when ready)

```bash
# Copy production env (with updated auth domain)
cp .env.production .env

# Build
npm run build

# Deploy
firebase deploy --only hosting:production
```

### Test Production Domain

```bash
curl -I https://job-finder.joshwentworth.com

# Should return HTTP 200
```

---

## Part 7: Verify Everything Works

### Staging Verification Checklist

- [ ] `https://job-finder-staging.joshwentworth.com` returns HTTP 200
- [ ] SSL certificate valid (green padlock in browser)
- [ ] Redirects from HTTP to HTTPS automatically
- [ ] Firebase Auth login works
- [ ] No mixed content warnings in console
- [ ] Cloud Functions API calls work

### Production Verification Checklist

- [ ] `https://job-finder.joshwentworth.com` returns HTTP 200
- [ ] SSL certificate valid (green padlock in browser)
- [ ] Redirects from HTTP to HTTPS automatically
- [ ] Firebase Auth login works
- [ ] No mixed content warnings in console
- [ ] Cloud Functions API calls work

---

## Troubleshooting

### DNS Not Resolving

**Problem**: Domain doesn't resolve after adding DNS records

**Solution**:

```bash
# Check DNS propagation
dig job-finder-staging.joshwentworth.com
dig job-finder.joshwentworth.com

# Or use online tool
# https://www.whatsmydns.net/
```

Wait 5-15 minutes for DNS propagation. Cloudflare is usually fast.

### SSL Certificate Error

**Problem**: "Your connection is not private" or certificate error

**Causes**:

1. SSL/TLS mode not set to "Full (strict)" in Cloudflare
2. Certificate still provisioning (wait 10 minutes)
3. Firebase custom domain not verified

**Solution**:

```bash
# Check Cloudflare SSL mode
# Should be: Full (strict)

# Check Firebase custom domain status
firebase hosting:sites:list
```

### Firebase Auth Not Working

**Problem**: Authentication fails or redirects incorrectly

**Causes**:

1. Domain not added to Firebase Auth authorized domains
2. VITE_FIREBASE_AUTH_DOMAIN not updated in .env files
3. App not rebuilt with new environment

**Solution**:

1. Add domains to Firebase Auth authorized domains
2. Update .env files
3. Rebuild: `npm run build`
4. Redeploy: `firebase deploy --only hosting:staging`

### Cloudflare Proxy Issues

**Problem**: Some features not working with Cloudflare proxy

**Solution**:

- Keep orange cloud ON (proxied) for DDoS protection and caching
- If issues persist, try temporarily turning proxy OFF (gray cloud)
- Firebase Hosting works fine with Cloudflare proxy in most cases

### Mixed Content Warnings

**Problem**: HTTP content blocked on HTTPS site

**Check**:

```bash
# Ensure all API URLs use HTTPS
grep -r "http://" .env.staging .env.production
```

All URLs should use `https://`

---

## Cloudflare Additional Configuration (Optional)

### Page Rules for Caching

1. Go to **Rules** → **Page Rules**

2. Create rule for staging:

   ```
   URL: job-finder-staging.joshwentworth.com/*
   Settings:
   - Browser Cache TTL: 4 hours
   - Cache Level: Standard
   ```

3. Create rule for production:
   ```
   URL: job-finder.joshwentworth.com/*
   Settings:
   - Browser Cache TTL: 4 hours
   - Cache Level: Standard
   ```

### Security Settings

1. Go to **Security** → **WAF**

2. Enable **Managed rules** for DDoS protection

3. Consider rate limiting if needed

---

## Expected Timeline

| Step                           | Time              |
| ------------------------------ | ----------------- |
| Add custom domains in Firebase | 5 minutes         |
| Configure Cloudflare DNS       | 5 minutes         |
| DNS propagation                | 5-15 minutes      |
| SSL certificate provisioning   | 5-10 minutes      |
| Update environment files       | 5 minutes         |
| Rebuild and deploy             | 5 minutes         |
| **Total**                      | **30-45 minutes** |

---

## Post-Setup Tasks

### Update Documentation

- [ ] Update `PRODUCTION_CUTOVER_CHECKLIST.md` with actual domains
- [ ] Update `DEPLOYMENT_RUNBOOK.md` with custom domain info
- [ ] Update `README.md` with new URLs

### Update CI/CD (if needed)

If you want to update the URLs shown in GitHub Actions deployment summaries:

Edit `.github/workflows/deploy-staging.yml`:

```yaml
environment:
  name: staging
  url: https://job-finder-staging.joshwentworth.com # Updated
```

Edit `.github/workflows/deploy-production.yml`:

```yaml
environment:
  name: production
  url: https://job-finder.joshwentworth.com # Updated
```

---

## Quick Reference

### Firebase Hosting Sites

- Staging: `job-finder-staging` → https://job-finder-staging.web.app
- Production: `job-finder-production` → https://job-finder-production.web.app

### Custom Domains (New)

- Staging: https://job-finder-staging.joshwentworth.com
- Production: https://job-finder.joshwentworth.com

### Firebase A Record IPs

- Primary: `151.101.1.195`
- Secondary: `151.101.65.195`

### Cloudflare Settings

- SSL/TLS Mode: **Full (strict)**
- Proxy Status: **Proxied (orange cloud ON)**

---

## Support

If you encounter issues:

1. Check Firebase Console for domain verification status
2. Verify Cloudflare SSL mode is "Full (strict)"
3. Wait 15 minutes for DNS/SSL propagation
4. Check Firebase Auth authorized domains
5. Verify environment files have correct auth domain
6. Ensure app was rebuilt and redeployed

---

**Created**: 2025-10-19  
**Last Updated**: 2025-10-19  
**Status**: Ready to implement
