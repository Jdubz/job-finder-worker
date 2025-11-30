# E2E Test Suite Improvements

> Status: Implementation Plan
> Owner: @jdubz
> Last Updated: 2025-11-29

## Executive Summary

This document outlines improvements to the E2E test suite and CI integration to ensure comprehensive end-to-end testing across the entire job-finder application.

## Current State

### Test Suites

1. **Playwright E2E Tests** (`job-finder-FE/e2e/`)
   - 10 spec files covering UI workflows
   - Uses real browser automation (Chromium)
   - Tests authentication, navigation, CRUD operations
   - Runs against live API server + Vite dev server

2. **Vitest Integration Tests** (`tests/e2e/`)
   - 1 comprehensive integration test file
   - Tests full job pipeline with mock worker
   - Tests all frontend API clients against real backend
   - Uses in-memory SQLite database

### Infrastructure

- In-memory SQLite for test isolation
- Mock authentication bypass (`TEST_AUTH_BYPASS_TOKEN`)
- Dedicated e2e API server script (`scripts/dev/start-api-e2e.mjs`)
- Playwright web server configuration

### CI Status

❌ **E2E tests currently disabled in CI** (commented out in `.github/workflows/pr-checks.yml`)

## Identified Gaps

1. **No CI Integration**: E2E tests don't run on pull requests
2. **No Test Artifacts**: Screenshots/videos not saved on failure
3. **No Coverage Reporting**: No e2e coverage metrics collected
4. **No Flakiness Tracking**: No retry logic or failure analysis
5. **Separate Test Runners**: Playwright and Vitest run independently
6. **No Performance Benchmarks**: No metrics on test execution time

## Proposed Improvements

### Phase 1: CI Integration (High Priority)

**Goal**: Run all e2e tests on every PR targeting main

#### Changes:

1. **Enable Playwright Tests in CI**
   - Uncomment and enhance e2e job in `pr-checks.yml`
   - Install Playwright browsers in CI
   - Run Playwright tests with retry logic
   - Upload test artifacts (screenshots, videos, HTML report)

2. **Enable Vitest Integration Tests in CI**
   - Add separate job for Vitest e2e tests
   - Run with proper database setup
   - Collect and upload test results

3. **Parallel Execution**
   - Run Playwright and Vitest e2e in parallel
   - Use GitHub Actions matrix strategy for browser variants (future)

#### Acceptance Criteria:
- ✅ All e2e tests run on every PR
- ✅ Test failures block PR merge
- ✅ Screenshots/videos available on failure
- ✅ HTML report published as artifact
- ✅ Clear pass/fail status in PR checks

### Phase 2: Test Quality (Medium Priority)

**Goal**: Improve test reliability and coverage

#### Changes:

1. **Add Critical Path Tags**
   - Tag critical user journeys with `@critical`
   - Run critical tests first, fail fast
   - Separate critical vs full test runs

2. **Flakiness Detection**
   - Enable automatic retries on failure (1-2 retries)
   - Track flaky tests in CI
   - Add timeout configurations

3. **Test Coverage**
   - Add coverage collection for Vitest tests
   - Generate coverage report artifacts
   - Track coverage trends over time

4. **Performance Benchmarks**
   - Measure test execution time
   - Alert on slow tests (>60s)
   - Track test performance over time

#### Acceptance Criteria:
- ✅ Critical tests identified and prioritized
- ✅ Flaky tests automatically retried
- ✅ Coverage reports generated
- ✅ Performance metrics tracked

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
