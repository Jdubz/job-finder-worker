# FE-WORKFLOW-3 — Remove Dangerous Skip-Tests Option

- **Status**: To Do
- **Owner**: Worker B
- **Priority**: P2 (Medium)
- **Labels**: priority-p2, repository-frontend, type-enhancement, ci-cd, safety
- **Estimated Effort**: 30 minutes
- **Dependencies**: FE-WORKFLOW-0 (E2E tests must be added first)
- **Related**: See `docs/WORKFLOW_ANALYSIS_FE.md` for detailed analysis

## What This Issue Covers

Remove the dangerous `skip-tests` option from deployment workflows that allows bypassing all tests including E2E tests. This option creates a safety hole that could lead to deploying broken code.

## Context

Both `deploy-staging.yml` and `deploy-production.yml` have a `workflow_dispatch` trigger with `skip-tests` input:

```yaml
on:
  workflow_dispatch:
    inputs:
      skip-tests:
        description: "Skip tests (use with caution)"
        required: false
        default: "false"
```

This option is used in:

- Lines 51-52 in deploy-staging.yml: `if: github.event.inputs.skip-tests != 'true'`
- Lines 50-52 in deploy-production.yml: `if: github.event.inputs.skip-tests != 'true'`

### Why This Is Dangerous

1. **Defeats the purpose of tests** - Can deploy completely broken code
2. **No audit trail** - Easy to click and forget
3. **Production risk** - Especially dangerous for production deployments
4. **False sense of urgency** - "Need to deploy NOW" leads to skipping tests
5. **Slippery slope** - Once used once, becomes habitual

### When People Think They Need It

- "Emergency hotfix" - But untested hotfixes cause more emergencies
- "Tests are flaky" - Fix the tests instead
- "Tests take too long" - Optimize tests, don't skip them
- "I already tested locally" - Local tests don't match CI environment

### The Right Solution

- **For emergencies**: Fix the emergency on a branch, test properly, then deploy
- **For flaky tests**: Fix or disable the specific flaky test
- **For speed**: Run critical tests only (already doing this)
- **For local testing**: CI is the final gate, always run it

## Tasks

### 1. Remove skip-tests from deploy-staging.yml

- [ ] Remove lines 9-12 (skip-tests input)
- [ ] Remove line 58 (`if: github.event.inputs.skip-tests != 'true'`)
- [ ] E2E tests now always run (no bypass)

### 2. Remove skip-tests from deploy-production.yml

- [ ] Remove lines 9-12 (skip-tests input)
- [ ] Remove line 58 if it exists (E2E tests condition)
- [ ] Production E2E tests now always run (critical!)

### 3. Keep workflow_dispatch for Manual Triggers

- [ ] Keep `workflow_dispatch:` trigger (useful for manual deploys)
- [ ] Remove inputs section entirely
- [ ] Manual deploys will run all tests (as they should)

### 4. Add Comment Documentation

- [ ] Add comment explaining why skip-tests was removed
- [ ] Document proper emergency procedures
- [ ] Reference this issue in comment

### 5. Update Documentation

- [ ] Update any docs that reference skip-tests
- [ ] Document emergency deployment procedure
- [ ] Add to workflow README

## Proposed Changes

### Before (deploy-staging.yml & deploy-production.yml):

```yaml
on:
  push:
    branches: [staging|main]
  workflow_dispatch:
    inputs:
      skip-tests:
        description: 'Skip tests (use with caution)'  ❌ REMOVE
        required: false
        default: 'false'

jobs:
  # ...
  e2e-tests:
    # ...
    if: github.event.inputs.skip-tests != 'true'  ❌ REMOVE
```

### After:

```yaml
on:
  push:
    branches: [staging|main]
  workflow_dispatch:
    # Manual deployments still possible, but tests always run
    # No skip-tests option - tests are not optional
    # For emergencies: fix the code, test it, then deploy

jobs:
  # ...
  e2e-tests:
    # Always runs - no bypass
    # If tests fail, deployment is blocked
    # This protects our users from broken deployments
```

## Emergency Deployment Procedure

Document this as the replacement for skip-tests:

### Option 1: Hotfix Branch (Recommended)

```bash
# 1. Create hotfix branch
git checkout -b hotfix/critical-fix

# 2. Make the fix
# ... edit files ...

# 3. Push and let CI run ALL tests
git push origin hotfix/critical-fix

# 4. Merge to staging (tests run again)
# 5. Verify on staging
# 6. Merge to main (tests run again)
```

### Option 2: Disable Specific Flaky Test

```bash
# If a specific test is flaky:
# 1. Disable the flaky test with .skip
test.skip('flaky test', () => { ... })

# 2. Create issue to fix flaky test
# 3. Deploy with confidence that critical tests pass
# 4. Fix flaky test ASAP
```

### Option 3: Critical E2E Only (Already Doing)

```bash
# We already only run @critical tests in deployment
# If even this is too slow:
# 1. Review which tests are tagged @critical
# 2. Remove non-critical ones from the tag
# 3. Balance speed vs safety
```

## Acceptance Criteria

- [ ] skip-tests input removed from deploy-staging.yml
- [ ] skip-tests input removed from deploy-production.yml
- [ ] workflow_dispatch still works for manual deploys
- [ ] E2E tests always run (no bypass condition)
- [ ] Documentation updated with emergency procedures
- [ ] Comment in workflow explains removal
- [ ] All deployments now require passing tests

## Benefits

- **Safer deployments**: Tests are mandatory, no shortcuts
- **Better habits**: Forces proper testing workflow
- **Clearer workflow**: No confusing skip option
- **Audit compliance**: Can't accidentally bypass safety gates
- **Production safety**: Critical for production deployments

## Testing Plan

1. Create feature branch: `feature/remove-skip-tests`
2. Remove skip-tests input and conditions
3. Test manual deployment:
   - Trigger workflow_dispatch manually
   - Verify tests run
   - Verify deployment proceeds after tests pass
4. Test automatic deployment:
   - Push to staging
   - Verify tests run automatically
5. Test failure scenario:
   - Intentionally break a test
   - Verify deployment is blocked
   - Fix test and verify deployment proceeds
6. Merge to staging then main

## Notes

- **This removes a "convenience" feature** - That's the point!
- Tests exist to protect users - skipping them defeats the purpose
- If tests are too slow, optimize them, don't skip them
- If tests are flaky, fix them, don't skip them
- Emergency deploys should still go through proper testing
- This change makes deployments safer at the cost of removing a shortcut

## Related Issues

- FE-WORKFLOW-0: Adds E2E tests to production (must complete first)
- After this, production has E2E tests that can't be bypassed
