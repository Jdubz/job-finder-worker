# FE-WORKFLOW-1 — Eliminate Workflow Duplication

- **Status**: To Do
- **Owner**: Worker B
- **Priority**: P1 (High)
- **Labels**: priority-p1, repository-frontend, type-refactor, ci-cd
- **Estimated Effort**: 2-3 hours
- **Dependencies**: FE-WORKFLOW-0 (must be completed first)
- **Related**: See `docs/WORKFLOW_ANALYSIS_FE.md` for detailed analysis

## What This Issue Covers

Eliminate 373 lines of duplicated code across FE workflows by:

1. Consolidating deploy-staging.yml and deploy-production.yml (95% identical)
2. Creating reusable quality-checks workflow (duplicated 3x)
3. Removing pr-checks.yml (duplicates ci.yml)

## Context

The current FE workflows have massive duplication:

### Duplication Issue #1: Deployment Workflows

- `deploy-staging.yml` (191 lines)
- `deploy-production.yml` (182 lines)
- **95% identical code** - only differ in:
  - Build command (`build:staging` vs `build:production`)
  - Firebase target (`staging` vs `production`)
  - Environment URLs
  - Production-specific: Cloudflare purge, deployment tags

### Duplication Issue #2: Quality Checks (3x)

- `ci.yml` lines 12-52 (lint, type-check, test jobs)
- `deploy-staging.yml` lines 19-52 (quality-checks job)
- `deploy-production.yml` lines 19-52 (quality-checks job)

When you push to staging:

- ci.yml runs quality checks
- deploy-staging.yml runs THE SAME quality checks again
- **Doubles the work for no benefit**

### Duplication Issue #3: PR Checks

- `pr-checks.yml` - Duplicates ci.yml work
- When PR is opened, both workflows run the same checks

## Tasks

### Part 1: Consolidate Deployment Workflows (2 hours)

#### Option A: Environment Matrix (Recommended)

- [ ] Create new `deploy.yml` workflow
- [ ] Define environment matrix with staging and production
- [ ] Consolidate common deployment steps
- [ ] Use matrix values for environment-specific configs
- [ ] Delete deploy-staging.yml and deploy-production.yml

#### Option B: Reusable Workflow

- [ ] Create `.github/workflows/deploy-to-env.yml` (reusable)
- [ ] Update deploy-staging.yml to call reusable workflow
- [ ] Update deploy-production.yml to call reusable workflow
- [ ] Pass environment-specific parameters

### Part 2: Create Reusable Quality Checks (30 min)

- [ ] Create `.github/workflows/quality-checks.yml` (reusable)
- [ ] Extract lint, type-check, unit test steps
- [ ] Make it callable from other workflows
- [ ] Update ci.yml to use reusable workflow
- [ ] Update deploy.yml to use reusable workflow

### Part 3: Remove pr-checks.yml (30 min)

- [ ] Move bundle size comment logic to ci.yml
- [ ] Add `if: github.event_name == 'pull_request'` condition
- [ ] Test PR workflow triggers ci.yml
- [ ] Delete pr-checks.yml

### Part 4: Testing & Verification

- [ ] Test on feature branch first
- [ ] Verify staging deployment works
- [ ] Verify production deployment works (dry run)
- [ ] Verify PR checks work
- [ ] Ensure no regression in functionality

## Proposed Structure

### Option A: Consolidated deploy.yml

```yaml
name: Deploy

on:
  push:
    branches: [staging, main]
  workflow_dispatch:

env:
  NODE_VERSION: "20"
  FIREBASE_PROJECT_ID: "static-sites-257923"

jobs:
  quality-checks:
    uses: ./.github/workflows/quality-checks.yml # Reusable

  e2e-tests:
    name: E2E Tests - ${{ matrix.env.name }}
    runs-on: ubuntu-latest
    needs: quality-checks
    strategy:
      matrix:
        env:
          - name: staging
            branch: staging
            env_file: .env.staging
          - name: production
            branch: main
            env_file: .env.production
    if: github.ref == format('refs/heads/{0}', matrix.env.branch)

    steps:
      # ... E2E test steps using matrix.env.*

  deploy:
    name: Deploy to ${{ matrix.env.name }}
    runs-on: ubuntu-latest
    needs: [quality-checks, e2e-tests]

    strategy:
      matrix:
        env:
          - name: staging
            branch: staging
            url: https://job-finder-staging.web.app
            custom_domain: https://job-finder-staging.joshwentworth.com
            build_cmd: build:staging
            target: staging
            purge_cloudflare: false
            create_tag: false
          - name: production
            branch: main
            url: https://job-finder-production.web.app
            custom_domain: https://job-finder.joshwentworth.com
            build_cmd: build:production
            target: production
            purge_cloudflare: true
            create_tag: true

    if: github.ref == format('refs/heads/{0}', matrix.env.branch)

    environment:
      name: ${{ matrix.env.name }}
      url: ${{ matrix.env.url }}

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Get version
        id: version
        run: |
          VERSION=$(node -p "require('./package.json').version")
          echo "version=$VERSION" >> $GITHUB_OUTPUT

      - name: Build application
        run: npm run ${{ matrix.env.build_cmd }}
        env:
          NODE_ENV: production
          VITE_APP_VERSION: ${{ steps.version.outputs.version }}

      - name: Verify build
        run: |
          [ -d "dist" ] || { echo "dist/ not found"; exit 1; }
          [ -f "dist/index.html" ] || { echo "index.html not found"; exit 1; }
          du -sh dist

      - name: Deploy to Firebase
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: ${{ secrets.GITHUB_TOKEN }}
          firebaseServiceAccount: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
          channelId: live
          projectId: ${{ env.FIREBASE_PROJECT_ID }}
          target: ${{ matrix.env.target }}

      - name: Verify deployment
        run: |
          sleep 5
          HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" ${{ matrix.env.url }})
          [ "$HTTP_CODE" = "200" ] && echo "✅ Deployed" || echo "⚠️  HTTP $HTTP_CODE"

      - name: Create deployment tag
        if: matrix.env.create_tag && success()
        run: |
          TAG="deploy-${{ matrix.env.name }}-$(date +%Y%m%d-%H%M%S)"
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git tag -a "$TAG" -m "Deployed to ${{ matrix.env.name }}"
          git push origin "$TAG" || true

      - name: Purge Cloudflare cache
        if: matrix.env.purge_cloudflare && success()
        continue-on-error: true
        run: |
          # ... existing Cloudflare purge logic

      - name: Deployment summary
        if: always()
        run: |
          echo "## ${{ matrix.env.name }} Deployment" >> $GITHUB_STEP_SUMMARY
          echo "- **Version**: ${{ steps.version.outputs.version }}" >> $GITHUB_STEP_SUMMARY
          echo "- **URL**: ${{ matrix.env.custom_domain }}" >> $GITHUB_STEP_SUMMARY
```

### Reusable quality-checks.yml

```yaml
name: Quality Checks

on:
  workflow_call:

jobs:
  lint:
    name: Lint & Format
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci
      - run: npm run lint
      - run: npm run format:check

  type-check:
    name: Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci
      - run: npm run type-check

  test:
    name: Unit Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci
      - run: npm run test:unit
```

## Acceptance Criteria

- [ ] Workflow files reduce from 742 lines to ~400 lines (46% reduction)
- [ ] No duplicated deployment code between staging and production
- [ ] Push to staging deploys to staging (no change in functionality)
- [ ] Push to main deploys to production (no change in functionality)
- [ ] Quality checks run only once per push (not 2-3x)
- [ ] PR checks work correctly with ci.yml
- [ ] All existing features preserved (E2E tests, verification, tagging, etc.)
- [ ] Workflow syntax validates
- [ ] Test deployments succeed

## Benefits

- **46% code reduction**: 742 → 400 lines
- **Single source of truth**: One deployment definition
- **Faster workflows**: Quality checks run once instead of 2-3x
- **Easier maintenance**: Changes in one place
- **Reduced errors**: No risk of updating one env but not the other

## Testing Plan

1. Create feature branch: `feature/consolidate-workflows`
2. Implement consolidation
3. Test on feature branch:
   - Trigger staging deployment
   - Trigger production deployment (dry run)
   - Open PR and verify checks run
4. Verify all functionality works
5. Merge to staging for final verification
6. Merge to main

## Notes

- **Wait for FE-WORKFLOW-0** to complete first
- This is purely a refactor - no functional changes
- May initially spawn more workflow jobs but they're conditional
- Can be tested safely on feature branch
- Keep existing workflows as backup during transition
