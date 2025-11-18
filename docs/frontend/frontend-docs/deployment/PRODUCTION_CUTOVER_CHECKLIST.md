# Production Cutover Readiness Checklist

> **Readiness Summary (2025-10-20 18:00 UTC)**
> - Frontend: ⚠️ — Deploy workflows structured; GitHub environments/secrets provisioned, environment matrix pending DATA-QA-1 handoff.
> - Backend: ⚠️ — Staging Cloud Functions verified; production workflow pending CI repair and auth validation.
> - Worker: 🚫 — Queue smoke test and monitoring baseline not yet executed (DATA-QA-1 outstanding).

**Task**: FE-RECOVERY-3  
**Owner**: Worker A (coordinating with Worker B and PM)  
**Target Date**: TBD by PM  
**Status**: In Progress

---

## Overview

This checklist ensures the Job Finder frontend is ready for production deployment with zero downtime and comprehensive rollback capability.

---

## Pre-Cutover Requirements

### 1. Infrastructure ✅

- [x] Staging environment deployed and accessible
- [x] Production Firebase Hosting site configured
- [x] Firebase project verified (static-sites-257923)
- [x] DNS records exist for both environments
- [x] SSL certificates valid and active
- [x] Custom domain configured
  - Public staging: `https://job-finder-staging.joshwentworth.com` (Cloudflare proxy → `https://job-finder-staging.web.app`)
  - Public production: `https://job-finder.joshwentworth.com` (Cloudflare proxy → `https://job-finder-production.web.app`)

### 2. Deployment Pipeline ✅

- [x] GitHub Actions workflows configured
- [x] Staging deployment workflow tested
- [x] Production deployment workflow created
- [ ] GitHub Environments configured
  - [ ] `staging` environment created
  - [ ] `production` environment created with approval
- [ ] GitHub Secrets configured
  - [ ] `FIREBASE_SERVICE_ACCOUNT` added
  - [ ] Service account permissions verified
- [x] Deployment runbook documented
- [x] Secrets setup guide created

### 3. Code Quality

- [x] All linting passes on staging
- [x] TypeScript compilation clean
- [ ] Unit tests passing (requires test implementation)
- [ ] E2E smoke tests passing (requires test implementation)
- [x] No console errors in staging
- [x] Build size acceptable (209.75 kB gzipped)

### 4. Backend Integration

- [x] Staging Cloud Functions accessible
  - [x] `manageJobQueue-staging` (401 ✓)
  - [x] `manageGenerator-staging` (401 ✓)
  - [x] `manageExperience-staging` (401 ✓)
  - [x] `manageContentItems-staging` (401 ✓)
  - [x] `contact-form-staging` (401 ✓)
- [ ] Production Cloud Functions verified
  - [ ] `manageJobQueue` deployed
  - [ ] `manageGenerator` deployed
  - [ ] `manageExperience` deployed
  - [ ] `manageContentItems` deployed
  - [ ] `contact-form` deployed
- [x] Environment variables correct for both environments
- [x] Firestore database IDs correct
  - Staging: `portfolio-staging`
  - Production: `(default)`

### 5. Authentication & Security

- [x] Firebase Auth configured
- [x] Security headers implemented
- [x] Content Security Policy configured
- [x] CORS configuration correct
- [x] HTTPS enforced
- [x] App Check ready (if needed)
- [ ] Production auth domain verified

---

## Smoke Test Plan

### Worker B Coordination Required

**Contact Worker B for UI testing once staging is verified**

#### Critical User Flows to Test

##### Authentication Flow

- [ ] User can access login page
- [ ] User can sign in with Google
- [ ] User can sign in with email/password
- [ ] User session persists on refresh
- [ ] User can sign out
- [ ] Unauthorized access redirects to login

##### Job Applications Page

- [ ] Page loads without errors
- [ ] Job matches display correctly
- [ ] Filters work (score, status, date)
- [ ] Search functionality works
- [ ] Job details modal opens
- [ ] Pagination works
- [ ] Real-time updates work (if implemented)

##### Job Finder Page

- [ ] Page loads without errors
- [ ] LinkedIn URL input accepts valid URLs
- [ ] Form validation works
- [ ] Job submission succeeds
- [ ] Success message displays
- [ ] Submitted job appears in queue

##### Document Builder Page

- [ ] Page loads without errors
- [ ] Job selection works
- [ ] Experience selection works
- [ ] Generate resume works
- [ ] Generate cover letter works
- [ ] Generated documents downloadable
- [ ] Document preview works

##### Document History Page

- [ ] Page loads without errors
- [ ] Document list displays
- [ ] Document download works
- [ ] Document filtering works
- [ ] Document search works

##### Queue Management Page

- [ ] Page loads without errors
- [ ] Queue items display
- [ ] Queue status updates
- [ ] Queue actions work (retry, cancel)
- [ ] Real-time updates work

##### Settings & Configuration (Editor Role)

- [ ] Settings page accessible
- [ ] Job Finder Config page accessible
- [ ] AI Prompts page accessible
- [ ] Configuration saves correctly
- [ ] Validation works

#### Performance Tests

- [ ] Page load time < 3 seconds
- [ ] Time to Interactive < 5 seconds
- [ ] No layout shift on load
- [ ] Images load properly
- [ ] Lazy loading works

#### Browser Compatibility

- [ ] Chrome/Chromium latest
- [ ] Firefox latest
- [ ] Safari latest (if Mac available)
- [ ] Edge latest
- [ ] Mobile responsive (Chrome mobile)

---

## Production Deployment Plan

### Phase 1: Pre-Deployment (H-1 hour)

**Time**: 1 hour before deployment

- [ ] **PM Approval**: Get final go-ahead from PM
- [ ] **Team Notification**: Alert team that deployment is starting
- [ ] **Backup Verification**: Confirm current production version is tagged
- [ ] **Monitoring Setup**: Prepare monitoring dashboards
- [ ] **Communication Channels**: Open Slack/Discord for coordination

### Phase 2: Deployment (H-0)

**Time**: Deployment execution

1. [ ] **Create Production PR**

   ```bash
   # In job-finder-FE repository
   git checkout staging
   git pull origin staging
   git checkout main
   git pull origin main
   git merge staging
   # Resolve any conflicts
   git push origin main
   ```

2. [ ] **Monitor GitHub Actions**
   - Watch workflow at: https://github.com/Jdubz/job-finder-FE/actions
   - Verify quality checks pass
   - Provide environment approval when prompted
3. [ ] **Verify Deployment Success**
   ```bash

   ```

# Check HTTP status (Cloudflare front door; origin remains https://job-finder-production.web.app)

curl -I https://job-finder.joshwentworth.com

# Check Cloud Functions

for func in manageJobQueue manageGenerator manageExperience manageContentItems contact-form; do
echo -n "$func: "
     curl -s -o /dev/null -w "%{http_code}\n" "https://us-central1-static-sites-257923.cloudfunctions.net/$func"
done

````

4. [ ] **Tag Deployment**
```bash
git tag -a "v1.0.0-production" -m "Initial production deployment"
git push origin --tags
````

### Phase 3: Verification (H+15 min)

**Time**: 15 minutes after deployment

- [ ] **Smoke Tests**: Run critical user flow tests
- [ ] **Browser Check**: Test in multiple browsers
- [ ] **Mobile Check**: Test on mobile device
- [ ] **Performance Check**: Run Lighthouse audit
- [ ] **Error Monitoring**: Check for console errors
- [ ] **Analytics**: Verify analytics loading

### Phase 4: Monitoring (H+1 hour)

**Time**: First hour after deployment

- [ ] **Monitor Firebase Console**: Check for errors
- [ ] **Monitor GitHub Actions**: Watch for any failed workflows
- [ ] **Check User Reports**: Monitor for user complaints
- [ ] **Review Metrics**: Check performance metrics
- [ ] **Team Status Update**: Report status to PM

---

## Rollback Plan

### When to Rollback

Execute rollback immediately if:

- ❌ Site returns 404 or 500 errors
- ❌ Authentication completely broken
- ❌ Critical user flow completely broken
- ❌ Data corruption detected
- ❌ Security vulnerability discovered

### Rollback Procedure

**Time to Execute**: 2-3 minutes

```bash
# 1. IMMEDIATE ROLLBACK
firebase hosting:rollback --site job-finder-production

# 2. Verify rollback
curl -I https://job-finder.joshwentworth.com  # Cloudflare proxy (origin: https://job-finder-production.web.app)

# 3. Notify team
echo "Production rolled back at $(date)" >> deployment.log

# 4. Create incident issue
# Go to GitHub and create issue with details

# 5. Schedule post-mortem
# Coordinate with PM for root cause analysis
```

### Post-Rollback Actions

- [ ] Document what went wrong
- [ ] Create GitHub issue for the problem
- [ ] Fix issue in staging first
- [ ] Re-verify in staging thoroughly
- [ ] Schedule new deployment attempt

---

## Communication Plan

### Pre-Deployment

**Audience**: Team  
**Channel**: Slack/Discord  
**Message Template**:

```
🚀 DEPLOYMENT NOTICE 🚀

Job Finder Frontend - Production Deployment
Time: [Time] [Timezone]
Duration: ~15 minutes
Expected Downtime: None (zero-downtime deployment)

Deployer: Worker A
Approver: PM

We'll update this thread with progress.
```

### During Deployment

**Updates every 5 minutes**:

- ✅ Quality checks passed
- ✅ Deployment started
- ✅ Deployment completed
- ✅ Verification in progress
- ✅ All systems green

### Post-Deployment

**Success Message**:

```
✅ DEPLOYMENT COMPLETE ✅

Job Finder Frontend is now live in production!

Public URL: https://job-finder.joshwentworth.com (Cloudflare)
Origin URL: https://job-finder-production.web.app (Firebase)
Version: v1.0.0-production
Status: All systems operational

Smoke tests: PASSED ✅
Performance: Within targets ✅
No errors detected ✅

Monitoring will continue for the next hour.
```

**Failure Message**:

```
⚠️ DEPLOYMENT ISSUE ⚠️

An issue was detected during deployment.
Action: Rollback executed
Status: Previous version restored

The team is investigating. We'll update you shortly.

Current status: https://job-finder.joshwentworth.com (Cloudflare) is stable
```

---

## Post-Deployment Tasks

### Immediate (H+1 hour)

- [ ] Verify all smoke tests pass
- [ ] Confirm analytics working
- [ ] Check error rates are normal
- [ ] Monitor performance metrics
- [ ] Document any issues found

### Short-term (H+24 hours)

- [ ] Review deployment logs
- [ ] Check user feedback
- [ ] Verify all features working
- [ ] Monitor error rates
- [ ] Review performance trends

### Medium-term (Week 1)

- [ ] Conduct deployment retrospective
- [ ] Document lessons learned
- [ ] Update runbooks if needed
- [ ] Optimize any performance issues
- [ ] Plan next deployment improvements

---

## Success Criteria

Deployment is considered successful when:

- ✅ Site accessible with HTTP 200
- ✅ All critical user flows working
- ✅ No JavaScript console errors
- ✅ Authentication working
- ✅ Cloud Functions accessible
- ✅ Performance within acceptable range
- ✅ No data loss or corruption
- ✅ Analytics working
- ✅ Monitoring active
- ✅ No critical user complaints

---

## Risk Assessment

### High Risk Items

| Risk                     | Mitigation              | Rollback Time     |
| ------------------------ | ----------------------- | ----------------- |
| Authentication failure   | Pre-test in staging     | 2 minutes         |
| API endpoint errors      | Verify staging CF first | 2 minutes         |
| Build/deployment failure | Automated tests         | 2 minutes         |
| Performance degradation  | Load test staging       | 5 minutes         |
| Browser compatibility    | Test multiple browsers  | N/A (client-side) |

### Low Risk Items

- UI styling issues (non-breaking)
- Non-critical feature bugs
- Performance optimizations
- Analytics tracking issues

---

## Dependencies & Coordination

### External Dependencies

- **Firebase Hosting**: Assumes no outages
- **Cloud Functions**: Backend must be deployed first
- **GitHub Actions**: CI/CD pipeline operational
- **DNS**: Domain resolution working

### Team Coordination

**Worker B** (Frontend Specialist):

- [ ] Conduct comprehensive UI smoke tests
- [ ] Test all user flows in staging
- [ ] Verify mobile responsiveness
- [ ] Report any issues found

**PM** (Project Manager):

- [ ] Provide final deployment approval
- [ ] Approve environment protection in GitHub
- [ ] Monitor deployment progress
- [ ] Coordinate with stakeholders

**Worker A** (You):

- [x] Infrastructure and deployment setup
- [ ] Execute deployment
- [ ] Monitor and verify
- [ ] Handle rollback if needed

---

## Open Questions for PM

- [ ] **Target Domain**: Should we use custom domain or stick with Firebase default?
  - Current: `https://job-finder.joshwentworth.com` (Cloudflare) → origin `https://job-finder-production.web.app`
  - Custom: `app.joshwentworth.com` or similar?

- [ ] **Deployment Window**: When should we do the production cutover?
  - Recommended: Low-traffic period (weekend or evening)
- [ ] **User Communication**: Do we need to notify existing users?
  - If yes: Need to draft communication

- [ ] **Analytics Setup**: Which analytics platform?
  - Google Analytics 4?
  - Custom solution?
- [ ] **Monitoring**: What level of monitoring is required?
  - Basic: Firebase Console
  - Advanced: Sentry, DataDog, etc.?

- [ ] **Compliance**: Any compliance requirements?
  - Cookie consent banner?
  - GDPR notices?
  - Terms of service?

---

## Next Actions

### For Worker A

- [x] Create this cutover checklist
- [ ] Configure GitHub Environments
- [ ] Add FIREBASE_SERVICE_ACCOUNT secret
- [ ] Test staging smoke tests
- [ ] Coordinate with Worker B for UI testing
- [ ] Schedule deployment with PM

### For Worker B

- [ ] Review smoke test plan
- [ ] Execute smoke tests on staging
- [ ] Report any issues found
- [ ] Prepare for production verification

### For PM

- [ ] Review and approve checklist
- [ ] Answer open questions above
- [ ] Set deployment date/time
- [ ] Approve GitHub Environment protection
- [ ] Prepare stakeholder communication

---

**Status**: Awaiting PM approval and Worker B smoke tests  
**Last Updated**: 2025-10-19  
**Next Review**: After Worker B completes smoke tests
