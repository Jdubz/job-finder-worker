# WORKER-WORKFLOW-1 — Add Test Requirements to Deployments

- **Status**: To Do
- **Owner**: Worker A or Worker B
- **Priority**: P0 (Critical)
- **Labels**: priority-p0, repository-worker, type-bug, ci-cd, safety
- **Estimated Effort**: 30 minutes
- **Dependencies**: None
- **Related**: See `docs/WORKFLOW_ANALYSIS_WORKER.md` for detailed analysis

## What This Issue Covers

Add test job as dependency to Docker deployment workflows to prevent deploying broken code to staging or production. Currently tests run in parallel with deployments, allowing failed code to be deployed.

## Context

**CRITICAL SAFETY ISSUE**: The worker deployment workflows (`docker-build-push-staging.yml` and `docker-build-push.yml`) do not require tests to pass before deploying. This means:

- Broken code can be deployed to staging
- Broken code can be deployed to production
- Tests are advisory only, not a safety gate

**Current Behavior**:

```bash
# Developer pushes code to staging
git push origin staging

# What happens:
# ✅ tests.yml triggers (runs independently)
# ✅ docker-build-push-staging.yml triggers (runs independently)
# ❌ Tests fail
# ✅ Docker build succeeds anyway
# ❌ Broken code deployed to staging!
```

**Root Cause**: No dependency relationship between test workflow and deployment workflows.

## Tasks

### 1. Make Deployment Depend on Tests (Staging)

- [ ] Edit `docker-build-push-staging.yml`
- [ ] Add `needs: test` to `build-and-push-staging` job
- [ ] Reference test job from tests.yml workflow

### 2. Make Deployment Depend on Tests (Production)

- [ ] Edit `docker-build-push.yml`
- [ ] Add `needs: test` to `build-and-push-production` job
- [ ] Ensure tests run on push to main

### 3. Update Test Workflow Triggers

- [ ] Verify `tests.yml` triggers on push to main
- [ ] Current: triggers on PR + push to staging
- [ ] Add: push to main (for production deployments)

### 4. Test the Changes

- [ ] Create feature branch
- [ ] Intentionally break a test
- [ ] Push to staging
- [ ] Verify deployment is BLOCKED
- [ ] Fix test
- [ ] Verify deployment proceeds

## Proposed Changes

### Option A: Use Reusable Workflow (Recommended)

**Step 1**: Make tests.yml reusable:

```yaml
# tests.yml
name: Tests

on:
  push:
    branches: [main, staging] # Add main
  pull_request:
    branches: [main, staging]
  workflow_call: # ⭐ Make it reusable

jobs:
  test:
    runs-on: ubuntu-latest
    # ... existing test steps
```

**Step 2**: Call from deployment workflows:

```yaml
# docker-build-push-staging.yml
name: Build and Push Staging Docker Image

on:
  push:
    branches: [staging]

jobs:
  test:
    uses: ./.github/workflows/tests.yml # ⭐ Run tests

  build-and-push-staging:
    needs: test # ⭐ BLOCK deployment if tests fail
    runs-on: ubuntu-latest
    # ... existing docker build steps
```

**Step 3**: Same for production:

```yaml
# docker-build-push.yml
name: Build and Push Production Docker Image

on:
  push:
    branches: [main]

jobs:
  test:
    uses: ./.github/workflows/tests.yml # ⭐ Run tests

  build-and-push-production:
    needs: test # ⭐ BLOCK deployment if tests fail
    runs-on: ubuntu-latest
    # ... existing docker build steps
```

### Option B: Duplicate Test Job (Not Recommended)

Copy test job into each deployment workflow. This creates duplication but works:

```yaml
# docker-build-push-staging.yml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      # ... copy all test steps from tests.yml

  build-and-push-staging:
    needs: test
    # ... docker build steps
```

**Drawback**: Creates duplication, harder to maintain.

## Acceptance Criteria

- [ ] Staging deployment BLOCKED if tests fail
- [ ] Production deployment BLOCKED if tests fail
- [ ] Tests run automatically on push to main
- [ ] Tests run before Docker build starts
- [ ] Failed tests prevent image from being built
- [ ] Failed tests prevent image from being pushed
- [ ] Manual workflow_dispatch still respects test requirement

## Benefits

- **Safety**: Cannot deploy broken code
- **Confidence**: All deployments are tested
- **Audit compliance**: Clear test gate in CI/CD
- **Cost savings**: Don't build Docker images if tests fail
- **Time savings**: Fast fail on test failure

## Testing Plan

1. Create feature branch: `feature/require-tests-for-deploy`
2. Implement Option A (reusable workflow)
3. Update tests.yml to be workflow_call compatible
4. Update both docker-build-push workflows
5. Test with intentionally broken test:
   - Push to staging
   - Verify workflow blocks
   - Check that Docker build job doesn't start
6. Fix test and verify deployment proceeds
7. Repeat for production (push to main)
8. Merge to staging, then main

## Notes

- This is a **CRITICAL** safety issue
- Should be fixed before any other workflow improvements
- Similar issue was found in FE repo (FE-WORKFLOW-0)
- This follows industry best practices for CI/CD

## Related Issues

- FE-WORKFLOW-0: Add E2E tests to production deployment (same pattern)
- WORKER-WORKFLOW-2: Eliminate duplication (depends on this being fixed first)
