# DNS Setup - Action Required (PM)

**Date**: 2025-10-19  
**Priority**: P1 - Required before production cutover  
**Estimated Time**: 30-45 minutes  
**Status**: ⏳ Awaiting PM execution

---

## Summary

Custom domains are ready to be connected:

- **Staging**: `job-finder-staging.joshwentworth.com`
- **Production**: `job-finder.joshwentworth.com`

Environment files have been updated. DNS configuration is needed next.

---

## PM Action Items

### 1️⃣ Firebase Console - Add Custom Domains (10 min)

**Staging Domain:**

1. Go to https://console.firebase.google.com/project/static-sites-257923/hosting/sites/job-finder-staging
2. Click "Add custom domain"
3. Enter: `job-finder-staging.joshwentworth.com`
4. Copy the A record IP addresses shown (usually `151.101.1.195` and `151.101.65.195`)
5. **Keep this tab open** for verification later

**Production Domain:**

1. Go to https://console.firebase.google.com/project/static-sites-257923/hosting/sites/job-finder-production
2. Click "Add custom domain"
3. Enter: `job-finder.joshwentworth.com`
4. Copy the A record IP addresses shown
5. **Keep this tab open** for verification later

---

### 2️⃣ Cloudflare - Configure DNS (10 min)

**Prerequisites:**

1. Login to Cloudflare Dashboard
2. Select `joshwentworth.com` domain
3. Go to **SSL/TLS** → **Overview**
4. Set mode to: **Full (strict)** ⚠️ IMPORTANT

**Add DNS Records:**

Go to **DNS** → **Records**, then add these 4 records:

```
# Staging - Record 1
Type: A
Name: job-finder-staging
IPv4: 151.101.1.195
Proxy: ON (orange cloud ☁️)
TTL: Auto

# Staging - Record 2
Type: A
Name: job-finder-staging
IPv4: 151.101.65.195
Proxy: ON (orange cloud ☁️)
TTL: Auto

# Production - Record 1
Type: A
Name: job-finder
IPv4: 151.101.1.195
Proxy: ON (orange cloud ☁️)
TTL: Auto

# Production - Record 2
Type: A
Name: job-finder
IPv4: 151.101.65.195
Proxy: ON (orange cloud ☁️)
TTL: Auto
```

---

### 3️⃣ Firebase Console - Verify Domains (15 min)

**Wait 5 minutes for DNS propagation**, then:

1. Go back to the Firebase Console tabs you left open
2. Click "Verify" or "Check status" for both domains
3. Wait for green checkmark
4. Firebase will provision SSL certificates (5-10 minutes)

---

### 4️⃣ Firebase Auth - Add Authorized Domains (2 min)

1. Go to https://console.firebase.google.com/project/static-sites-257923/authentication/settings
2. Scroll to "Authorized domains"
3. Click "Add domain"
4. Add: `job-finder-staging.joshwentworth.com`
5. Click "Add domain" again
6. Add: `job-finder.joshwentworth.com`

---

### 5️⃣ Verify Setup (5 min)

**Test Staging:**

```bash
curl -I https://job-finder-staging.joshwentworth.com
# Should return: HTTP/2 200
```

**Test Production:**

```bash
curl -I https://job-finder.joshwentworth.com
# Should return: HTTP/2 200
```

**Browser Test:**

- Open https://job-finder-staging.joshwentworth.com
- Check for green padlock (SSL working)
- Site should load correctly

---

## What's Already Done ✅

- [x] Environment files updated with custom auth domains
- [x] `.env.staging` → `VITE_FIREBASE_AUTH_DOMAIN=job-finder-staging.joshwentworth.com`
- [x] `.env.production` → `VITE_FIREBASE_AUTH_DOMAIN=job-finder.joshwentworth.com`
- [x] Comprehensive setup guide created: `CUSTOM_DOMAIN_SETUP.md`

---

## After DNS is Complete

Worker A will:

1. Redeploy staging with updated auth domain
2. Test Firebase Auth with custom domain
3. Verify all Cloud Functions still work
4. Update production cutover checklist

---

## Troubleshooting

**If domains don't resolve after 15 minutes:**

```bash
# Check DNS propagation
dig job-finder-staging.joshwentworth.com
dig job-finder.joshwentworth.com
```

**If SSL certificate error:**

- Verify Cloudflare SSL mode is "Full (strict)"
- Wait 10 minutes for certificate provisioning
- Check Firebase Console for domain verification status

**Need help?**

- Full guide: `/worktrees/worker-a-job-finder-FE/CUSTOM_DOMAIN_SETUP.md`
- Contact Worker A for technical assistance

---

## Quick Reference

**Firebase Project:** static-sites-257923  
**Cloudflare Domain:** joshwentworth.com  
**Firebase IPs:** 151.101.1.195, 151.101.65.195  
**SSL Mode:** Full (strict)  
**Proxy Status:** ON (orange cloud)

---

**Created by**: Worker A  
**Status**: Ready for PM execution  
**Urgency**: P1 - Required before production cutover
