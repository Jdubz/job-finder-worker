# Cloud Functions Deployment Permissions Troubleshooting

> Status: Active
> Owner: @jdubz
> Last Updated: 2025-11-25

## Problem

GitHub Actions workflow for deploying Cloud Functions to production fails with Cloud Build errors during the containerization process.

**Error Pattern**:

```
Build failed with status: FAILURE and message: An unexpected error occurred.
```

## Root Cause

The `github-actions-deployer@static-sites-257923.iam.gserviceaccount.com` service account is missing `iam.serviceAccountUser` permissions on critical service accounts needed during the Cloud Functions Gen2 deployment process:

1. **Default compute service account** (`789847666726-compute@developer.gserviceaccount.com`) - used at runtime
2. **Cloud Functions builder** (`cloud-functions-builder@static-sites-257923.iam.gserviceaccount.com`) - used during build
3. **The deployer itself** - needed to impersonate other accounts

## Solution

Grant the following IAM permissions:

### 1. Project-level Role

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

## Required Permission Configuration

The `github-actions-deployer@static-sites-257923.iam.gserviceaccount.com` service account needs:

### Project-level IAM Roles:

- `roles/artifactregistry.writer`
- `roles/cloudbuild.builds.editor`
- `roles/cloudfunctions.admin`
- `roles/cloudfunctions.developer`
- `roles/iam.serviceAccountUser`
- `roles/logging.logWriter`
- `roles/run.admin`
- `roles/secretmanager.secretAccessor`

### Service Account IAM Bindings:

- `iam.serviceAccountUser` on itself
- `iam.serviceAccountUser` on `789847666726-compute@developer.gserviceaccount.com`
- `iam.serviceAccountUser` on `cloud-functions-builder@static-sites-257923.iam.gserviceaccount.com`

## Verification Steps

To verify the fix works:

1. **Re-run the failed deployment**:

   ```bash
   gh run rerun <RUN_ID> --repo Jdubz/job-finder-BE
   ```

2. **Or trigger a new deployment** by pushing to the `main` branch

3. **Check deployment status**:
   ```bash
   gh run list --workflow=deploy-functions.yml --repo Jdubz/job-finder-BE --limit 3
   ```

4. **Verify permissions**:
   ```bash
   # Check project-level roles
   gcloud projects get-iam-policy static-sites-257923 \
     --flatten="bindings[].members" \
     --filter="bindings.members:serviceAccount:github-actions-deployer@static-sites-257923.iam.gserviceaccount.com" \
     --format="table(bindings.role)"

   # Check service account bindings
   gcloud iam service-accounts get-iam-policy \
     789847666726-compute@developer.gserviceaccount.com \
     --project=static-sites-257923
   ```

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

## Related Documentation

- **Detailed guide**: [`job-finder-BE/docs/GRANT_DEPLOY_PERMISSIONS.md`](job-finder-BE/docs/GRANT_DEPLOY_PERMISSIONS.md)
- **Production deployment docs**: [`job-finder-BE/docs/PRODUCTION_DEPLOYMENT_FIX.md`](job-finder-BE/docs/PRODUCTION_DEPLOYMENT_FIX.md)
- **CI/CD workflow**: [`job-finder-BE/.github/workflows/deploy-functions.yml`](job-finder-BE/.github/workflows/deploy-functions.yml)
