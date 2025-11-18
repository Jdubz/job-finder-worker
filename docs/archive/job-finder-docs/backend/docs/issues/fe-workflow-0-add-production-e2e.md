# FE-WORKFLOW-0 — Add E2E Tests to Production Deployment (CRITICAL)

- **Status**: To Do
- **Owner**: Worker B
- **Priority**: P0 (CRITICAL - Production Safety Issue)
- **Labels**: priority-p0, repository-frontend, type-bugfix, ci-cd, production-safety
- **Estimated Effort**: 30 minutes
- **Dependencies**: None
- **Related**: See `docs/WORKFLOW_ANALYSIS_FE.md` for detailed analysis

## What This Issue Covers

**CRITICAL PRODUCTION SAFETY ISSUE**: Add E2E tests to the production deployment workflow. Currently, staging runs E2E tests before deployment but production does NOT. This means broken UI can be deployed to production even though it would fail on staging.

## Context

### Current Situation

- ✅ **Staging** (`deploy-staging.yml`): quality-checks → **e2e-tests** → deploy
- ❌ **Production** (`deploy-production.yml`): quality-checks → deploy (NO E2E TESTS!)

### The Problem

Production deployments only run:

- Linting
- Type checking
- Unit tests

These will NOT catch:

- Broken button clicks
- Form submission failures
- Navigation issues
- Auth flow problems
- API integration breaks
- UI rendering issues

**Example**: Code could pass all quality checks but have completely broken user flows, and we'd deploy it to production.

### Why This Happened

Lines 54-60 in `deploy-production.yml` show the deploy job only depends on `quality-checks`, not `e2e-tests` (which doesn't exist).

## Tasks

### 1. Copy E2E Job from Staging

- [ ] Copy lines 54-96 from `deploy-staging.yml` (e2e-tests job)
- [ ] Paste into `deploy-production.yml` after quality-checks job
- [ ] Adjust job name to "E2E Tests (Critical Path) - Production"

### 2. Update Deploy Job Dependencies

- [ ] Change line 56 in deploy-production.yml
- [ ] From: `needs: quality-checks`
- [ ] To: `needs: [quality-checks, e2e-tests]`

### 3. Make E2E Tests Non-Skippable

- [ ] Remove or modify the skip-tests condition
- [ ] Change line 58: `if: github.event.inputs.skip-tests != 'true'`
- [ ] To: Remove this line entirely (tests always run)
- [ ] Or change to: `if: false` to document but disable skip

### 4. Update Environment File

- [ ] Verify `.env.production` exists for E2E tests
- [ ] If not, create it or copy from staging
- [ ] Line 85: Ensure `cp .env.production .env` works

### 5. Test the Changes

- [ ] Create feature branch: `critical/add-production-e2e-tests`
- [ ] Commit changes
- [ ] Test workflow syntax validation
- [ ] Do NOT merge to main until verified on staging
- [ ] Merge to staging first, verify E2E tests run
- [ ] Then merge to main

## Proposed Changes

### Before (deploy-production.yml):

```yaml
jobs:
  quality-checks:
    # ... existing

  deploy: # LINE 54
    name: Deploy to Production
    runs-on: ubuntu-latest
    needs: quality-checks # ❌ ONLY quality-checks
    # ... deploy steps
```

### After (deploy-production.yml):

```yaml
jobs:
  quality-checks:
    # ... existing

  e2e-tests: # ← ADD THIS ENTIRE JOB
    name: E2E Tests (Critical Path) - Production
    runs-on: ubuntu-latest
    needs: quality-checks
    # NO skip-tests condition - always run

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "npm"

      - name: Cache dependencies
        uses: actions/cache@v4
        with:
          path: ~/.npm
          key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
          restore-keys: |
            ${{ runner.os }}-node-

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright Chromium only
        run: npx playwright install --with-deps chromium

      - name: Copy production environment file for E2E tests
        run: cp .env.production .env

      - name: Run critical E2E tests
        run: npx playwright test --project=chromium --grep @critical

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: e2e-critical-results-production
          path: playwright-report/
          retention-days: 7

  deploy:
    name: Deploy to Production
    runs-on: ubuntu-latest
    needs: [quality-checks, e2e-tests] # ← ADD e2e-tests dependency
    # ... existing deploy steps
```

## Acceptance Criteria

- [ ] Production deployment workflow includes e2e-tests job
- [ ] e2e-tests job runs BEFORE deploy job
- [ ] deploy job has dependency on both quality-checks AND e2e-tests
- [ ] E2E tests are NOT skippable (no skip-tests condition)
- [ ] E2E tests run critical path tests only (with @critical tag)
- [ ] Test workflow validates successfully
- [ ] Changes tested on staging before merging to main
- [ ] Documentation updated to reflect new safety gate

## Testing Plan

1. **Create branch**: `critical/add-production-e2e-tests`
2. **Make changes** as outlined above
3. **Validate syntax**: Ensure YAML is valid
4. **Test on staging**:
   - Merge to staging first
   - Trigger deployment
   - Verify e2e-tests job runs
   - Verify deploy job waits for e2e-tests
5. **Verify failure scenario**:
   - Intentionally break a critical E2E test
   - Push to staging
   - Verify deployment is blocked
   - Fix test and verify deployment proceeds
6. **Merge to main** once verified

## Impact Assessment

### Before Fix:

- ❌ Can deploy broken UI to production
- ❌ No E2E verification before production
- ❌ Users discover bugs before we do

### After Fix:

- ✅ Production deployment blocked if critical E2E tests fail
- ✅ Same safety gate as staging
- ✅ Catch UI breaks before production deployment
- ✅ Reduces production incidents

## Rollback Plan

If E2E tests cause issues:

1. Use `git revert` to remove e2e-tests job
2. Or add `if: false` to disable temporarily
3. Investigate and fix E2E test issues
4. Re-enable with proper fix

## Notes

- This is a **CRITICAL PRODUCTION SAFETY ISSUE**
- Should be implemented IMMEDIATELY (within 24 hours)
- Do NOT skip this - it's protecting production users
- E2E tests should run the same `@critical` tagged tests as staging
- Total time added to deployment: ~2-3 minutes (worth it for safety)
- If E2E tests fail, deployment is blocked - THIS IS GOOD
- Consider adding Slack/Discord notification on E2E test failure

## Related Issues

- After this is fixed, proceed with FE-WORKFLOW-1 (duplication elimination)
- This takes priority over all optimization work
