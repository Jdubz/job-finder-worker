# Frontend Deployment Runbook

**Last Updated**: 2025-10-19  
**Owner**: Worker A  
**Status**: Active

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [GitHub Setup](#github-setup)
4. [Automated Deployments](#automated-deployments)
5. [Manual Deployments](#manual-deployments)
6. [Rollback Procedures](#rollback-procedures)
7. [Monitoring & Verification](#monitoring--verification)
8. [Troubleshooting](#troubleshooting)
9. [Emergency Contacts](#emergency-contacts)

---

## Overview

The Job Finder frontend is deployed using Firebase Hosting with automated CI/CD via GitHub Actions. We maintain two environments (Cloudflare serves as the public entry point while Firebase Hosting remains the origin):

- **Staging**: https://job-finder-staging.joshwentworth.com (Cloudflare) → https://job-finder-staging.web.app (Firebase origin)
- **Production**: https://job-finder.joshwentworth.com (Cloudflare) → https://job-finder-production.web.app (Firebase origin)

### Architecture

- **Build Tool**: Vite 7.x
- **Hosting**: Firebase Hosting
- **CI/CD**: GitHub Actions
- **Project**: static-sites-257923

---

## Prerequisites

### Required Access

- GitHub repository write access
- Firebase project access (static-sites-257923)
- Firebase CLI installed and authenticated

### Required Tools

```bash
# Node.js 20+
node --version  # Should be 20.x or higher

# npm
npm --version

# Firebase CLI
npm install -g firebase-tools
firebase --version  # Should be 14.x or higher
```

### Authentication

```bash
# Login to Firebase
firebase login

# Verify access to project
firebase projects:list
```

---

## GitHub Setup

### Step 1: Configure GitHub Environments

1. Go to **Repository Settings** → **Environments**
2. Create two environments:

#### Staging Environment

- **Name**: `staging`
- **Deployment branches**: Only `staging` branch
- **Environment secrets**: None needed (uses repository secrets)
- **Protection rules**: None (auto-deploy on push)

#### Production Environment

- **Name**: `production`
- **Deployment branches**: Only `main` branch
- **Protection rules**:
  - ✅ Required reviewers (at least 1 reviewer - PM)
  - ✅ Wait timer: 0 minutes
- **Environment secrets**: None needed (uses repository secrets)

### Step 2: Configure Repository Secrets

Go to **Repository Settings** → **Secrets and variables** → **Actions**

#### Required Secret

**`FIREBASE_SERVICE_ACCOUNT`** - Firebase service account JSON

To generate this secret:

```bash
# 1. Go to Firebase Console
# https://console.firebase.google.com/project/static-sites-257923/settings/serviceaccounts/adminsdk

# 2. Click "Generate new private key"
# 3. Download the JSON file
# 4. Copy the ENTIRE JSON content (as single line)
# 5. Add as GitHub secret named FIREBASE_SERVICE_ACCOUNT
```

**Secret permissions required**:

- Firebase Hosting Admin
- Cloud Functions Viewer (optional, for verification)

#### Optional Secrets (for future enhancements)

- `SENTRY_DSN` - Error tracking
- `SLACK_WEBHOOK_URL` - Deployment notifications
- `DATADOG_API_KEY` - Performance monitoring

### Step 3: Verify Workflow Files

Ensure the following workflow files exist:

```
.github/workflows/
├── ci.yml                    # Quality checks on PRs
├── deploy-staging.yml        # Auto-deploy to staging
├── deploy-production.yml     # Auto-deploy to production
└── pr-checks.yml             # PR validation
```

---

## Automated Deployments

### Staging Deployment

**Trigger**: Push to `staging` branch

**Process**:

1. Quality checks run (lint, type-check, tests)
2. Build application with `.env.staging` configuration
3. Deploy to Firebase Hosting staging site
4. Verify deployment accessibility
5. Test Cloud Functions connectivity

**Typical Duration**: 3-5 minutes

**Monitoring**:

```bash
# Watch GitHub Actions
# https://github.com/Jdubz/job-finder-FE/actions

# Monitor deployment
firebase hosting:channel:list --site job-finder-staging
```

### Production Deployment

**Trigger**: Push to `main` branch (requires PR merge)

**Process**:

1. Quality checks run (lint, type-check, tests, E2E smoke tests)
2. Requires manual approval (if environment protection is enabled)
3. Build application with `.env.production` configuration
4. Deploy to Firebase Hosting production site
5. Verify deployment accessibility
6. Test Cloud Functions connectivity
7. Create deployment tag

**Typical Duration**: 5-7 minutes (including approval wait time)

**Approval Process**:

1. PR must be approved and merged to `main`
2. Deployment waits for environment approval (if configured)
3. PM or authorized reviewer approves deployment
4. Deployment proceeds automatically

---

## Manual Deployments

### When to Use Manual Deployment

- Emergency hotfix needed immediately
- Automated pipeline is broken
- Testing deployment process
- Rollback to specific version

### Staging Manual Deploy

```bash
# 1. Navigate to worktree
cd /home/jdubz/Development/job-finder-app-manager/worktrees/worker-a-job-finder-FE

# 2. Ensure on correct branch
git checkout staging
git pull origin staging

# 3. Install dependencies
npm ci

# 4. Copy staging environment
cp .env.staging .env

# 5. Build
npm run build

# 6. Verify build
ls -la dist/

# 7. Deploy
firebase deploy --only hosting:staging

# 8. Verify
curl -I https://job-finder-staging.joshwentworth.com  # Cloudflare proxy (origin remains https://job-finder-staging.web.app)
```

### Production Manual Deploy

```bash
# 1. Navigate to worktree
cd /home/jdubz/Development/job-finder-app-manager/worktrees/worker-a-job-finder-FE

# 2. Ensure on correct branch
git checkout main
git pull origin main

# 3. Install dependencies
npm ci

# 4. Run tests
npm test
npm run lint
npm run type-check

# 5. Copy production environment
cp .env.production .env

# 6. Build
npm run build

# 7. Verify build
ls -la dist/

# 8. Deploy (CAUTION: PRODUCTION!)
firebase deploy --only hosting:production

# 9. Verify
curl -I https://job-finder.joshwentworth.com  # Cloudflare proxy (origin remains https://job-finder-production.web.app)

# 10. Tag deployment
git tag -a "deploy-prod-$(date +%Y%m%d-%H%M%S)" -m "Production deployment $(date)"
git push origin --tags
```

---

## Rollback Procedures

### Quick Rollback (Recommended)

Firebase Hosting keeps previous versions available for instant rollback.

#### Staging Rollback

```bash
# List recent deployments
firebase hosting:clone --site job-finder-staging

# Or rollback to previous version
firebase hosting:rollback --site job-finder-staging

# Verify
curl -I https://job-finder-staging.joshwentworth.com  # Cloudflare proxy (origin: https://job-finder-staging.web.app)
```

#### Production Rollback

```bash
# ⚠️ PRODUCTION ROLLBACK - USE WITH CAUTION

# List recent deployments
firebase hosting:clone --site job-finder-production

# Rollback to previous version
firebase hosting:rollback --site job-finder-production

# Verify immediately
curl -I https://job-finder.joshwentworth.com  # Cloudflare proxy (origin: https://job-finder-production.web.app)

# Notify team
echo "Production rolled back at $(date)" | tee -a rollback.log
```

### Rollback to Specific Version

```bash
# 1. Find the commit/tag you want to rollback to
git tag -l "deploy-prod-*" | tail -5

# 2. Checkout that version
git checkout deploy-prod-20251019-120000

# 3. Follow manual deployment steps above

# 4. After successful deployment, update main branch if needed
```

### Emergency Rollback Checklist

- [ ] Identify issue and confirm rollback is needed
- [ ] Notify team in Slack/Discord/Email
- [ ] Execute rollback command
- [ ] Verify site is accessible
- [ ] Test critical user flows
- [ ] Document incident and root cause
- [ ] Create issue for proper fix
- [ ] Schedule post-mortem if needed

---

## Monitoring & Verification

### Post-Deployment Checks

#### Automated Checks (in CI/CD)

- ✅ Site returns HTTP 200
- ✅ Cloud Functions endpoints accessible (401 = auth required = OK)
- ✅ Build artifacts present

#### Manual Verification Checklist

**Staging**:

- [ ] Site loads: https://job-finder-staging.joshwentworth.com (Cloudflare) → confirm origin via https://job-finder-staging.web.app if needed
- [ ] Login page accessible
- [ ] Firebase Auth works
- [ ] API calls to Cloud Functions work (check Network tab)
- [ ] No console errors

- **Production** (additional checks):
- [ ] All staging checks pass (Cloudflare front door: https://job-finder.joshwentworth.com; origin: https://job-finder-production.web.app)
- [ ] Analytics loading correctly
- [ ] No broken links in navigation
- [ ] Job application flow works
- [ ] Document generation works
- [ ] User profile accessible

### Cloud Functions Connectivity Test

```bash
# Test all staging endpoints
for func in manageJobQueue-staging manageGenerator-staging manageExperience-staging manageContentItems-staging contact-form-staging; do
  echo -n "$func: "
  curl -s -o /dev/null -w "%{http_code}\n" "https://us-central1-static-sites-257923.cloudfunctions.net/$func"
done

# Test all production endpoints
for func in manageJobQueue manageGenerator manageExperience manageContentItems contact-form; do
  echo -n "$func: "
  curl -s -o /dev/null -w "%{http_code}\n" "https://us-central1-static-sites-257923.cloudfunctions.net/$func"
done

# Expected: 401 (requires authentication) or 200 (public endpoint)
```

### Performance Monitoring

```bash
# Check build size
du -sh dist/
du -h dist/assets/*.js | sort -h | tail -5

# Check response times
time curl -I https://job-finder-staging.joshwentworth.com  # Cloudflare proxy (origin: https://job-finder-staging.web.app)
time curl -I https://job-finder.joshwentworth.com  # Cloudflare proxy (origin: https://job-finder-production.web.app)

# Lighthouse audit (requires Chrome)
npx lighthouse https://job-finder.joshwentworth.com --output html --output-path ./lighthouse-report.html  # Run against Cloudflare front door (origin: https://job-finder-production.web.app)
```

---

## Troubleshooting

### Build Fails

**Symptom**: `npm run build` fails

**Common Causes**:

1. TypeScript errors
2. Missing dependencies
3. Environment variable issues
4. Memory issues

**Solutions**:

```bash
# Check TypeScript errors
npm run type-check

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Check environment file
cat .env.staging  # or .env.production

# Increase Node memory (if needed)
NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

### Deployment Fails

**Symptom**: Firebase deployment fails

**Common Causes**:

1. Authentication issues
2. Wrong project/target
3. Build artifacts missing
4. Permission issues

**Solutions**:

```bash
# Re-authenticate
firebase logout
firebase login

# Verify project
firebase use static-sites-257923
firebase target:apply hosting staging job-finder-staging
firebase target:apply hosting production job-finder-production

# Check build output
ls -la dist/

# Deploy with debug
firebase deploy --only hosting:staging --debug
```

### Site Returns 404

**Symptom**: Deployed site shows 404

**Causes**:

1. Wrong hosting target
2. Build artifacts not uploaded
3. Routing configuration issue

**Solutions**:

```bash
# Check hosting configuration
cat firebase.json

# Verify deployment
firebase hosting:channel:list --site job-finder-staging

# Check recent deployments
firebase hosting:sites:list

# Redeploy
firebase deploy --only hosting:staging
```

### Cloud Functions Not Accessible

**Symptom**: Frontend can't reach Cloud Functions

**Causes**:

1. Wrong endpoint URL
2. Functions not deployed
3. CORS issues
4. Authentication problems

**Solutions**:

```bash
# Check function URLs in environment
cat .env.staging

# List deployed functions
firebase functions:list --project static-sites-257923

# Test function directly
curl -i https://us-central1-static-sites-257923.cloudfunctions.net/manageJobQueue-staging

# Check CORS configuration in function code
```

### Large Bundle Size Warning

**Symptom**: Build warns about large chunks

**Impact**: Low (gzipped size is acceptable)

**Future Optimization**:

```typescript
// Implement dynamic imports in routes
const JobApplicationsPage = lazy(() => import('./pages/JobApplicationsPage'))

// Configure manual chunks in vite.config.ts
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'react-vendor': ['react', 'react-dom', 'react-router-dom'],
        'firebase-vendor': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
      }
    }
  }
}
```

---

## Emergency Contacts

### Team

- **PM**: [Contact info]
- **Worker A** (Backend/DevOps): [Contact info]
- **Worker B** (Frontend): [Contact info]

### Escalation Path

1. Check GitHub Actions logs
2. Check Firebase Console logs
3. Contact Worker A (deployment specialist)
4. Contact PM for business decisions
5. If critical production issue, execute rollback immediately

### Resources

- **Firebase Console**: https://console.firebase.google.com/project/static-sites-257923
- **GitHub Actions**: https://github.com/Jdubz/job-finder-FE/actions
- **Documentation**: `/docs/architecture/FE_DEPLOYMENT_PLAN.md`
- **This Runbook**: `/DEPLOYMENT_RUNBOOK.md`

---

## Appendix

### Environment Variables Reference

#### Staging (.env.staging)

```bash
VITE_FIREBASE_PROJECT_ID=static-sites-257923
VITE_FIREBASE_AUTH_DOMAIN=staging.joshwentworth.com
VITE_API_BASE_URL=https://us-central1-static-sites-257923.cloudfunctions.net
VITE_FIRESTORE_DATABASE_ID=portfolio-staging
VITE_ENVIRONMENT=staging
```

#### Production (.env.production)

```bash
VITE_FIREBASE_PROJECT_ID=static-sites-257923
VITE_FIREBASE_AUTH_DOMAIN=joshwentworth.com
VITE_API_BASE_URL=https://us-central1-static-sites-257923.cloudfunctions.net
VITE_FIRESTORE_DATABASE_ID=(default)
VITE_ENVIRONMENT=production
```

### Useful Commands

```bash
# Check Firebase project
firebase use

# List hosting sites
firebase hosting:sites:list

# List hosting channels
firebase hosting:channel:list --site job-finder-staging

# Preview locally
npm run preview

# Build and analyze
npm run build
npx vite-bundle-visualizer

# Clear caches
rm -rf node_modules/.vite dist/
```

### Change Log

| Date       | Version | Changes                                | Author   |
| ---------- | ------- | -------------------------------------- | -------- |
| 2025-10-19 | 1.0     | Initial runbook created                | Worker A |
| 2025-10-19 | 1.1     | Added automated pipeline documentation | Worker A |

---

**END OF RUNBOOK**
