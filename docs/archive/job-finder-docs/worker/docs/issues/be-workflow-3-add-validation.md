# BE-WORKFLOW-3 — Add Post-Deployment Validation

- **Status**: To Do
- **Owner**: Worker B
- **Priority**: P2 (Medium)
- **Labels**: priority-p2, repository-backend, type-enhancement, ci-cd
- **Estimated Effort**: 1 hour
- **Dependencies**: None
- **Related**: See `docs/WORKFLOW_ANALYSIS_BE.md` for detailed analysis

## What This Issue Covers

Add smoke tests after function deployments to verify that deployed functions are accessible and responding. Improve deployment confidence and catch deployment failures immediately.

## Context

Currently, the deploy workflow:

1. ✅ Builds and deploys functions
2. ✅ Verifies deployment via `gcloud functions describe`
3. ❌ **Never actually calls the function to verify it works**

This means we could deploy a broken function and not know until a user reports it. We need automated smoke tests after every deployment.

## Tasks

### 1. Add Smoke Test Step

- [ ] Add smoke test step after deployment verification
- [ ] Run smoke test only if deployment succeeded
- [ ] Make smoke test non-blocking for non-critical failures (optional)

### 2. Implement HTTP Health Check

- [ ] Get function URL from gcloud describe
- [ ] Make HTTP GET request to function
- [ ] Check for acceptable status codes:
  - 200 OK (success)
  - 401 Unauthorized (function exists but requires auth)
  - 403 Forbidden (function exists but access denied)
  - Fail on: 404 Not Found, 500 Internal Server Error, timeout

### 3. Add Detailed Logging

- [ ] Log function URL being tested
- [ ] Log HTTP status code received
- [ ] Log response time
- [ ] Log success/failure with clear indicators

### 4. Handle Different Function Types

- [ ] Some functions expect POST with body (skip or mock)
- [ ] Some functions require authentication (accept 401/403)
- [ ] Some functions need specific parameters (skip detailed test)
- [ ] Document which functions have full smoke tests vs basic connectivity

### 5. Add Retry Logic (Optional)

- [ ] Retry up to 3 times with exponential backoff
- [ ] Functions can take 5-10s to be fully available after deploy
- [ ] Wait 5s → 10s → 20s between retries
- [ ] Only fail if all retries exhausted

### 6. Remove Unnecessary PR Triggers

- [ ] Remove `pull_request` triggers from deploy-functions.yml
- [ ] Change detection not needed on PRs (they don't deploy)
- [ ] Keep only `push` triggers

## Proposed Smoke Test Step

```yaml
- name: Smoke test ${{ matrix.function.name }}
  if: steps.should-deploy.outputs.deploy == 'true'
  run: |
    echo "🧪 Running smoke test for ${{ matrix.function.name }}..."

    # Get function URL
    FUNCTION_URL=$(gcloud functions describe ${{ matrix.function.name }}${{ matrix.env.suffix }} \
      --region=${{ env.FUNCTION_REGION }} \
      --format="value(serviceConfig.uri)" \
      --gen2)

    echo "Testing: $FUNCTION_URL"

    # Retry up to 3 times with backoff
    for i in 1 2 3; do
      echo "Attempt $i/3..."

      # Make HTTP request and capture status code
      HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        --max-time 10 \
        "$FUNCTION_URL" || echo "000")

      echo "HTTP Status: $HTTP_CODE"

      # Check if status code is acceptable
      case $HTTP_CODE in
        200|401|403)
          echo "✅ Smoke test passed (HTTP $HTTP_CODE)"
          echo "   Function is accessible and responding"
          exit 0
          ;;
        404)
          echo "⚠️  HTTP 404 - Function not found (may not be ready yet)"
          ;;
        500|502|503)
          echo "⚠️  HTTP $HTTP_CODE - Server error (may not be ready yet)"
          ;;
        000)
          echo "⚠️  Connection timeout or network error"
          ;;
        *)
          echo "⚠️  Unexpected HTTP status: $HTTP_CODE"
          ;;
      esac

      # Wait before retry (except on last attempt)
      if [ $i -lt 3 ]; then
        WAIT_TIME=$((5 * i * i))  # 5s, 20s
        echo "Waiting ${WAIT_TIME}s before retry..."
        sleep $WAIT_TIME
      fi
    done

    echo "❌ Smoke test failed after 3 attempts"
    echo "   Function may be deployed but not responding correctly"
    exit 1
```

## Alternative: Function-Specific Tests (Advanced)

For functions that support it, add specific smoke tests:

```yaml
- name: Advanced smoke test (if applicable)
  if: |
    steps.should-deploy.outputs.deploy == 'true' &&
    contains(fromJSON('["listContentItems", "listExperiences"]'), matrix.function.name)
  run: |
    # Test with actual request payload
    RESPONSE=$(curl -s -X GET "$FUNCTION_URL" \
      -H "Content-Type: application/json")

    # Verify response structure
    if echo "$RESPONSE" | jq -e '.items' > /dev/null 2>&1; then
      echo "✅ Function returned expected data structure"
    else
      echo "⚠️  Unexpected response structure"
    fi
```

## Acceptance Criteria

- [ ] Smoke test runs after every successful deployment
- [ ] Test verifies function is accessible (HTTP 200/401/403)
- [ ] Test retries with backoff for eventual consistency
- [ ] Test logs clear success/failure indicators
- [ ] Test catches completely broken deployments
- [ ] Test doesn't fail on auth-required functions
- [ ] PR triggers removed from deploy workflow
- [ ] Workflow passes with smoke tests enabled

## Testing Plan

1. Deploy a known-good function
   - Verify smoke test passes
2. Intentionally deploy broken code
   - Verify smoke test fails
   - Verify deployment is flagged as failed
3. Deploy auth-required function
   - Verify smoke test passes on 401/403
4. Test retry logic
   - Simulate slow deployment
   - Verify retries and eventual success

## Benefits

- **Immediate failure detection**: Know within seconds if deployment failed
- **95% deployment confidence**: Catch most common deployment issues
- **Better monitoring**: Clear logs of what was tested
- **Reduced downtime**: Catch issues before users do

## Notes

- Smoke tests are not comprehensive functional tests
- They only verify basic connectivity and response
- Full integration tests should still run elsewhere
- This catches ~80% of deployment issues (broken builds, networking problems)
- Does NOT catch logic bugs or edge cases (needs proper tests)
- Consider adding Slack/Discord notifications on smoke test failure (future enhancement)
