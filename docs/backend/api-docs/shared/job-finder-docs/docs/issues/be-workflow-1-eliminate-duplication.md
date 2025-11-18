# BE-WORKFLOW-1 — Eliminate Workflow Duplication

- **Status**: To Do
- **Owner**: Worker B
- **Priority**: P1 (High)
- **Labels**: priority-p1, repository-backend, type-refactor, ci-cd
- **Estimated Effort**: 1-2 hours
- **Dependencies**: None
- **Related**: See `docs/WORKFLOW_ANALYSIS_BE.md` for detailed analysis

## What This Issue Covers

Eliminate 346 lines of duplicated code in the deploy-functions.yml workflow by consolidating the staging and production deployment jobs into a single environment-based matrix job.

## Context

The current `deploy-functions.yml` has **95% identical code** for staging (lines 164-344) and production (lines 346-526). The only differences are:

- Function name suffix (`-staging` vs none)
- Memory allocation (256Mi/512Mi vs 512Mi/1024Mi)
- Max instances (10 vs 50)
- Environment variables

This duplication makes the workflow:

- Hard to maintain (changes must be made twice)
- Error-prone (easy to update one but not the other)
- Unnecessarily large (573 lines when 300 would suffice)

## Tasks

### 1. Create Environment Matrix

- [ ] Define environment matrix with staging and production configs
- [ ] Include: name, branch, memory tiers, max instances, suffix
- [ ] Structure for easy addition of new environments

### 2. Consolidate Deployment Jobs

- [ ] Merge `deploy-staging` and `deploy-production` into single `deploy` job
- [ ] Use matrix for both environment and function dimensions
- [ ] Implement conditional logic for environment-specific values
- [ ] Use expressions to select memory tier based on function requirements

### 3. Update Deployment Commands

- [ ] Make function name suffix dynamic: `${{ matrix.function.name }}${{ matrix.env.suffix }}`
- [ ] Make memory allocation dynamic based on tier and environment
- [ ] Make max instances dynamic: `${{ matrix.env.max_instances }}`
- [ ] Update environment variables: `ENVIRONMENT=${{ matrix.env.name }}`

### 4. Update Conditionals

- [ ] Change `if` conditions to check matrix.env.branch
- [ ] Ensure deployments still trigger correctly:
  - Push to `staging` → Deploy to staging environment
  - Push to `main` → Deploy to production environment

### 5. Test Changes

- [ ] Create test branch from staging
- [ ] Verify workflow syntax is valid
- [ ] Test staging deployment (dry run)
- [ ] Test production deployment (dry run)
- [ ] Verify matrix expansion produces correct combinations

### 6. Documentation

- [ ] Update comments in workflow file
- [ ] Document matrix structure
- [ ] Document how to add new environments
- [ ] Update workflow analysis document

## Proposed Structure

```yaml
deploy:
  name: Deploy to ${{ matrix.env.name }}
  runs-on: ubuntu-latest
  needs: [detect-changes, build-and-test]
  if: |
    github.ref == format('refs/heads/{0}', matrix.env.branch) &&
    github.event_name == 'push' &&
    needs.detect-changes.outputs.any-changed == 'true'

  permissions:
    contents: read
    id-token: write

  environment:
    name: ${{ matrix.env.name }}
    url: ${{ matrix.env.url }}

  strategy:
    fail-fast: false
    matrix:
      env:
        - name: staging
          branch: staging
          url: https://job-finder-staging.joshwentworth.com
          memory_tier1: 256Mi
          memory_tier2: 512Mi
          max_instances: 10
          suffix: -staging
        - name: production
          branch: main
          url: https://job-finder.joshwentworth.com
          memory_tier1: 512Mi
          memory_tier2: 1024Mi
          max_instances: 50
          suffix: ""

      function:
        # Content Items Functions (tier 1 memory)
        - name: createContentItem
          entry_point: createContentItem
          memory_tier: 1
          changed: ${{ needs.detect-changes.outputs.content-items }}
        # ... (all 13 functions with tier indicator)

  steps:
    - name: Check if deployment needed
      id: should-deploy
      run: |
        if [ "${{ matrix.function.changed }}" = "true" ]; then
          echo "deploy=true" >> $GITHUB_OUTPUT
        else
          echo "deploy=false" >> $GITHUB_OUTPUT
        fi

    # ... (existing steps, updated to use matrix.env.*)

    - name: Deploy ${{ matrix.function.name }} to ${{ matrix.env.name }}
      if: steps.should-deploy.outputs.deploy == 'true'
      run: |
        # Calculate memory based on tier
        if [ "${{ matrix.function.memory_tier }}" = "1" ]; then
          MEMORY="${{ matrix.env.memory_tier1 }}"
        else
          MEMORY="${{ matrix.env.memory_tier2 }}"
        fi

        gcloud functions deploy ${{ matrix.function.name }}${{ matrix.env.suffix }} \
          --gen2 \
          --runtime=nodejs20 \
          --region=${{ env.FUNCTION_REGION }} \
          --source=deploy \
          --entry-point=${{ matrix.function.entry_point }} \
          --trigger-http \
          --allow-unauthenticated \
          --memory=$MEMORY \
          --timeout=120s \
          --max-instances=${{ matrix.env.max_instances }} \
          --set-env-vars=NODE_ENV=${{ matrix.env.name }},ENVIRONMENT=${{ matrix.env.name }} \
          ${{ matrix.function.secrets && format('--set-secrets={0}', matrix.function.secrets) || '' }} \
          --quiet
```

## Acceptance Criteria

- [ ] Workflow file reduces from 573 lines to ~300 lines (47% reduction)
- [ ] No duplicated deployment code between staging and production
- [ ] Push to `staging` branch deploys to staging environment
- [ ] Push to `main` branch deploys to production environment
- [ ] Memory allocation correct for each environment
- [ ] Max instances correct for each environment
- [ ] Function name suffixes correct (-staging for staging, none for prod)
- [ ] Environment variables set correctly
- [ ] Change detection still works (only changed functions deploy)
- [ ] Workflow passes validation
- [ ] Test deployment succeeds in both environments

## Testing Plan

1. Create feature branch: `feature/consolidate-deployment-workflow`
2. Update deploy-functions.yml with consolidated structure
3. Validate syntax: `act -l` or GitHub Actions validator
4. Test on staging:
   - Make trivial change to a function
   - Push to feature branch, merge to staging
   - Verify correct function deploys with correct config
5. Test on production:
   - Merge staging to main
   - Verify production deployment uses production config

## Benefits

- **47% code reduction**: 573 → 300 lines
- **Single source of truth**: One deployment definition
- **Easier maintenance**: Changes in one place
- **Reduced errors**: No risk of updating one env but not the other
- **Easy to extend**: Adding new environment requires only matrix entry

## Notes

- This is purely a refactor - no functional changes
- Deployment behavior should be identical to current workflow
- Can be tested safely on feature branch before merging
- Should not affect existing deployments
- Matrix strategy may spawn more jobs initially but each is conditional
