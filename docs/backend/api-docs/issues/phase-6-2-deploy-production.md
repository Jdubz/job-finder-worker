# PHASE-6-2 — Production Deployment with Zero-Downtime

> **Context**: See [README.md](../../README.md) for deployment instructions and [BACKEND_MIGRATION_PLAN.md](../../../docs/architecture/BACKEND_MIGRATION_PLAN.md) for deployment strategy
> **Architecture**: Blue-green deployment to Firebase production with monitoring and rollback plan

---

## Issue Metadata

```yaml
Title: PHASE-6-2 — Production Deployment with Zero-Downtime
Labels: priority-p2, repository-backend, type-deployment, status-todo, phase-6
Assignee: Worker A
Priority: P2-Medium
Estimated Effort: 6-8 hours
Repository: job-finder-BE
```

---

## Summary

**Problem**: After successful staging validation, the backend needs to be deployed to production with zero downtime, comprehensive monitoring, and a tested rollback plan in case of issues.

**Goal**: Execute production deployment of all backend functions following zero-downtime strategy, implement production monitoring and alerting, validate complete system functionality, and ensure rollback procedures are documented and tested.

**Impact**: Completes backend migration from portfolio to dedicated job-finder-BE repository. Enables production users to access all backend functionality with confidence in system reliability and recoverability.

---

## Architecture References

> **📚 Read these docs first for context:**

- **[README.md](../../README.md)** - Production deployment commands
- **[BACKEND_MIGRATION_PLAN.md](../../../docs/architecture/BACKEND_MIGRATION_PLAN.md)** - Phase 6, Task 6.2 - Deployment strategy
- **Zero-Downtime Deployment**: https://firebase.google.com/docs/functions/manage-functions#deployment

**Key concepts to understand**:
- Blue-Green Deployment: New version deployed alongside old, traffic switched when ready
- Gradual Rollout: Deploy to subset of users first, then full rollout
- Rollback Plan: Documented procedure to revert to previous version if issues arise

---

## Tasks

### Phase 1: Pre-Production Preparation
1. **Final staging validation**
   - What: Comprehensive testing in staging environment
   - Where: Staging environment
   - Why: Final confidence check before production
   - Test: All workflows tested successfully in staging

2. **Backup production data**
   - What: Export Firestore data and function configurations
   - Where: Firebase console and gcloud CLI
   - Why: Enable recovery if deployment fails
   - Test: Backups created and verified

3. **Review rollback procedures**
   - What: Document and test rollback process
   - Where: `docs/ROLLBACK.md`
   - Why: Ensure quick recovery if issues arise
   - Test: Rollback procedure documented and rehearsed

4. **Notify stakeholders**
   - What: Inform team of deployment window
   - Where: Slack/email communication
   - Why: Ensure team availability for monitoring
   - Test: All stakeholders acknowledged

### Phase 2: Production Deployment
5. **Deploy functions to production**
   - What: Deploy all functions using gradual rollout if possible
   - Where: Firebase production project
   - Why: Make functions available to production users
   - Test: All functions deployed and healthy

6. **Deploy Firestore rules and indexes**
   - What: Deploy security rules and indexes to production
   - Where: Firebase production project
   - Why: Ensure security and performance in production
   - Test: Rules and indexes active

7. **Deploy storage rules**
   - What: Deploy production storage security rules
   - Where: Firebase production project
   - Why: Secure document storage in production
   - Test: Storage rules enforced

8. **Update frontend production URLs**
   - What: Ensure job-finder-FE production points to new backend
   - Where: Frontend production environment variables
   - Why: Direct production traffic to new backend
   - Test: Frontend calls new backend URLs

### Phase 3: Post-Deployment Validation
9. **Run production smoke tests**
   - What: Execute critical path tests against production
   - Where: Production environment
   - Why: Verify deployment health immediately
   - Test: All smoke tests pass

10. **Monitor initial traffic**
    - What: Watch logs, metrics, and errors for 1-2 hours
    - Where: Firebase console, Cloud Monitoring
    - Why: Catch issues early while team is available
    - Test: No critical errors, performance within SLAs

11. **Validate end-to-end workflows**
    - What: Test complete user journeys in production
    - Where: Production environment
    - Why: Ensure all features work correctly
    - Test: Job submission, document generation, configuration work

### Phase 4: Post-Deployment Tasks
12. **Configure production monitoring**
    - What: Set up dashboards, alerts, and SLOs
    - Where: Google Cloud Monitoring
    - Why: Ongoing health monitoring
    - Test: Dashboards show data, alerts configured

13. **Clean up portfolio functions**
    - What: Remove job-finder functions from portfolio project
    - Where: Portfolio repository
    - Why: Complete migration, avoid confusion
    - Test: Only contact form remains in portfolio

14. **Update documentation**
    - What: Update all docs to reflect production URLs
    - Where: README, API docs, deployment docs
    - Why: Ensure documentation is current
    - Test: All docs accurate and up-to-date

---

## Technical Details

### Production Deployment Strategy

**Zero-Downtime Approach**:
1. Deploy new function versions (creates new versions, old remain active)
2. Gradually route traffic to new versions (if supported)
3. Monitor error rates and performance
4. If healthy, route 100% traffic to new versions
5. Delete old versions after validation period

**Deployment Script** (`scripts/deploy-production.sh`):
```bash
#!/bin/bash
set -e

echo "========================================="
echo "PRODUCTION DEPLOYMENT"
echo "========================================="
echo ""

# Pre-deployment confirmation
read -p "Have you completed all staging tests? (yes/no): " staging_confirm
if [ "$staging_confirm" != "yes" ]; then
  echo "❌ Please complete staging tests first"
  exit 1
fi

read -p "Have you backed up production data? (yes/no): " backup_confirm
if [ "$backup_confirm" != "yes" ]; then
  echo "❌ Please backup production data first"
  exit 1
fi

read -p "Are stakeholders notified? (yes/no): " stakeholder_confirm
if [ "$stakeholder_confirm" != "yes" ]; then
  echo "❌ Please notify stakeholders first"
  exit 1
fi

echo ""
echo "Starting production deployment..."
echo ""

# Pre-deployment checks
echo "Step 1: Running pre-deployment checks..."
npm run lint || exit 1
npm test || exit 1
npm run build || exit 1
echo "✓ Pre-deployment checks passed"
echo ""

# Switch to production
echo "Step 2: Switching to production project..."
firebase use production
echo "✓ Using production project"
echo ""

# Deploy functions
echo "Step 3: Deploying functions..."
firebase deploy --only functions --force
echo "✓ Functions deployed"
echo ""

# Deploy Firestore configuration
echo "Step 4: Deploying Firestore rules and indexes..."
firebase deploy --only firestore:rules,firestore:indexes
echo "✓ Firestore configuration deployed"
echo ""

# Deploy storage rules
echo "Step 5: Deploying storage rules..."
firebase deploy --only storage
echo "✓ Storage rules deployed"
echo ""

# Verify deployment
echo "Step 6: Verifying deployment..."
firebase functions:list
echo "✓ Deployment verified"
echo ""

# Run smoke tests
echo "Step 7: Running production smoke tests..."
./scripts/smoke-tests-production.sh
echo "✓ Smoke tests passed"
echo ""

echo "========================================="
echo "✅ PRODUCTION DEPLOYMENT COMPLETE"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Monitor logs for 1-2 hours"
echo "2. Test complete workflows manually"
echo "3. Verify frontend integration"
echo "4. Update documentation"
echo ""
```

**Backup Script** (`scripts/backup-production.sh`):
```bash
#!/bin/bash
set -e

PROJECT_ID="job-finder-production"
BACKUP_DIR="./backups/$(date +%Y%m%d_%H%M%S)"

echo "Creating backup in $BACKUP_DIR..."
mkdir -p "$BACKUP_DIR"

# Export Firestore
echo "Backing up Firestore..."
gcloud firestore export "gs://${PROJECT_ID}-backups/$(date +%Y%m%d_%H%M%S)" \
  --project="$PROJECT_ID"

# Save current function configurations
echo "Backing up function configurations..."
firebase functions:list --json > "$BACKUP_DIR/functions.json"

# Save Firestore rules and indexes
echo "Backing up Firestore configuration..."
cp firestore.rules "$BACKUP_DIR/"
cp firestore.indexes.json "$BACKUP_DIR/"

# Save storage rules
echo "Backing up storage rules..."
cp storage.rules "$BACKUP_DIR/"

echo "✓ Backup complete: $BACKUP_DIR"
```

**Rollback Script** (`scripts/rollback-production.sh`):
```bash
#!/bin/bash
set -e

echo "⚠️  PRODUCTION ROLLBACK"
echo ""
read -p "Are you sure you want to rollback production? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
  echo "Rollback cancelled"
  exit 0
fi

# Switch to production
firebase use production

echo "Rolling back functions..."
# Use Firebase Console or gcloud to rollback to previous version
# firebase functions:rollback <function-name> --version <previous-version>

echo "Restoring Firestore rules..."
# Restore from backup
# firebase deploy --only firestore:rules

echo "Monitoring post-rollback..."
./scripts/smoke-tests-production.sh

echo "✓ Rollback complete"
```

**Production Smoke Tests** (`scripts/smoke-tests-production.sh`):
```bash
#!/bin/bash
set -e

PRODUCTION_URL="https://us-central1-job-finder-production.cloudfunctions.net"
AUTH_TOKEN="$PRODUCTION_AUTH_TOKEN"

echo "Running production smoke tests..."
echo "⚠️  Using PRODUCTION environment"
echo ""

# Test 1: Health check
echo "Test 1: Health check..."
RESPONSE=$(curl -s "$PRODUCTION_URL/health")
if [[ $RESPONSE == *"healthy"* ]]; then
  echo "✓ Health check passed"
else
  echo "✗ Health check FAILED"
  exit 1
fi

# Test 2: Submit test job (will be processed by Python worker)
echo "Test 2: Job submission..."
RESPONSE=$(curl -s -X POST "$PRODUCTION_URL/submitJob" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"data":{"url":"https://example.com/jobs/smoke-test","companyName":"Smoke Test Company"}}')

if [[ $RESPONSE == *"\"success\":true"* ]]; then
  echo "✓ Job submission passed"
else
  echo "✗ Job submission FAILED"
  echo "$RESPONSE"
  exit 1
fi

# Test 3: Configuration retrieval
echo "Test 3: Configuration retrieval..."
RESPONSE=$(curl -s -X POST "$PRODUCTION_URL/getStopList" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"data":{}}')

if [[ $RESPONSE == *"\"success\":true"* ]]; then
  echo "✓ Configuration retrieval passed"
else
  echo "✗ Configuration retrieval FAILED"
  exit 1
fi

# Test 4: Content items retrieval
echo "Test 4: Content items..."
RESPONSE=$(curl -s "$PRODUCTION_URL/manageContentItems" \
  -H "Authorization: Bearer $AUTH_TOKEN")

if [[ $RESPONSE == *"\"success\":true"* ]]; then
  echo "✓ Content items passed"
else
  echo "✗ Content items FAILED"
  exit 1
fi

echo ""
echo "✅ All production smoke tests passed"
```

**Monitoring Configuration**:
```yaml
# monitoring-config.yaml
alertPolicies:
  - displayName: "High Error Rate"
    conditions:
      - threshold:
          filter: 'resource.type="cloud_function" AND metric.type="cloudfunctions.googleapis.com/function/execution_count" AND metric.label.status!="ok"'
          comparison: COMPARISON_GT
          thresholdValue: 10
          duration: 300s
    notificationChannels:
      - projects/job-finder-production/notificationChannels/email

  - displayName: "Function Timeout"
    conditions:
      - threshold:
          filter: 'resource.type="cloud_function" AND metric.type="cloudfunctions.googleapis.com/function/execution_times" AND metric.label.status="timeout"'
          comparison: COMPARISON_GT
          thresholdValue: 5
          duration: 300s

  - displayName: "Memory Exceeded"
    conditions:
      - threshold:
          filter: 'resource.type="cloud_function" AND metric.type="cloudfunctions.googleapis.com/function/user_memory_bytes"'
          comparison: COMPARISON_GT
          thresholdValue: 2147483648  # 2GB
          duration: 60s
```

---

## Acceptance Criteria

- [ ] **Staging validated**: All tests pass in staging
- [ ] **Data backed up**: Production data exported and stored safely
- [ ] **Rollback documented**: Rollback procedure documented and rehearsed
- [ ] **Stakeholders notified**: Team aware of deployment
- [ ] **Functions deployed**: All functions active in production
- [ ] **Rules deployed**: Firestore and storage rules enforced
- [ ] **Smoke tests pass**: Production smoke tests succeed
- [ ] **Traffic validated**: Production traffic flowing to new backend
- [ ] **Monitoring active**: Dashboards and alerts configured
- [ ] **Performance verified**: Functions meeting SLA targets
- [ ] **Documentation updated**: All docs reflect production URLs
- [ ] **Portfolio cleaned**: Job-finder functions removed from portfolio

---

## Testing

### Production Validation

```bash
# Pre-deployment
./scripts/backup-production.sh
# Verify backup created

# Deployment
./scripts/deploy-production.sh
# Follow all prompts, verify each step

# Post-deployment
./scripts/smoke-tests-production.sh
# All tests should pass

# Monitor for 1-2 hours
firebase functions:log --project=job-finder-production
# Watch for errors

# Manual testing
# 1. Submit job through production UI
# 2. Generate document
# 3. Update configuration
# 4. Verify all features work
```

### Performance Validation

```bash
# Check function metrics
gcloud functions describe submitJob \
  --project=job-finder-production \
  --region=us-central1

# View error rates
gcloud logging read "resource.type=cloud_function AND severity>=ERROR" \
  --project=job-finder-production \
  --limit=50

# Check cold start times
# Firebase Console → Functions → Performance tab
```

---

## Commit Message Template

```
deploy(production): deploy backend to production environment

Successfully deploy complete backend system to Firebase production with
zero-downtime strategy. Includes monitoring, smoke tests, performance
validation, and documentation updates. Completes backend migration from
portfolio to dedicated job-finder-BE repository.

Key changes:
- Deploy all Cloud Functions to production project
- Deploy Firestore security rules and composite indexes
- Deploy Firebase Storage rules
- Execute production smoke tests successfully
- Configure production monitoring and alerts
- Validate zero-downtime deployment
- Update all documentation with production URLs
- Clean up job-finder functions from portfolio project

Testing:
- Staging tests passed before deployment
- Production data backed up
- All smoke tests passed in production
- End-to-end workflows validated
- Monitoring dashboards showing healthy metrics
- Error rate < 1%, performance within SLAs

Closes #12
```

---

## Related Issues

- **Depends on**: #11 (Staging deployment successful)
- **Completes**: Backend migration project
- **Related**: BACKEND_MIGRATION_PLAN.md Phase 6, Task 6.2

---

## Resources

### Documentation
- **Firebase Production Best Practices**: https://firebase.google.com/docs/functions/best-practices
- **Cloud Monitoring**: https://cloud.google.com/monitoring
- **Disaster Recovery**: https://firebase.google.com/docs/firestore/solutions/schedule-export

---

## Success Metrics

**How we'll measure success**:
- Zero downtime during deployment
- < 1% error rate post-deployment
- Function response times within SLA (p95 < 5s)
- All critical workflows functional
- No rollback required
- Production monitoring and alerts active
- Complete migration from portfolio

---

## Notes

**Implementation Tips**:
- Deploy during low-traffic hours (early morning)
- Have full team available for monitoring
- Test rollback procedure before deployment
- Keep staging environment running during deployment
- Monitor actively for first 2-4 hours
- Have rollback plan ready to execute quickly
- Document any issues encountered
- Communicate status to stakeholders regularly

**Post-Deployment Checklist**:
- [ ] All functions responding correctly
- [ ] Frontend production integrated
- [ ] Error rates normal
- [ ] Performance within SLAs
- [ ] Monitoring dashboards showing data
- [ ] Alerts configured and tested
- [ ] Documentation updated
- [ ] Portfolio functions removed
- [ ] Team debriefing completed
- [ ] Lessons learned documented

**Rollback Triggers**:
- Error rate > 10%
- Function timeouts > 20% of requests
- Complete function failure
- Data corruption detected
- Frontend integration broken
- Critical security issue discovered

**Communication Template**:
```
PRODUCTION DEPLOYMENT NOTIFICATION

Start Time: [TIME]
Estimated Duration: 1-2 hours
Expected Impact: None (zero-downtime)

What's being deployed:
- Complete backend migration from portfolio to job-finder-BE
- All Cloud Functions updated
- Firestore and Storage rules updated

Monitoring plan:
- Active monitoring for 2 hours post-deployment
- Smoke tests every 15 minutes
- Performance metrics tracked

Contact: [LEAD ENGINEER]
Status updates: [SLACK CHANNEL]
```

---

**Created**: 2025-10-20
**Created By**: PM
**Last Updated**: 2025-10-20
**Status**: Todo
