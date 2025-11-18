# Cloud Functions Production Deployment Permission Fix

**Date**: October 27, 2025  
**Issue**: Production Cloud Functions deployment failing in CI/CD  
**Status**: ✅ RESOLVED

---

## Problem

The GitHub Actions workflow for deploying Cloud Functions to production (job-finder-BE) was failing with Cloud Build errors. The deployment builds were failing during the containerization process.

**Failed Workflow Run**: [18827503072](https://github.com/Jdubz/job-finder-BE/actions/runs/18827503072)

**Error Pattern**:

```
Build failed with status: FAILURE and message: An unexpected error occurred.
```

---

## Root Cause

The `github-actions-deployer@static-sites-257923.iam.gserviceaccount.com` service account was missing `iam.serviceAccountUser` permissions on critical service accounts needed during the Cloud Functions Gen2 deployment process:

1. **Default compute service account** (`789847666726-compute@developer.gserviceaccount.com`) - used at runtime
2. **Cloud Functions builder** (`cloud-functions-builder@static-sites-257923.iam.gserviceaccount.com`) - used during build
3. **The deployer itself** - needed to impersonate other accounts

---

## Solution Applied

Granted the following IAM permissions:

### 1. Project-level Role (already existed, confirmed)

```bash
gcloud projects add-iam-policy-binding static-sites-257923 \
  --member="serviceAccount:github-actions-deployer@static-sites-257923.iam.gserviceaccount.com" \
  --role="roles/cloudfunctions.admin"
```

### 2. Service Account User on itself

```bash
gcloud iam service-accounts add-iam-policy-binding \
  github-actions-deployer@static-sites-257923.iam.gserviceaccount.com \
  --member="serviceAccount:github-actions-deployer@static-sites-257923.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser" \
  --project=static-sites-257923
```

### 3. Service Account User on default compute service account

```bash
gcloud iam service-accounts add-iam-policy-binding \
  789847666726-compute@developer.gserviceaccount.com \
  --member="serviceAccount:github-actions-deployer@static-sites-257923.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser" \
  --project=static-sites-257923
```

### 4. Service Account User on cloud-functions-builder

```bash
gcloud iam service-accounts add-iam-policy-binding \
  cloud-functions-builder@static-sites-257923.iam.gserviceaccount.com \
  --member="serviceAccount:github-actions-deployer@static-sites-257923.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser" \
  --project=static-sites-257923
```

---

## Final Permission Configuration

The `github-actions-deployer@static-sites-257923.iam.gserviceaccount.com` service account now has:

### Project-level IAM Roles:

- ✅ `roles/artifactregistry.writer`
- ✅ `roles/cloudbuild.builds.editor`
- ✅ `roles/cloudfunctions.admin`
- ✅ `roles/cloudfunctions.developer`
- ✅ `roles/iam.serviceAccountUser`
- ✅ `roles/logging.logWriter`
- ✅ `roles/run.admin`
- ✅ `roles/secretmanager.secretAccessor`

### Service Account IAM Bindings:

- ✅ `iam.serviceAccountUser` on itself
- ✅ `iam.serviceAccountUser` on `789847666726-compute@developer.gserviceaccount.com`
- ✅ `iam.serviceAccountUser` on `cloud-functions-builder@static-sites-257923.iam.gserviceaccount.com`

---

## Verification Steps

To verify the fix works:

1. **Re-run the failed deployment**:

   ```bash
   gh run rerun 18827503072 --repo Jdubz/job-finder-BE
   ```

2. **Or trigger a new deployment** by pushing to the `main` branch

3. **Check deployment status**:
   ```bash
   gh run list --workflow=deploy-functions.yml --repo Jdubz/job-finder-BE --limit 3
   ```

---

## Related Documentation

- **Detailed guide**: [`job-finder-BE/docs/GRANT_DEPLOY_PERMISSIONS.md`](job-finder-BE/docs/GRANT_DEPLOY_PERMISSIONS.md)
- **Production deployment docs**: [`job-finder-BE/docs/PRODUCTION_DEPLOYMENT_FIX.md`](job-finder-BE/docs/PRODUCTION_DEPLOYMENT_FIX.md)
- **CI/CD workflow**: [`job-finder-BE/.github/workflows/deploy-functions.yml`](job-finder-BE/.github/workflows/deploy-functions.yml)

---

## Why These Permissions Are Needed

Cloud Functions Gen2 uses a containerized deployment approach:

1. **Build Phase**: Source code → Container image
   - Requires `iam.serviceAccountUser` on `cloud-functions-builder`
   - Requires `artifactregistry.writer` to push images

2. **Deploy Phase**: Container image → Cloud Run service
   - Requires `cloudfunctions.admin` for function management
   - Requires `run.admin` for Cloud Run (underlying platform)
   - Requires `iam.serviceAccountUser` on runtime service account

3. **Runtime Phase**: Function execution
   - Uses `789847666726-compute@developer.gserviceaccount.com` (default compute SA)
   - Deployer needs `iam.serviceAccountUser` to configure it

---

## Timeline

- **October 27, 2025, 02:03 UTC**: Initial deployment failure
- **October 27, 2025, 03:10 UTC**: Issue identified and permissions granted
- **Status**: Awaiting deployment verification

---

## Impact

- **Scope**: Production Cloud Functions deployments for job-finder-BE
- **Downtime**: None (production was not yet deployed)
- **Staging**: Unaffected (staging deployments were working)

---

## Next Steps

1. ✅ Permissions granted
2. ⏳ Verify deployment succeeds
3. 📝 Monitor subsequent deployments
4. 🔍 Consider creating Terraform/IaC for IAM management
