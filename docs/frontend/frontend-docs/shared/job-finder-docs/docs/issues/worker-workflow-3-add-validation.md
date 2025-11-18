# WORKER-WORKFLOW-3 — Add Automated Post-Deployment Validation

- **Status**: To Do
- **Owner**: Worker A or Worker B
- **Priority**: P2 (Medium)
- **Labels**: priority-p2, repository-worker, type-enhancement, ci-cd, validation
- **Estimated Effort**: 1-2 hours
- **Dependencies**: WORKER-WORKFLOW-1 (test requirements)
- **Related**: See `docs/WORKFLOW_ANALYSIS_WORKER.md` for detailed analysis

## What This Issue Covers

Add automated smoke test validation after Docker deployments to verify the worker is functioning correctly in the deployed environment. Currently smoke tests are manual-only via `smoke-queue.yml`.

## Context

The worker repo has a well-designed smoke testing workflow (`smoke-queue.yml`) but it only runs manually via `workflow_dispatch`. After deployments complete:

1. Docker image is built and pushed to GHCR
2. Watchtower pulls the new image and restarts container
3. **No automated verification** that worker is functioning

**Current State**:

- Staging deployments: No post-deployment validation
- Production deployments: No post-deployment validation
- Smoke tests: Manual only (workflow_dispatch)

**Risk**:

- Broken worker might deploy and run for hours before being noticed
- Queue might not be processing
- Database connections might be failing
- No early warning system

## Tasks

### 1. Create Post-Deployment Smoke Test Job

- [ ] Add smoke test job to consolidated deployment workflow
- [ ] Waits for Watchtower to redeploy (~3-5 min delay)
- [ ] Runs queue pipeline smoke test
- [ ] Uses AI stubs to avoid costs

### 2. Configure Environment-Specific Smoke Tests

- [ ] Staging: Quick smoke test (~5 min)
- [ ] Production: More thorough smoke test (~10 min)
- [ ] Use appropriate timeouts for each

### 3. Add Failure Handling

- [ ] Fail workflow if smoke test fails
- [ ] Upload detailed test results as artifacts
- [ ] Send notification on failure (optional)
- [ ] Consider rollback automation (future)

### 4. Optimize Smoke Test for Automation

- [ ] Ensure smoke test script exits with proper codes
- [ ] Add retry logic for transient failures
- [ ] Reduce timeout for faster feedback
- [ ] Use minimal test cases for speed

### 5. Update Documentation

- [ ] Document automated smoke testing
- [ ] Update deployment runbook
- [ ] Add troubleshooting guide

## Proposed Implementation

### Option A: Simple Wait + Smoke Test

```yaml
name: Build and Deploy Worker

jobs:
  test:
    uses: ./.github/workflows/tests.yml

  deploy:
    needs: test
    # ... docker build and push steps

  smoke-test:
    needs: deploy
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Wait for Watchtower deployment
        run: |
          ENV="${{ steps.env.outputs.environment }}"
          DELAY="${{ steps.env.outputs.deploy_delay }}"
          echo "Waiting ${DELAY} minutes for Watchtower to redeploy..."
          sleep $((DELAY * 60))
          echo "Waiting additional 30s for container startup..."
          sleep 30

      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: "pip"

      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt -r requirements-test.txt

      - name: Set up credentials
        env:
          FIREBASE_CREDENTIALS: ${{ secrets.FIREBASE_CREDENTIALS }}
        run: |
          mkdir -p credentials
          echo "$FIREBASE_CREDENTIALS" > credentials/serviceAccountKey.json

      - name: Run smoke test
        env:
          GOOGLE_APPLICATION_CREDENTIALS: ${{ github.workspace }}/credentials/serviceAccountKey.json
          USE_AI_STUBS: "true"
          PYTHONPATH: ${{ github.workspace }}/src
        run: |
          ENV="${{ steps.env.outputs.environment }}"
          python scripts/smoke/queue_pipeline_smoke.py \
            --env ${ENV} \
            --timeout 300 \
            --verbose

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: smoke-test-results-${{ steps.env.outputs.environment }}
          path: test_results/queue_smoke/
          retention-days: 7

      - name: Check validation status
        run: |
          REPORT_FILE=$(find test_results/queue_smoke -name "report.json" -type f -print0 | xargs -0 ls -t | head -n 1)

          if [ -f "$REPORT_FILE" ]; then
            PASSED=$(python -c "import json; data=json.load(open('$REPORT_FILE')); print(data['validation']['passed'])")

            if [ "$PASSED" = "True" ]; then
              echo "✅ Smoke test validation PASSED"
              exit 0
            else
              echo "❌ Smoke test validation FAILED"
              echo "::error::Post-deployment smoke test failed. Check artifacts for details."
              exit 1
            fi
          else
            echo "❌ No report file found"
            exit 1
          fi
```

### Option B: Webhook-Based Validation (Advanced)

Instead of waiting for Watchtower, set up a webhook from the worker container that notifies GitHub when it's ready:

```yaml
smoke-test:
  needs: deploy
  steps:
    - name: Wait for deployment ready webhook
      uses: actions/github-script@v7
      with:
        script: |
          // Poll for webhook event indicating worker is ready
          // Then run smoke test
```

**Benefit**: Faster feedback (no fixed delay)
**Drawback**: Requires worker code changes

## Acceptance Criteria

- [ ] Smoke test runs automatically after staging deployments
- [ ] Smoke test runs automatically after production deployments
- [ ] Smoke test waits for Watchtower redeployment
- [ ] Smoke test uses AI stubs (no cost)
- [ ] Failed smoke test fails the workflow
- [ ] Test results uploaded as artifacts
- [ ] Detailed error messages on failure
- [ ] Total deployment time < 15 minutes (including smoke test)

## Benefits

- **Early detection**: Catch broken deployments within minutes
- **Confidence**: Know deployment is working before leaving
- **Automation**: No manual smoke testing required
- **Audit trail**: Test results archived for every deployment
- **Rollback trigger**: Can automate rollback on failure (future)

## Performance Impact

| Phase             | Current   | After      | Change    |
| ----------------- | --------- | ---------- | --------- |
| Build + Push      | ~5-8 min  | ~5-8 min   | No change |
| Watchtower deploy | ~3-5 min  | ~3-5 min   | No change |
| Smoke test        | Manual    | ~5 min     | +5 min    |
| **Total**         | ~8-13 min | ~13-18 min | +5 min    |

**Tradeoff**: +5 minutes deployment time for automated validation

## Cost Impact

- Smoke tests use AI stubs: **$0 cost**
- GitHub Actions minutes: ~5 min per deployment
- Monthly cost: ~15-20 deployments × 5 min = **75-100 minutes/month**
- Well within free tier (2,000 minutes/month)

## Testing Plan

1. Create feature branch: `feature/add-automated-smoke-tests`
2. Implement Option A (simple wait + smoke test)
3. Test on staging deployment:
   - Push to staging
   - Verify Docker build completes
   - Verify smoke test waits for Watchtower
   - Verify smoke test runs and passes
4. Test failure scenario:
   - Temporarily break worker (bad config)
   - Push to staging
   - Verify smoke test detects failure
   - Verify workflow fails with clear error
5. Test on production deployment (after staging success)
6. Merge to staging, then main

## Notes

- This is **optional** but highly recommended
- Similar to BE-WORKFLOW-3 (post-deployment validation)
- Consider this after WORKER-WORKFLOW-1 and WORKER-WORKFLOW-2
- Could add Slack/Discord notifications on failure (future)
- Could add automated rollback on failure (future)

## Alternative: Health Check Endpoint

Instead of running smoke tests, could add a `/health` endpoint to the worker:

```python
# In worker code
@app.route('/health')
def health():
    # Check database connection
    # Check queue access
    # Check AI provider access
    return {"status": "healthy"}
```

Then deployment workflow just hits the health endpoint:

```yaml
- name: Check worker health
  run: |
    curl -f http://worker-staging:8080/health || exit 1
```

**Benefit**: Faster (no full smoke test)
**Drawback**: Less thorough (doesn't test actual queue processing)

## Future Enhancements

- Automated rollback on smoke test failure
- Slack/Discord notifications
- Performance regression detection
- Canary deployments with gradual rollout

## Related Issues

- WORKER-WORKFLOW-1: Add test requirements (prerequisite)
- WORKER-WORKFLOW-2: Eliminate duplication (recommended first)
- BE-WORKFLOW-3: Add BE validation (similar pattern)
