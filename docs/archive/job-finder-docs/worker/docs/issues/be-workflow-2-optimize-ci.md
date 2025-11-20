# BE-WORKFLOW-2 — Optimize CI Workflow

- **Status**: To Do
- **Owner**: Worker B
- **Priority**: P2 (Medium)
- **Labels**: priority-p2, repository-backend, type-optimization, ci-cd
- **Estimated Effort**: 1 hour
- **Dependencies**: None
- **Related**: See `docs/WORKFLOW_ANALYSIS_BE.md` for detailed analysis

## What This Issue Covers

Optimize the CI workflow by adding dependency caching, removing deprecated branch triggers, and eliminating redundant builds. Make CI faster and more efficient.

## Context

Current CI workflow has several inefficiencies:

1. **No dependency caching** - Wastes ~30-60s per run downloading dependencies
2. **Runs on deprecated branches** - `worker-*` branches are no longer used
3. **Redundant build** - Builds code that will be built again in deploy workflow
4. **Incorrect working directory** - Cache directive references root instead of functions/

These issues make CI slower than necessary and waste GitHub Actions minutes.

## Tasks

### 1. Add Dependency Caching

- [ ] Add `actions/cache@v4` step for `functions/node_modules`
- [ ] Use cache key based on `functions/package-lock.json` hash
- [ ] Add restore-keys for partial cache hits
- [ ] Test cache hit/miss scenarios

### 2. Remove Deprecated Branch Triggers

- [ ] Remove `worker-*` from push triggers (worktrees deprecated)
- [ ] Keep only `main` and `staging` for push events
- [ ] Keep PR triggers for `main` and `staging`

### 3. Replace Build with Type Check

- [ ] Remove `npm run build` step from CI
- [ ] Add `npm run type-check` step (TypeScript compile without emit)
- [ ] Keep lint and test steps unchanged

### 4. Fix Working Directory

- [ ] Add `working-directory: functions` to all npm steps
- [ ] Update cache paths to reference functions directory
- [ ] Ensure all steps operate on correct directory

### 5. Optimize Test Execution

- [ ] Add `--ci` flag to test command for CI optimizations
- [ ] Consider adding test result caching (optional)
- [ ] Ensure coverage reports are still generated

### 6. Update Codecov Upload

- [ ] Update coverage file path: `functions/coverage/lcov.info`
- [ ] Only upload if coverage file exists
- [ ] Keep `fail_ci_if_error: false` for resilience

## Proposed Workflow

```yaml
name: CI Pipeline

on:
  push:
    branches:
      - main
      - staging
  pull_request:
    branches:
      - main
      - staging

jobs:
  quality-checks:
    name: Quality Checks
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Cache dependencies
        uses: actions/cache@v4
        with:
          path: functions/node_modules
          key: npm-${{ runner.os }}-${{ hashFiles('functions/package-lock.json') }}
          restore-keys: |
            npm-${{ runner.os }}-

      - name: Install dependencies
        working-directory: functions
        run: npm ci

      - name: Run linter
        working-directory: functions
        run: npm run lint

      - name: Type check
        working-directory: functions
        run: npm run type-check

      - name: Run tests
        working-directory: functions
        run: npm run test:ci

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        if: always()
        with:
          file: ./functions/coverage/lcov.info
          fail_ci_if_error: false
```

## Acceptance Criteria

- [ ] Dependencies are cached successfully (see cache hit in logs)
- [ ] CI run time reduces from ~3-4 min to ~2 min (40% faster)
- [ ] No longer runs on `worker-*` branches
- [ ] Type checking catches TypeScript errors without full build
- [ ] All tests pass
- [ ] Coverage upload works correctly
- [ ] Workflow triggers on correct branches only
- [ ] All steps execute in functions/ directory

## Performance Improvements

| Step                 | Before      | After          | Savings  |
| -------------------- | ----------- | -------------- | -------- |
| Install dependencies | 30-60s      | 5-10s (cached) | ~45s     |
| Build TypeScript     | 20-30s      | 0s (removed)   | ~25s     |
| Type check           | 0s          | 10-15s         | -15s     |
| **Total CI time**    | **3-4 min** | **~2 min**     | **~40%** |

## Testing Plan

1. Create feature branch: `feature/optimize-ci-workflow`
2. Update ci.yml with optimizations
3. Push to trigger CI on feature branch
4. Verify cache miss on first run
5. Push again to verify cache hit
6. Check total run time is ~2 minutes
7. Verify all quality checks pass
8. Merge to staging and verify

## Notes

- Type checking (`tsc --noEmit`) is faster than full build
- Still catches all TypeScript errors
- Build only happens in deploy workflow (where it's needed)
- Cache saves ~45s on every CI run
- Removing `worker-*` prevents unnecessary runs
