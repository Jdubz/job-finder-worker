# Grant Deploy Permissions for Cloud Functions

## Issue (RESOLVED)

The CI deployment was failing with:

```
Error: Missing permissions required for functions deploy. You must have permission
iam.serviceAccounts.ActAs on service account static-sites-257923@appspot.gserviceaccount.com.
```

## Solution Applied

The `firebase-admin@static-sites-257923.iam.gserviceaccount.com` service account needed the following roles:

### Permissions Granted

```bash
# 1. Cloud Functions Admin (to deploy functions)
gcloud projects add-iam-policy-binding static-sites-257923 \
  --member="serviceAccount:firebase-admin@static-sites-257923.iam.gserviceaccount.com" \
  --role="roles/cloudfunctions.admin" \
  --condition=None

# 2. Service Account User on itself
gcloud iam service-accounts add-iam-policy-binding \
  firebase-admin@static-sites-257923.iam.gserviceaccount.com \
  --member="serviceAccount:firebase-admin@static-sites-257923.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser" \
  --project=static-sites-257923

# 3. Service Account User on cloud-functions-builder (for build process)
gcloud iam service-accounts add-iam-policy-binding \
  cloud-functions-builder@static-sites-257923.iam.gserviceaccount.com \
  --member="serviceAccount:firebase-admin@static-sites-257923.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser" \
  --project=static-sites-257923
```

### Option 2: Using Google Cloud Console

1. Go to [IAM & Admin](https://console.cloud.google.com/iam-admin/iam?project=static-sites-257923)
2. Find the service account: `static-sites-257923@appspot.gserviceaccount.com`
3. Click "Edit principal"
4. Click "Add another role"
5. Search for and add "Service Account User" role
6. In the condition builder, add:
   - **Title**: Allow firebase-admin to deploy
   - **Condition**:
     ```
     resource.name == "projects/static-sites-257923/serviceAccounts/static-sites-257923@appspot.gserviceaccount.com" &&
     api.getAttribute('iam.googleapis.com/actAsServiceAccount', '') == 'firebase-admin@static-sites-257923.iam.gserviceaccount.com'
     ```
7. Save

## Why This Is Needed

When deploying 2nd generation Cloud Functions, Firebase needs to:
1. Create/update the Cloud Function
2. Configure it to run with the specified service account
3. Set up IAM bindings

The deploying service account needs `iam.serviceAccounts.ActAs` permission to perform these operations, which is granted by the "Service Account User" role.

## Verification

After granting the permission, trigger a new deployment in GitHub Actions to verify it works.
