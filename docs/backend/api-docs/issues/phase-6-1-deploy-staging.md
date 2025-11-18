# PHASE-6-1 — Deploy to Staging Environment

> **Context**: See [README.md](../../README.md) for deployment instructions and [BACKEND_MIGRATION_PLAN.md](../../../docs/architecture/BACKEND_MIGRATION_PLAN.md) for deployment strategy
> **Architecture**: Firebase staging environment with monitoring and smoke tests

---

## Issue Metadata

```yaml
Title: PHASE-6-1 — Deploy to Staging Environment
Labels: priority-p2, repository-backend, type-deployment, status-todo, phase-6
Assignee: Worker A
Priority: P2-Medium
Estimated Effort: 4-6 hours
Repository: job-finder-BE
```

---

## Summary

**Problem**: Before deploying to production, the backend must be deployed to a staging environment for final validation, smoke testing, and integration testing with the frontend staging deployment.

**Goal**: Successfully deploy all backend functions to Firebase staging environment, configure monitoring and logging, run smoke tests to verify deployment health, and validate integration with job-finder-FE staging.

**Impact**: Provides safe environment for final testing before production release. Catches deployment-specific issues and validates complete system integration.

---

## Architecture References

> **📚 Read these docs first for context:**

- **[README.md](../../README.md)** - Deployment commands and configuration
- **[BACKEND_MIGRATION_PLAN.md](../../../docs/architecture/BACKEND_MIGRATION_PLAN.md)** - Phase 6, Task 6.1
- **Firebase Deployment**: https://firebase.google.com/docs/functions/manage-functions

**Key concepts to understand**:
- Staging Environment: Separate Firebase project for pre-production testing
- Smoke Tests: Quick validation that critical functionality works
- Blue-Green Deployment: Zero-downtime deployment strategy

---

## Tasks

### Phase 1: Pre-Deployment Checklist
1. **Verify all tests pass**
   - What: Run complete test suite locally
   - Where: Local development environment
   - Why: Ensure code quality before deployment
   - Test: `npm test` passes all tests

2. **Build production bundle**
   - What: Compile TypeScript and optimize for production
   - Where: Local build process
   - Why: Create deployable artifact
   - Test: `npm run build` succeeds, dist/ folder created

3. **Review environment configuration**
   - What: Verify staging environment variables and secrets
   - Where: Firebase console and Secret Manager
   - Why: Ensure correct configuration for staging
   - Test: All required secrets exist in staging project

### Phase 2: Deployment Execution
4. **Deploy functions to staging**
   - What: Use Firebase CLI to deploy all functions
   - Where: Firebase staging project
   - Why: Make functions available in staging environment
   - Test: All functions appear in Firebase console

5. **Deploy Firestore rules and indexes**
   - What: Deploy security rules and composite indexes
   - Where: Firebase staging project
   - Why: Ensure database security and query performance
   - Test: Rules and indexes visible in Firebase console

6. **Deploy storage rules**
   - What: Deploy Firebase Storage security rules
   - Where: Firebase staging project
   - Why: Secure document storage
   - Test: Storage rules active in Firebase console

### Phase 3: Post-Deployment Validation
7. **Run smoke tests**
   - What: Execute critical path tests against staging
   - Where: Smoke test script against staging URLs
   - Why: Verify deployment health
   - Test: All smoke tests pass

8. **Configure monitoring and alerts**
   - What: Set up Cloud Monitoring dashboards and alerts
   - Where: Google Cloud Console
   - Why: Track function performance and errors
   - Test: Dashboards show data, alerts configured

9. **Test frontend integration**
   - What: Verify job-finder-FE staging communicates with backend
   - Where: Frontend staging environment
   - Why: Validate complete system integration
   - Test: Frontend can submit jobs, generate documents

### Phase 4: Documentation and Validation
10. **Document deployment process**
    - What: Create deployment runbook
    - Where: `docs/DEPLOYMENT.md`
    - Why: Standardize deployment procedure
    - Test: Runbook complete and accurate

11. **Verify logging and debugging**
    - What: Check function logs in Firebase console
    - Where: Firebase Console → Functions → Logs
    - Why: Ensure proper logging for debugging
    - Test: Logs capture function executions and errors

---

## Technical Details

### Deployment Commands

```bash
# Pre-deployment checks
npm run lint
npm test
npm run build

# Switch to staging project
firebase use staging

# Deploy everything (functions, rules, indexes)
firebase deploy

# Or deploy selectively
firebase deploy --only functions
firebase deploy --only firestore:rules,firestore:indexes
firebase deploy --only storage

# Verify deployment
firebase functions:list
```

### Smoke Test Script

```bash
# smoke-tests.sh
#!/bin/bash

STAGING_URL="https://us-central1-job-finder-staging.cloudfunctions.net"
AUTH_TOKEN="your-staging-auth-token"

echo "Running smoke tests against staging..."

# Test 1: Health check
echo "Test 1: Health check"
RESPONSE=$(curl -s "$STAGING_URL/health")
if [[ $RESPONSE == *"healthy"* ]]; then
  echo "✓ Health check passed"
else
  echo "✗ Health check failed"
  exit 1
fi

# Test 2: Submit job (requires auth)
echo "Test 2: Submit job"
RESPONSE=$(curl -s -X POST "$STAGING_URL/submitJob" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"data":{"url":"https://test.com/job","companyName":"Test"}}')

if [[ $RESPONSE == *"\"success\":true"* ]]; then
  echo "✓ Job submission passed"
else
  echo "✗ Job submission failed"
  exit 1
fi

# Test 3: Get queue stats (requires editor auth)
echo "Test 3: Get queue stats"
RESPONSE=$(curl -s -X POST "$STAGING_URL/getQueueStats" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"data":{}}')

if [[ $RESPONSE == *"\"success\":true"* ]]; then
  echo "✓ Queue stats passed"
else
  echo "✗ Queue stats failed"
  exit 1
fi

# Test 4: Get stop list
echo "Test 4: Get configuration"
RESPONSE=$(curl -s -X POST "$STAGING_URL/getStopList" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"data":{}}')

if [[ $RESPONSE == *"\"success\":true"* ]]; then
  echo "✓ Configuration retrieval passed"
else
  echo "✗ Configuration retrieval failed"
  exit 1
fi

echo "All smoke tests passed!"
```

### Monitoring Configuration

**Key Metrics to Monitor**:
- Function execution count
- Function execution time (p50, p95, p99)
- Error rate and error types
- Memory usage
- Cold start frequency
- Firestore read/write operations
- Secret Manager access count

**Alert Conditions**:
- Error rate > 5% for 5 minutes
- Function execution time p95 > 10 seconds
- Function crashes > 10 per hour
- Firestore quota exceeded

### Key Implementation Notes

**Deployment Script** (`scripts/deploy-staging.sh`):
```bash
#!/bin/bash
set -e

echo "Starting staging deployment..."

# Pre-deployment checks
echo "Running pre-deployment checks..."
npm run lint
npm test
npm run build

# Switch to staging
echo "Switching to staging project..."
firebase use staging

# Deploy functions
echo "Deploying functions..."
firebase deploy --only functions --force

# Deploy Firestore configuration
echo "Deploying Firestore rules and indexes..."
firebase deploy --only firestore:rules,firestore:indexes

# Deploy storage rules
echo "Deploying storage rules..."
firebase deploy --only storage

# Verify deployment
echo "Verifying deployment..."
firebase functions:list

# Run smoke tests
echo "Running smoke tests..."
./scripts/smoke-tests.sh

echo "Staging deployment complete!"
```

**Monitoring Dashboard Setup**:
```typescript
// scripts/setup-monitoring.ts
import { Logging } from '@google-cloud/logging';
import { Monitoring } from '@google-cloud/monitoring';

export async function setupMonitoring(projectId: string) {
  const monitoring = new Monitoring.MetricServiceClient();

  // Create custom metrics
  const customMetrics = [
    {
      type: 'custom.googleapis.com/function/job_submissions',
      description: 'Number of job submissions',
    },
    {
      type: 'custom.googleapis.com/function/document_generations',
      description: 'Number of document generations',
    },
  ];

  for (const metric of customMetrics) {
    await monitoring.createMetricDescriptor({
      name: `projects/${projectId}`,
      metricDescriptor: metric,
    });
  }

  // Create alert policies
  // ... alert configuration
}
```

---

## Acceptance Criteria

- [ ] **All tests pass**: Local test suite succeeds before deployment
- [ ] **Build succeeds**: Production bundle created without errors
- [ ] **Functions deployed**: All functions visible in Firebase console
- [ ] **Rules deployed**: Firestore and Storage rules active
- [ ] **Indexes deployed**: Composite indexes created
- [ ] **Smoke tests pass**: All critical paths validated
- [ ] **Monitoring configured**: Dashboards and alerts set up
- [ ] **Logs working**: Function executions appear in logs
- [ ] **Frontend integration**: Staging frontend communicates with backend
- [ ] **Documentation complete**: Deployment runbook created

---

## Testing

### Deployment Validation

```bash
# Step 1: Pre-deployment
npm run lint && npm test && npm run build
# All should pass

# Step 2: Deploy to staging
firebase use staging
firebase deploy

# Step 3: Verify functions deployed
firebase functions:list
# Should show all functions

# Step 4: Check function URLs
firebase functions:list | grep https://
# Should show staging URLs

# Step 5: Run smoke tests
./scripts/smoke-tests.sh
# All tests should pass

# Step 6: Check logs
firebase functions:log --only submitJob
# Should show recent executions
```

### Manual Testing

```bash
# Test 1: Submit job via staging URL
curl -X POST https://us-central1-job-finder-staging.cloudfunctions.net/submitJob \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"data":{"url":"https://test.com/job","companyName":"Test"}}'

# Test 2: Check Firestore
# Go to Firebase Console → Firestore
# Verify queue item created

# Test 3: Check function logs
# Go to Firebase Console → Functions → submitJob → Logs
# Verify execution logged

# Test 4: Test from frontend
# Open https://job-finder-staging.web.app
# Submit a job through UI
# Verify it works end-to-end
```

---

## Commit Message Template

```
deploy(staging): deploy backend to staging environment

Successfully deploy all backend functions to Firebase staging environment
with Firestore rules, storage rules, and composite indexes. Configure
monitoring, run smoke tests, and validate frontend integration.

Key changes:
- Deploy all Cloud Functions to staging project
- Deploy Firestore security rules and indexes
- Deploy Firebase Storage rules
- Create deployment script and smoke test suite
- Configure Cloud Monitoring dashboards and alerts
- Validate frontend integration with staging backend
- Document deployment process

Testing:
- All pre-deployment tests pass
- All functions deployed successfully
- Smoke tests pass for critical paths
- Frontend staging integrates correctly
- Monitoring dashboards showing data
- Logs capturing function executions

Closes #11
```

---

## Related Issues

- **Depends on**: #1-10 (All development and testing complete)
- **Blocks**: #12 (Production deployment)
- **Related**: BACKEND_MIGRATION_PLAN.md Phase 6, Task 6.1

---

## Resources

### Documentation
- **Firebase Deployment**: https://firebase.google.com/docs/cli#deployment
- **Cloud Monitoring**: https://cloud.google.com/monitoring/docs
- **Firebase Functions Logs**: https://firebase.google.com/docs/functions/writing-and-viewing-logs

---

## Success Metrics

**How we'll measure success**:
- Zero deployment errors
- All smoke tests pass (100% success rate)
- Function cold start < 3 seconds
- Function execution time < 5 seconds (p95)
- Error rate < 1%
- Frontend integration fully functional

---

## Notes

**Implementation Tips**:
- Deploy during low-traffic hours if possible
- Keep rollback plan ready (previous deployment version)
- Monitor logs actively for 1 hour after deployment
- Test all critical user workflows manually
- Verify secrets are accessible from functions
- Check CORS configuration allows frontend requests
- Ensure rate limiting is appropriate for staging
- Test with real user accounts (not just test accounts)

**Rollback Procedure**:
```bash
# If issues found, rollback to previous version
firebase deploy --only functions:functionName --force
# Or use Firebase Console → Functions → Versions → Rollback
```

**Common Issues**:
- Missing secrets: Verify Secret Manager permissions
- CORS errors: Check allowed origins in config
- Firestore permission errors: Verify rules deployed
- Function timeouts: Check memory and timeout settings
- Cold starts: Consider minimum instances for critical functions

---

**Created**: 2025-10-20
**Created By**: PM
**Last Updated**: 2025-10-20
**Status**: Todo
