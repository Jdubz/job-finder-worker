# WORKER-WORKFLOW-2 — Eliminate Docker Workflow Duplication

- **Status**: To Do
- **Owner**: Worker A or Worker B
- **Priority**: P1 (High)
- **Labels**: priority-p1, repository-worker, type-refactor, ci-cd
- **Estimated Effort**: 1-2 hours
- **Dependencies**: WORKER-WORKFLOW-1 (add test requirements first)
- **Related**: See `docs/WORKFLOW_ANALYSIS_WORKER.md` for detailed analysis

## What This Issue Covers

Consolidate the two nearly-identical Docker deployment workflows into a single workflow with environment-based logic. Currently `docker-build-push-staging.yml` and `docker-build-push.yml` are 95% identical with 147 lines of duplicated code.

## Context

The worker repo has two deployment workflows that are almost completely identical:

- `docker-build-push-staging.yml` (77 lines)
- `docker-build-push.yml` (78 lines)
- **Duplication**: 147 out of 155 lines (95%)
- **Unique content**: Only tags and deployment summary text

**Identical Sections**:

- Checkout, setup Docker Buildx, login (25-36 lines): IDENTICAL
- Build and push configuration (48-59 lines): IDENTICAL except tags
- Deployment summary structure (64-77 lines): IDENTICAL except environment name

**Only Differences**:

```yaml
# Staging tags
tags: |
  type=raw,value=staging
  type=sha,prefix=staging-

# Production tags
tags: |
  type=raw,value=latest
  type=raw,value=production
  type=sha,prefix=prod-
```

This violates DRY principle and creates maintenance burden.

## Tasks

### 1. Create Consolidated Workflow

- [ ] Create new file: `deploy-worker.yml`
- [ ] Use environment-based logic for tags
- [ ] Single job that handles both staging and production

### 2. Implement Environment Detection

- [ ] Detect environment from branch: staging vs main
- [ ] Set tags based on environment
- [ ] Set summary message based on environment
- [ ] Set Watchtower delay based on environment

### 3. Update Workflow Logic

- [ ] Single checkout step
- [ ] Single Docker Buildx setup
- [ ] Single login step
- [ ] Conditional tags based on branch
- [ ] Conditional summary based on environment

### 4. Delete Old Workflows

- [ ] Remove `docker-build-push-staging.yml`
- [ ] Remove `docker-build-push.yml`
- [ ] Update any documentation references

### 5. Update Test Strategy

- [ ] Ensure test requirement works with new workflow
- [ ] Test staging deployment
- [ ] Test production deployment
- [ ] Verify both environments build correctly

## Proposed Consolidated Workflow

```yaml
name: Build and Deploy Worker

on:
  push:
    branches:
      - main # Production
      - staging # Staging
    paths-ignore:
      - "**.md"
      - "docs/**"
      - ".gitignore"
  workflow_dispatch:
    inputs:
      environment:
        description: "Environment to deploy"
        required: true
        default: "staging"
        type: choice
        options:
          - staging
          - production

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  test:
    uses: ./.github/workflows/tests.yml

  deploy:
    needs: test
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Determine environment
        id: env
        run: |
          if [[ "${{ github.ref }}" == "refs/heads/main" ]] || [[ "${{ github.event.inputs.environment }}" == "production" ]]; then
            echo "environment=production" >> $GITHUB_OUTPUT
            echo "deploy_delay=5" >> $GITHUB_OUTPUT
          else
            echo "environment=staging" >> $GITHUB_OUTPUT
            echo "deploy_delay=3" >> $GITHUB_OUTPUT
          fi

      - name: Extract metadata (tags, labels) for Docker
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=raw,value=${{ steps.env.outputs.environment }}
            type=raw,value=${{ steps.env.outputs.environment == 'production' && 'latest' || '' }},enable=${{ steps.env.outputs.environment == 'production' }}
            type=sha,prefix=${{ steps.env.outputs.environment }}-
            type=ref,event=branch

      - name: Build and push Docker image
        id: build-push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          platforms: linux/amd64,linux/arm64

      - name: Image digest
        run: echo ${{ steps.build-push.outputs.digest }}

      - name: Deployment Summary
        run: |
          ENV="${{ steps.env.outputs.environment }}"
          DELAY="${{ steps.env.outputs.deploy_delay }}"

          if [[ "$ENV" == "production" ]]; then
            EMOJI="🎯"
            CONTAINER="job-finder-production"
          else
            EMOJI="🚀"
            CONTAINER="job-finder-staging"
          fi

          echo "## ${ENV^} Deployment $EMOJI" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "**Image:** \`${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${ENV}\`" >> $GITHUB_STEP_SUMMARY
          echo "**Digest:** \`${{ steps.build-push.outputs.digest }}\`" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "Watchtower will auto-deploy to ${ENV} environment in ~${DELAY} minutes" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "### Next Steps" >> $GITHUB_STEP_SUMMARY
          echo "1. Monitor deployment: \`docker logs ${CONTAINER} -f\`" >> $GITHUB_STEP_SUMMARY
          echo "2. Verify queue processing in ${ENV}" >> $GITHUB_STEP_SUMMARY
          if [[ "$ENV" == "staging" ]]; then
            echo "3. Test new features" >> $GITHUB_STEP_SUMMARY
            echo "4. If successful, merge to \`main\` for production deployment" >> $GITHUB_STEP_SUMMARY
          else
            echo "3. Check error logs for issues" >> $GITHUB_STEP_SUMMARY
            echo "4. Monitor resource usage" >> $GITHUB_STEP_SUMMARY
          fi
```

## Line Count Comparison

| Category                      | Before    | After     | Savings             |
| ----------------------------- | --------- | --------- | ------------------- |
| docker-build-push-staging.yml | 77 lines  | DELETED   | -77 lines           |
| docker-build-push.yml         | 78 lines  | DELETED   | -78 lines           |
| deploy-worker.yml (new)       | -         | ~85 lines | -                   |
| **Total**                     | 155 lines | 85 lines  | **-70 lines (45%)** |

## Acceptance Criteria

- [ ] Single workflow file replaces two separate files
- [ ] Staging deployment works (push to staging)
- [ ] Production deployment works (push to main)
- [ ] Manual deployment works (workflow_dispatch)
- [ ] Correct tags applied to each environment
- [ ] Correct deployment summary for each environment
- [ ] Multi-arch builds still work (linux/amd64, linux/arm64)
- [ ] Docker layer caching still works
- [ ] Tests still required before deployment

## Benefits

- **Reduced duplication**: 70 fewer lines of code (45% reduction)
- **Single source of truth**: Changes only needed in one place
- **Easier maintenance**: Update logic once, affects all deployments
- **Less error-prone**: Can't forget to update both files
- **Clearer logic**: Environment differences explicit and visible

## Testing Plan

1. Create feature branch: `feature/consolidate-docker-workflows`
2. Create new `deploy-worker.yml` with consolidated logic
3. Test staging deployment:
   - Push to staging
   - Verify staging tags applied
   - Verify Watchtower delay is 3 minutes
   - Verify deployment summary mentions staging
4. Test production deployment:
   - Push to main
   - Verify production + latest tags applied
   - Verify Watchtower delay is 5 minutes
   - Verify deployment summary mentions production
5. Test manual deployment:
   - Trigger workflow_dispatch
   - Select staging environment
   - Verify staging deployment
   - Select production environment
   - Verify production deployment
6. Delete old workflow files
7. Merge to staging, then main

## Notes

- Wait for WORKER-WORKFLOW-1 to be complete first (test requirements)
- This consolidation pattern is used in BE and FE repos too
- Similar to BE-WORKFLOW-1 and FE-WORKFLOW-1 issues
- Consider adding environment protection rules in GitHub settings

## Alternative Approach: Matrix Strategy

Could also use a matrix strategy instead of environment detection:

```yaml
jobs:
  deploy:
    strategy:
      matrix:
        include:
          - environment: staging
            branch: staging
            tags: staging,staging-${{ github.sha }}
            delay: 3
          - environment: production
            branch: main
            tags: latest,production,prod-${{ github.sha }}
            delay: 5
    if: github.ref == format('refs/heads/{0}', matrix.branch)
    # ... steps
```

This is cleaner but requires GitHub Actions runner matrix support.

## Related Issues

- WORKER-WORKFLOW-1: Add test requirements (must complete first)
- BE-WORKFLOW-1: Eliminate BE duplication (same pattern)
- FE-WORKFLOW-1: Eliminate FE duplication (same pattern)
