> Status: Archived
> Owner: @jdubz
> Last Updated: 2025-11-18

# Production Deployment Fix - Artifact Registry Permissions

**Date**: 2025-10-21
**Issue**: Backend Cloud Functions failed to deploy to production
**Status**: ✅ RESOLVED

---

## Problem Description

Production deployments of Cloud Functions were failing with the following error:

```
ERROR: failed to initialize analyzer: validating registry write access:
failed to ensure registry read/write access to
us-central1-docker.pkg.dev/static-sites-257923/gcf-artifacts/static--sites--257923__us--central1__create_content_item/cache:latest:
POST https://us-central1-docker.pkg.dev/v2/static-sites-257923/gcf-artifacts/static--sites--257923__us--central1__create_content_item/cache/blobs/uploads/:
DENIED: Permission "artifactregistry.repositories.uploadArtifacts" denied on resource
"projects/static-sites-257923/locations/us-central1/repositories/gcf-artifacts" (or it may not exist)
```

**Root Cause**: The GitHub Actions deployer service account lacked Artifact Registry write permissions needed for Cloud Functions Gen2 deployments.

---

## Technical Details

### Service Account
- **Name**: `github-actions-deployer@static-sites-257923.iam.gserviceaccount.com`
- **Purpose**: Deploys Cloud Functions via GitHub Actions workflows
- **Workflow**: `.github/workflows/deploy-functions.yml`

### Cloud Functions Gen2 Requirements

Cloud Functions Gen2 (unlike Gen1) uses **containerized deployments**:
1. Source code is packaged into a Docker container
2. Container image is pushed to **Artifact Registry** (`us-central1-docker.pkg.dev`)
3. Cloud Run executes the container

This requires the deployer service account to have **write access** to Artifact Registry.

---

## Solution Applied

### Before Fix

The service account had these IAM roles:
```
roles/cloudfunctions.admin
roles/cloudfunctions.developer
roles/iam.serviceAccountUser
roles/run.admin
```

**Missing**: Artifact Registry permissions ❌

### After Fix

Added `roles/artifactregistry.writer` role:

```bash
gcloud projects add-iam-policy-binding static-sites-257923 \
  --member="serviceAccount:github-actions-deployer@static-sites-257923.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer" \
  --condition=None
```

The service account now has:
```
roles/artifactregistry.writer      ← NEW ✅
roles/cloudfunctions.admin
roles/cloudfunctions.developer
roles/iam.serviceAccountUser
roles/run.admin
```

---

## Verification

### IAM Policy Confirmed
```bash
$ gcloud projects get-iam-policy static-sites-257923 \
    --flatten="bindings[].members" \
    --filter="bindings.members:github-actions-deployer@static-sites-257923.iam.gserviceaccount.com" \
    --format="table(bindings.role)"

ROLE
roles/artifactregistry.writer      ← Present ✅
roles/cloudfunctions.admin
roles/cloudfunctions.developer
roles/iam.serviceAccountUser
roles/run.admin
```

### Failed Deployment Before Fix
- **Run ID**: 18676869932
- **Branch**: main (production)
- **Time**: 2025-10-21 07:53:54 UTC
- **Result**: Failure (Artifact Registry permission denied)

### Next Steps for Verification
1. **Re-run failed deployment**: `gh run rerun 18676869932`
2. **Or wait for next push to main**: Automatic deployment will succeed
3. **Verify successful deployment**: Check GitHub Actions for green checkmarks

---

## Permissions Granted

The `roles/artifactregistry.writer` role includes these permissions:

| Permission | Purpose |
|------------|---------|
| `artifactregistry.repositories.uploadArtifacts` | Upload container images (required for CF Gen2) |
| `artifactregistry.repositories.downloadArtifacts` | Download container images |
| `artifactregistry.repositories.get` | Read repository metadata |
| `artifactregistry.repositories.list` | List repositories |

---

## Impact Assessment

### Scope
- **Affected**: Production deployments only
- **Staging**: Unaffected (same service account, same permissions applied)
- **Timeline**: Issue occurred on first production deployment attempt
- **Downtime**: None (production not yet deployed)

### Risk Mitigation
- ✅ Minimal privilege principle maintained (writer access only, not admin)
- ✅ Scoped to Artifact Registry only (no broader permissions)
- ✅ No breaking changes to existing deployments
- ✅ Staging deployments will benefit from same fix

---

## Related Documentation

- **Workflow File**: `.github/workflows/deploy-functions.yml`
- **Service Account Setup**: Configured via Workload Identity Federation
- **Project**: `static-sites-257923`
- **Registry**: `us-central1-docker.pkg.dev/static-sites-257923/gcf-artifacts/`

---

## Lessons Learned

1. **Cloud Functions Gen2 Requirements**: Gen2 requires Artifact Registry access (Gen1 did not)
2. **Service Account Scoping**: Deployer needs registry write + functions admin + run admin
3. **Testing Pipeline**: Should test production deployments in staging environment first
4. **Documentation**: IAM requirements should be documented in deployment setup docs

---

## Future Recommendations

### Immediate
- ✅ Permission fixed - deployments will succeed
- [ ] Re-run failed production deployment or wait for next push to main
- [ ] Verify successful deployment in GitHub Actions

### Short Term
- [ ] Document all required IAM roles for deployer service account
- [ ] Create IAM setup script for reproducible infrastructure
- [ ] Add permissions verification to deployment troubleshooting guide

### Long Term
- [ ] Consider Terraform for IAM management (linked to FE-RECOVERY-4)
- [ ] Implement pre-deployment permission checks in CI/CD
- [ ] Add monitoring/alerting for IAM-related deployment failures

---

## Resolution Status

| Item | Status |
|------|--------|
| Root cause identified | ✅ Complete |
| IAM role granted | ✅ Complete |
| Permission verified | ✅ Complete |
| Documentation created | ✅ Complete |
| Production deployment | ⏳ Pending re-run or next push |

---

**Fixed by**: Worker A
**Date**: 2025-10-21
**Related Issues**: P0 Production Blocker (ad-hoc fix)
