# E2E Test Suite Improvements

> Status: Active
> Owner: @jdubz
> Last Updated: 2025-12-10

## Executive Summary

This document outlines improvements to the E2E test suite and CI integration to ensure comprehensive end-to-end testing across the entire job-finder application.

## Current State

### Test Suites
1. **Playwright E2E Tests** (`job-finder-FE/e2e/`) – ~10 specs, Chromium, auth/nav/CRUD flows.
2. **Vitest Integration Tests** (`tests/e2e/`) – pipeline + API client coverage using in-memory SQLite.

### Infrastructure
- In-memory SQLite for isolation; mock auth via `TEST_AUTH_BYPASS_TOKEN`.
- Dedicated e2e API server script (`scripts/dev/start-api-e2e.mjs`); Playwright web server config present.

### CI Status (as of 2025-12-10)
- Playwright job exists in `.github/workflows/pr-checks.yml` but is **optional** (`continue-on-error: true`).
- Vitest e2e job runs and is blocking.
- Artifacts (report + results) are uploaded on Playwright runs.

## Identified Gaps

1. **Playwright is non-blocking**: Job runs but `continue-on-error: true` — failures don't fail PRs.
2. **No coverage/metrics**: Vitest e2e lacks coverage publishing; Playwright duration/flakiness not tracked.
3. **No retries/critical tags**: Playwright lacks retry + @critical tagging to isolate high-signal flows.
4. **Separate runners**: Playwright and Vitest run independently; optional unified `test:e2e:all` script would aid local DX.

## Proposed Improvements

### Next Improvements

1) **Make Playwright blocking**: remove `continue-on-error`, add minimal retry (1-2) and keep artifacts.
2) **Coverage/metrics**: enable coverage for Vitest e2e; track Playwright duration/flakiness.
3) **Critical-path tagging**: mark @critical specs to prioritize failures.
4) **Local DX**: add unified `test:e2e:all` script if still missing, and document debug mode.

### Acceptance Targets
- Playwright failures block PRs; artifacts retained.
- Vitest e2e remains blocking with coverage report artifact.
- Critical paths tagged and reported separately.
- Runtime metrics (duration, retries) captured.

### Phase 3: Developer Experience (Low Priority)

**Goal**: Make e2e tests easier to run and debug locally

#### Changes:

1. **Unified Test Runner**
   - Create npm script to run both Playwright + Vitest e2e
   - Add `test:e2e:all` command
   - Parallel execution with proper error handling

2. **Better Local Debugging**
   - Document how to run tests locally
   - Add debug mode instructions
   - Create troubleshooting guide

3. **Test Data Management**
   - Create test data fixtures
   - Add data seeding utilities
   - Improve test isolation

#### Acceptance Criteria:
- ✅ Single command runs all e2e tests
- ✅ Clear documentation for local testing
- ✅ Test data management utilities available

## Implementation Plan

### Step 1: Create CI Job for Playwright E2E

```yaml
playwright-e2e:
  name: Playwright E2E Tests
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 20
        cache: npm
    - run: npm ci
    - name: Install Playwright Browsers
      run: npx playwright install --with-deps chromium
    - name: Run Playwright tests
      run: npm run test:e2e --workspace job-finder-FE
    - name: Upload test artifacts
      if: always()
      uses: actions/upload-artifact@v4
      with:
        name: playwright-report
        path: job-finder-FE/playwright-report/
        retention-days: 30
    - name: Upload test results
      if: always()
      uses: actions/upload-artifact@v4
      with:
        name: playwright-results
        path: job-finder-FE/test-results/
        retention-days: 7
```

### Step 2: Create CI Job for Vitest E2E

```yaml
vitest-e2e:
  name: Vitest Integration Tests
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 20
        cache: npm
    - run: npm ci
    - name: Run Vitest e2e
      run: npm run test:e2e
    - name: Upload coverage
      if: always()
      uses: actions/upload-artifact@v4
      with:
        name: e2e-coverage
        path: coverage/
        retention-days: 30
```

### Step 3: Add Unified Test Runner

Add to root `package.json`:

```json
{
  "scripts": {
    "test:e2e:all": "npm run test:e2e:vitest & npm run test:e2e:playwright & wait",
    "test:e2e:playwright": "npm run test:e2e --workspace job-finder-FE",
    "test:e2e:vitest": "vitest run --config vitest.config.e2e.ts",
    "test:e2e:critical": "npm run test:e2e:critical --workspace job-finder-FE"
  }
}
```

**Note**: The `test:e2e:all` script runs both test suites in parallel using shell background jobs (`&`) and waits for both to complete. This ensures all test results are visible even if one suite fails.

### Step 4: Add Test Tags

Mark critical tests with `@critical` tag:

```typescript
test('@critical - user can submit job and view match', async ({ page }) => {
  // test implementation
})
```

## Success Metrics

1. **Coverage**: E2E tests cover 80%+ of critical user journeys
2. **Reliability**: <5% test flakiness rate
3. **Speed**: Full e2e suite completes in <10 minutes
4. **Visibility**: 100% of PRs show e2e test status
5. **Debuggability**: All failures have screenshots/videos

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Flaky tests blocking PRs | High | Implement automatic retries, quarantine flaky tests |
| Slow test execution | Medium | Parallelize tests, optimize fixtures |
| CI resource usage | Low | Run only on PR (not on every commit), use test sharding |
| Maintenance burden | Medium | Clear ownership, automated test reporting |

## Timeline

- **Week 1**: Phase 1 - CI Integration
- **Week 2**: Phase 2 - Test Quality improvements
- **Week 3**: Phase 3 - Developer experience enhancements

## References

- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [GitHub Actions Artifacts](https://docs.github.com/en/actions/using-workflows/storing-workflow-data-as-artifacts)
- [Vitest Coverage](https://vitest.dev/guide/coverage.html)
