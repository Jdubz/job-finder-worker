# CI/CD Pipeline Documentation

## Overview

Simple, effective, and maintainable CI/CD pipeline for job-finder-FE. Optimized for speed and reliability.

## Workflows

### 1. PR Checks (`pr-checks.yml`)
**Trigger:** Pull requests to `main`  
**Purpose:** Ensure code quality before merging  
**Duration:** ~2-3 minutes

**Checks:**
- ✅ Linting (ESLint)
- ✅ Type checking (TypeScript)
- ✅ Code formatting (Prettier)
- ✅ Unit tests (fast, reliable)
- ✅ Build verification

**Required for merge:** ✅ Yes

**Note:** E2E tests are NOT run in PRs to avoid flakiness and speed up feedback.

---

### 2. Deploy to Staging (`deploy-staging.yml`)
**Trigger:** Push to `staging` branch  
**Purpose:** Deploy to staging environment with quality checks  
**Duration:** ~3-4 minutes

**Steps:**
1. Lint code
2. Type check
3. Run unit tests
4. Build for staging
5. Deploy to Firebase Hosting (staging)
6. Verify deployment

**Deployment URL:** https://job-finder-staging.web.app

---

### 3. Deploy to Production (`deploy-production.yml`)
**Trigger:** Push/merge to `main` branch  
**Purpose:** Deploy to production (assumes PR checks already passed)  
**Duration:** ~2-3 minutes

**Steps:**
1. Build for production
2. Deploy to Firebase Hosting (production)
3. Create deployment tag
4. Purge Cloudflare cache
5. Verify deployment

**Deployment URL:** https://job-finder-production.web.app

**Note:** No quality checks run here because PR checks ensure code quality.

---

### 4. Version Bump (`version-bump.yml`)
**Trigger:** Manual dispatch  
**Purpose:** Automated version bumping

---

## Workflow Philosophy

### What We Test
✅ **Lint + Type Check** - Catches 90% of issues, runs in seconds  
✅ **Unit Tests** - Fast, reliable, high signal-to-noise ratio  
✅ **Build Verification** - Ensures app compiles correctly  

### What We DON'T Test in CI
❌ **E2E Tests** - Flaky, slow, environment-dependent  
❌ **Integration Tests** - Require emulator setup, complex, flaky  
❌ **Visual Regression** - Slow, high maintenance  

### Why?
- **Speed:** Faster feedback loop = happier developers
- **Reliability:** No more "rerun CI because E2E flaked"
- **Simplicity:** Easier to maintain and debug
- **Cost:** Less CI minutes consumed

## Branch Strategy

```
feature → PR → staging → test manually → main → production
           ↓              ↓                ↓
        PR checks    Staging deploy   Production deploy
```

## Pipeline Flow

### Feature Development
```bash
# Create feature branch
git checkout -b feature/my-feature

# Make changes, commit
git add .
git commit -m "feat: add new feature"

# Push and create PR to main
git push origin feature/my-feature
# Create PR on GitHub targeting main
```

### PR Merge → Staging
```bash
# After PR approved and merged to main
# Create staging branch from main (if doesn't exist)
git checkout main
git pull origin main
git checkout -b staging  # or git checkout staging
git merge main
git push origin staging

# This triggers automatic staging deployment
```

### Staging → Production
```bash
# After testing on staging
git checkout main
git merge staging  # or cherry-pick specific commits
git push origin main

# This triggers automatic production deployment
```

## Manual Testing

E2E tests should be run **locally** or **manually** when needed:

```bash
# Run all E2E tests locally
npm run test:e2e

# Run specific test file
npx playwright test e2e/auth.spec.ts

# Run in UI mode for debugging
npm run test:e2e:ui

# Run only critical tests
npx playwright test --grep @critical
```

## Troubleshooting

### Staging Deployment Failed
1. Check workflow logs in GitHub Actions
2. Verify `.env.staging` has correct values
3. Check Firebase Hosting status
4. Manually deploy: `firebase deploy --only hosting:staging`

### Production Deployment Failed
1. Check if `main` branch is protected
2. Verify Firebase service account permissions
3. Check Cloudflare configuration (optional)
4. Manually deploy: `firebase deploy --only hosting:production`

### Tests Failing in PR
1. Run tests locally: `npm run test:unit`
2. Fix issues, commit, push
3. PR checks will re-run automatically

### Build Failing
1. Check TypeScript errors: `npm run type-check`
2. Check linting: `npm run lint`
3. Verify all dependencies: `npm ci`

## Rollback

### Staging Rollback
```bash
firebase hosting:rollback --site job-finder-staging
```

### Production Rollback
```bash
firebase hosting:rollback --site job-finder-production
```

## Monitoring

- **GitHub Actions:** https://github.com/Jdubz/job-finder-FE/actions
- **Firebase Console:** https://console.firebase.google.com/project/static-sites-257923
- **Staging Site:** https://job-finder-staging.web.app
- **Production Site:** https://job-finder.joshwentworth.com

## Performance Metrics

| Workflow | Duration | Success Rate |
|----------|----------|--------------|
| PR Checks | ~2-3 min | 95%+ |
| Staging Deploy | ~3-4 min | 98%+ |
| Production Deploy | ~2-3 min | 99%+ |

## Future Improvements

- [ ] Add smoke tests post-deployment (optional)
- [ ] Automated performance monitoring
- [ ] Bundle size tracking over time
- [ ] Automated changelog generation
- [ ] Slack/Discord notifications for deployments

## Support

For issues or questions:
1. Check workflow logs in GitHub Actions
2. Review this documentation
3. Contact the team in #engineering
