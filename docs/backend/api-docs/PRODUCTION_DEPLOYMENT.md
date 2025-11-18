# Production Deployment Guide

This guide covers deploying the job-finder-BE backend to production with zero downtime.

## Overview

The production deployment process uses a CI/CD-based approach where merging `staging` to `main` triggers automatic deployment to production via GitHub Actions.

**Deployment Strategy**: Blue-green deployment with automatic rollout
**Estimated Time**: 10-15 minutes
**Downtime**: Zero (new versions deployed alongside old)

## Prerequisites

Before deploying to production, ensure:

- ✅ All staging tests have passed
- ✅ Staging environment has been validated
- ✅ Code review and approval completed
- ✅ Team has been notified of deployment window
- ✅ You have access to:
  - GitHub repository (merge permissions)
  - Firebase console (monitoring access)
  - Google Cloud Console (logging access)

## Pre-Deployment Checklist

### 1. Validate Staging

```bash
# Check latest staging deployment
gh run list --repo Jdubz/job-finder-BE --branch staging --limit 1

# Should show: conclusion=success, status=completed
```

### 2. Run Staging Smoke Tests

```bash
# Test all endpoints in staging
STAGING_URL="https://us-central1-static-sites-257923.cloudfunctions.net"

# Test each function manually or use staging smoke tests
curl "$STAGING_URL/manageJobQueue-staging"
curl "$STAGING_URL/manageGenerator-staging"
curl "$STAGING_URL/uploadResume-staging"
curl "$STAGING_URL/manageContentItems-staging"
curl "$STAGING_URL/manageExperience-staging"
```

### 3. Backup Production Data

**CRITICAL**: Always backup before deploying

```bash
./scripts/backup-production.sh
```

This creates:
- Firestore export to GCS
- Function configurations backup
- Security rules backup
- Dependency snapshot

### 4. Notify Stakeholders

Send notification to team:

```
PRODUCTION DEPLOYMENT NOTIFICATION

Start Time: [TIME]
Estimated Duration: 10-15 minutes
Expected Impact: None (zero-downtime deployment)

What's being deployed:
- [List key changes from staging]

Monitoring plan:
- Active monitoring for 2 hours post-deployment
- Smoke tests immediately after deployment
- Full team available for incident response

Contact: [YOUR NAME]
Status updates: [SLACK CHANNEL / EMAIL]
```

## Deployment Process

### Automated Deployment (Recommended)

Use the deployment script for guided deployment:

```bash
./scripts/deploy-production.sh
```

This script will:
1. ✅ Confirm pre-deployment checklist
2. ✅ Run linter, tests, and build
3. ✅ Merge staging to main
4. ✅ Push to trigger CI/CD
5. ✅ Provide monitoring instructions

### Manual Deployment

If you prefer manual control:

```bash
# 1. Ensure you're on latest staging
git checkout staging
git pull origin staging

# 2. Check what will be deployed
git checkout main
git diff main staging

# 3. Merge staging to main
git merge staging

# 4. Push to trigger deployment
git push origin main
```

### Monitor Deployment

```bash
# Watch GitHub Actions
gh run watch --repo Jdubz/job-finder-BE

# Or view in browser
open https://github.com/Jdubz/job-finder-BE/actions
```

Deployment completes when all steps pass:
- ✅ Lint
- ✅ Build
- ✅ Deploy manageJobQueue
- ✅ Deploy manageGenerator
- ✅ Deploy uploadResume
- ✅ Deploy manageContentItems
- ✅ Deploy manageExperience

## Post-Deployment Validation

### 1. Run Production Smoke Tests

**Immediately** after deployment:

```bash
./scripts/smoke-tests-production.sh
```

Expected output: All tests pass (5 basic + 2 authenticated if token set)

### 2. Manual Function Testing

Test each endpoint manually:

```bash
PROD_URL="https://us-central1-static-sites-257923.cloudfunctions.net"

# Test 1: Job Queue
curl "$PROD_URL/manageJobQueue"

# Test 2: Generator
curl "$PROD_URL/manageGenerator"

# Test 3: Resume Upload
curl "$PROD_URL/uploadResume"

# Test 4: Content Items
curl "$PROD_URL/manageContentItems"

# Test 5: Experience
curl "$PROD_URL/manageExperience"
```

All should return HTTP 200-405 (not 500-504).

### 3. Monitor Logs

Monitor for errors in the first 15-30 minutes:

```bash
# View recent logs
gcloud functions logs read \
  --project=static-sites-257923 \
  --limit=100

# Filter for errors
gcloud logging read \
  "resource.type=cloud_function AND severity>=ERROR" \
  --project=static-sites-257923 \
  --limit=50

# Or use Firebase Console
open https://console.firebase.google.com/project/static-sites-257923/functions/logs
```

### 4. Check Metrics

View function performance:

1. Open [Firebase Console](https://console.firebase.google.com/project/static-sites-257923/functions)
2. Check each function for:
   - ✅ Invocations (should be non-zero if traffic exists)
   - ✅ Error rate (should be < 1%)
   - ✅ Execution time (should be within SLA)
   - ✅ Memory usage (should not exceed limits)

### 5. Verify Frontend Integration

If the frontend is deployed:

```bash
# Check frontend is calling production backend
# Open browser dev tools → Network tab
# Verify API calls go to production URLs
open https://job-finder.joshwentworth.com
```

## Rollback Procedure

If issues are detected:

### Immediate Rollback

```bash
./scripts/rollback-production.sh
```

This will:
1. Create a revert commit
2. Push to main to trigger redeployment
3. Restore previous version

### Manual Rollback

```bash
# 1. Find previous commit
git log --oneline main

# 2. Revert to previous version
git revert HEAD

# 3. Push to trigger deployment
git push origin main
```

### Rollback Verification

After rollback:

```bash
# 1. Run smoke tests
./scripts/smoke-tests-production.sh

# 2. Verify logs
gcloud functions logs read --project=static-sites-257923 --limit=50

# 3. Check metrics
# Firebase Console → Functions → check error rates
```

## Rollback Triggers

Initiate rollback if:

- ❌ Error rate > 10%
- ❌ Function timeouts > 20% of requests
- ❌ Complete function failure
- ❌ Critical security vulnerability discovered
- ❌ Data corruption detected
- ❌ Frontend integration broken

## Monitoring

### Active Monitoring (First 2 Hours)

Team should monitor:

1. **Error Logs**: Check every 15 minutes
   ```bash
   gcloud logging read \
     "resource.type=cloud_function AND severity>=ERROR" \
     --project=static-sites-257923 \
     --limit=20 \
     --freshness=15m
   ```

2. **Function Metrics**: Check Firebase Console
   - Error rate trends
   - Latency trends
   - Memory usage

3. **User Reports**: Monitor support channels

### Ongoing Monitoring

Set up alerts for:
- High error rate (> 5%)
- High latency (p95 > 10s)
- Memory exceeded
- Function crashes

## Troubleshooting

### Deployment Failed

```bash
# Check GitHub Actions logs
gh run view --repo Jdubz/job-finder-BE

# Check for:
# - Build errors (TypeScript compilation)
# - Test failures
# - Deployment permissions issues
```

### Functions Not Responding

```bash
# Check function status
gcloud functions list --project=static-sites-257923

# Check function logs
gcloud functions logs read FUNCTION_NAME \
  --project=static-sites-257923 \
  --limit=50
```

### High Error Rate

```bash
# View errors
gcloud logging read \
  "resource.type=cloud_function AND severity=ERROR" \
  --project=static-sites-257923 \
  --limit=100 \
  --format=json

# Analyze patterns
# - Which function?
# - What error message?
# - Specific user/request pattern?
```

## Post-Deployment Tasks

After successful deployment:

### 1. Update Documentation

- [ ] Update API documentation with production URLs
- [ ] Update README with current version
- [ ] Document any changes or gotchas

### 2. Clean Up

- [ ] Delete old backups (keep last 7 days)
- [ ] Update issue tracker
- [ ] Close deployment issue

### 3. Team Communication

Send success notification:

```
✅ PRODUCTION DEPLOYMENT SUCCESSFUL

Deployed at: [TIME]
Duration: [X minutes]
Status: All functions healthy

Deployed Functions:
- manageJobQueue
- manageGenerator
- uploadResume
- manageContentItems
- manageExperience

Monitoring:
- Error rate: < 1%
- Latency: Within SLA
- All smoke tests passed

Monitoring will continue for 2 hours.
Contact [NAME] with any issues.
```

## Emergency Contacts

- **On-Call Engineer**: [NAME/PHONE]
- **Backup Engineer**: [NAME/PHONE]
- **Project Lead**: [NAME/PHONE]

## References

- [GitHub Actions](https://github.com/Jdubz/job-finder-BE/actions)
- [Firebase Console](https://console.firebase.google.com/project/static-sites-257923)
- [Cloud Console](https://console.cloud.google.com/functions?project=static-sites-257923)
- [Backend Architecture](./architecture/SYSTEM_ARCHITECTURE.md)

---

**Last Updated**: 2025-10-20
**Version**: 1.0.0
