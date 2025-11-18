# GitHub Secrets Setup Guide

**For**: Job Finder Frontend CI/CD  
**Date**: 2025-10-19  
**Status**: Required for automated deployments

---

## Overview

This guide walks through setting up the required GitHub secrets for automated deployments of the Job Finder frontend.

---

## Required Secrets

### 1. FIREBASE_SERVICE_ACCOUNT

**Purpose**: Authenticate GitHub Actions to deploy to Firebase Hosting

**Type**: JSON (service account key)

**How to Generate**:

1. Go to [Firebase Console](https://console.firebase.google.com/project/static-sites-257923/settings/serviceaccounts/adminsdk)

2. Click the **"Generate new private key"** button

3. Click **"Generate key"** in the confirmation dialog

4. A JSON file will download (e.g., `static-sites-257923-firebase-adminsdk-xxxxx.json`)

5. Open the file and copy **the entire JSON content**

6. The JSON should look like this (with real values):

```json
{
  "type": "service_account",
  "project_id": "static-sites-257923",
  "private_key_id": "abc123...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@static-sites-257923.iam.gserviceaccount.com",
  "client_id": "123456789",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-xxxxx%40static-sites-257923.iam.gserviceaccount.com"
}
```

**⚠️ IMPORTANT**:

- Keep this file secure - it has full access to your Firebase project
- Never commit this file to git
- Use the JSON content **exactly as is** (including all newlines in private_key)

---

## Adding Secrets to GitHub

### Step 1: Navigate to Repository Settings

1. Go to https://github.com/Jdubz/job-finder-FE
2. Click **Settings** tab
3. In the left sidebar, click **Secrets and variables** → **Actions**

### Step 2: Add FIREBASE_SERVICE_ACCOUNT Secret

1. Click **"New repository secret"** button

2. Fill in the form:
   - **Name**: `FIREBASE_SERVICE_ACCOUNT`
   - **Value**: Paste the **entire JSON content** from the service account file
3. Click **"Add secret"**

### Step 3: Verify Secret

The secret should now appear in the list with:

- Name: `FIREBASE_SERVICE_ACCOUNT`
- Updated: Today's date
- ✅ Available to all workflows

---

## Setting Up GitHub Environments

Environments provide additional controls for production deployments.

### Step 1: Create Staging Environment

1. Go to **Repository Settings** → **Environments**
2. Click **"New environment"**
3. Name: `staging`
4. Click **"Configure environment"**
5. **Deployment branches**: Select **"Selected branches"**
   - Add rule: `staging`
6. **Protection rules**: None needed (auto-deploy)
7. Click **"Save protection rules"**

### Step 2: Create Production Environment

1. Click **"New environment"** again
2. Name: `production`
3. Click **"Configure environment"**
4. **Deployment branches**: Select **"Selected branches"**
   - Add rule: `main`
5. **Protection rules**:
   - ✅ Check **"Required reviewers"**
   - Add reviewer: Your PM's GitHub username
   - Reviewers needed: 1
6. Click **"Save protection rules"**

This ensures production deployments require manual approval.

---

## Verification

### Test Staging Deployment

1. Make a small change on the `staging` branch
2. Push to GitHub:
   ```bash
   git checkout staging
   echo "# Test" >> README.md
   git add README.md
   git commit -m "test: verify CI/CD pipeline"
   git push origin staging
   ```
3. Go to **Actions** tab in GitHub
4. Watch the **"Deploy to Staging"** workflow run
5. Verify it completes successfully
6. Check https://job-finder-staging.joshwentworth.com (Cloudflare) — fallback origin: https://job-finder-staging.web.app

### Test Production Deployment

1. Create a PR from `staging` to `main`
2. Get PR approved by PM
3. Merge PR to `main`
4. Go to **Actions** tab
5. The **"Deploy to Production"** workflow will start
6. **Environment approval** will be required
7. PM approves the deployment
8. Workflow continues and deploys
9. Verify https://job-finder.joshwentworth.com (Cloudflare) — fallback origin: https://job-finder-production.web.app

---

## Troubleshooting

### "Secret not found" Error

**Problem**: Workflow can't access `FIREBASE_SERVICE_ACCOUNT`

**Solutions**:

1. Verify secret name is exactly `FIREBASE_SERVICE_ACCOUNT` (case-sensitive)
2. Check secret is in **Repository secrets**, not Environment secrets
3. Verify the workflow file uses `${{ secrets.FIREBASE_SERVICE_ACCOUNT }}`

### "Invalid credentials" Error

**Problem**: Firebase authentication fails

**Solutions**:

1. Regenerate service account key in Firebase Console
2. Ensure you copied the **entire JSON** (no truncation)
3. Verify the JSON is valid (use a JSON validator)
4. Check the service account has Firebase Hosting Admin role

### "Permission denied" Error

**Problem**: Service account lacks permissions

**Solutions**:

1. Go to [IAM & Admin](https://console.cloud.google.com/iam-admin/iam?project=static-sites-257923)
2. Find your service account email (ends with `@static-sites-257923.iam.gserviceaccount.com`)
3. Ensure it has these roles:
   - Firebase Hosting Admin
   - Service Account User

### Environment Not Found

**Problem**: Workflow references environment that doesn't exist

**Solutions**:

1. Create the environment as described above
2. Ensure environment name matches workflow file exactly
3. Environment names are case-sensitive

---

## Security Best Practices

### DO ✅

- Rotate service account keys every 90 days
- Use least-privilege permissions
- Enable environment protection for production
- Review deployment logs regularly
- Store keys in GitHub Secrets only

### DON'T ❌

- Commit service account JSON to repository
- Share service account keys via email/Slack
- Use same key for multiple projects
- Grant unnecessary permissions
- Store keys in environment files

---

## Key Rotation Schedule

Service account keys should be rotated regularly for security.

### Rotation Process

1. Generate new service account key in Firebase Console
2. Add as new GitHub secret temporarily: `FIREBASE_SERVICE_ACCOUNT_NEW`
3. Update workflow files to use new secret
4. Test deployments with new key
5. Delete old secret
6. Rename new secret to `FIREBASE_SERVICE_ACCOUNT`
7. Revoke old key in Firebase Console

### Recommended Schedule

- **Production keys**: Rotate every 90 days
- **Staging keys**: Can use same key, rotate quarterly

### Next Rotation Due

- [ ] 2025-01-19 (90 days from setup)

---

## Additional Resources

- [Firebase Service Accounts](https://firebase.google.com/docs/admin/setup#initialize-sdk)
- [GitHub Actions Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [GitHub Environments](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment)
- [Firebase Hosting Deploy Action](https://github.com/FirebaseExtended/action-hosting-deploy)

---

## Support

If you encounter issues:

1. Check [Troubleshooting](#troubleshooting) section above
2. Review GitHub Actions workflow logs
3. Check Firebase Console for deployment history
4. Contact Worker A (deployment specialist)
5. See `/DEPLOYMENT_RUNBOOK.md` for additional help

---

**Last Updated**: 2025-10-19  
**Next Review**: 2025-11-19
