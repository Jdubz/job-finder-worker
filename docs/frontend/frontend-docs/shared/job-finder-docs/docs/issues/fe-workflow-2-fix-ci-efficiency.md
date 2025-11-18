# FE-WORKFLOW-2 — Fix CI Efficiency

- **Status**: To Do
- **Owner**: Worker B
- **Priority**: P2 (Medium)
- **Labels**: priority-p2, repository-frontend, type-optimization, ci-cd
- **Estimated Effort**: 1-2 hours
- **Dependencies**: None (can be done independently)
- **Related**: See `docs/WORKFLOW_ANALYSIS_FE.md` for detailed analysis

## What This Issue Covers

Fix critical inefficiency in ci.yml where each job independently runs `npm ci`, wasting ~5 minutes per CI run. Implement dependency installation once with artifact sharing.

## Context

Current ci.yml has 6 jobs that each run `npm ci` independently:

1. **lint** (line 26) - `npm ci`
2. **type-check** (line 46) - `npm ci`
3. **test** (line 64) - `npm ci`
4. **integration-test** (line 85) - `npm ci`
5. **build** (line 143) - `npm ci`
6. **e2e** (line 184) - `npm ci`

**Result**: Dependencies downloaded and installed 6 times per CI run
**Waste**: ~5 minutes total (6 × 50 seconds)
**Solution**: Install once, share node_modules via artifacts

### Why This Happens

GitHub Actions' npm cache (`cache: 'npm'`) only caches the npm download cache (~/.npm), not node_modules. Each job still runs `npm ci` which:

1. Validates package-lock.json
2. Removes existing node_modules
3. Installs fresh dependencies

## Tasks

### 1. Create Install Job

- [ ] Add new `install` job at the beginning
- [ ] Install dependencies once
- [ ] Upload node_modules as artifact
- [ ] Keep artifact for duration of workflow only

### 2. Update All Jobs to Use Artifact

- [ ] Add `needs: install` to: lint, type-check, test, integration-test, build, e2e
- [ ] Add download-artifact step to each job
- [ ] Remove `npm ci` from each job
- [ ] Keep npm cache for faster install job

### 3. Handle Special Cases

- [ ] **integration-test**: Still needs Firebase tools (`npm install -g firebase-tools`)
- [ ] **e2e**: Still needs Playwright install (`npx playwright install`)
- [ ] These are additional to node_modules, not replacements

### 4. Optimize Artifact Size

- [ ] Consider using tar/gzip for node_modules
- [ ] Or use actions/cache instead of artifacts (faster)
- [ ] Test both approaches for speed

### 5. Update Workflow Documentation

- [ ] Document new install job
- [ ] Update comments in workflow file
- [ ] Note performance improvements

## Proposed Changes

### Option A: Using Artifacts (Simple)

```yaml
name: CI

on:
  push:
    branches: [main, staging] # Remove develop
  pull_request:
    branches: [main, staging]

jobs:
  install:
    name: Install Dependencies
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Upload node_modules
        uses: actions/upload-artifact@v4
        with:
          name: node_modules
          path: node_modules/
          retention-days: 1

  lint:
    name: Lint
    runs-on: ubuntu-latest
    needs: install
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Download node_modules
        uses: actions/download-artifact@v4
        with:
          name: node_modules
          path: node_modules/

      - name: Run ESLint
        run: npm run lint # No npm ci needed!

      - name: Check code formatting
        run: npm run format:check

  # ... repeat for type-check, test, integration-test, build, e2e
```

### Option B: Using Cache (Faster)

```yaml
jobs:
  install:
    name: Install Dependencies
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Cache node_modules
        id: cache
        uses: actions/cache@v4
        with:
          path: node_modules
          key: nodemodules-${{ runner.os }}-${{ hashFiles('package-lock.json') }}

      - name: Install dependencies
        if: steps.cache.outputs.cache-hit != 'true'
        run: npm ci

  lint:
    needs: install
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Restore node_modules
        uses: actions/cache@v4
        with:
          path: node_modules
          key: nodemodules-${{ runner.os }}-${{ hashFiles('package-lock.json') }}

      - run: npm run lint
```

## Acceptance Criteria

- [ ] Dependencies installed only once per CI run
- [ ] All 6 jobs share the same node_modules
- [ ] No job runs `npm ci` except the install job
- [ ] CI run time reduces by ~4-5 minutes
- [ ] All tests still pass
- [ ] No functionality regression
- [ ] Workflow is faster on cache hit vs cache miss

## Performance Improvements

| Step                     | Before         | After         | Savings       |
| ------------------------ | -------------- | ------------- | ------------- |
| Install deps (6 jobs)    | 6 × 50s = 5min | 1 × 50s = 50s | -4min 10s     |
| Artifact upload/download | 0s             | ~30s total    | -30s          |
| **Net savings**          | -              | -             | **~3min 40s** |
| **Total CI time**        | 15-20 min      | 11-16 min     | **-25%**      |

## Testing Plan

1. Create feature branch: `feature/optimize-ci-install`
2. Implement install job with artifacts
3. Update all jobs to use artifacts
4. Push to feature branch and verify:
   - Install job completes
   - Artifacts uploaded successfully
   - All jobs download artifacts
   - No jobs run `npm ci`
   - All tests pass
5. Compare timing:
   - Before: Check last ci.yml run time
   - After: Check new run time
   - Verify ~25% improvement
6. Merge to staging

## Notes

- Artifact retention set to 1 day (only needed for workflow duration)
- Consider cache over artifacts for better performance (cache is faster)
- Special cases (Firebase tools, Playwright) handled separately
- Can also remove "develop" branch trigger while we're at it
- May want to add a "cache miss" warning if install job takes long

## Alternative: Hybrid Approach

For maximum speed, could use cache for most jobs but keep `npm ci` for critical jobs like build to ensure absolute freshness. This is a tradeoff between speed and safety.

## Rollback Plan

If artifact sharing causes issues:

1. Revert to `npm ci` in each job
2. Keep install job for documentation
3. Investigate why artifact sharing failed
4. Could be permissions, artifact size, or timing issues
