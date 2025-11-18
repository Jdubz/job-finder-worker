# Google Cloud Logging Permission Fix

## Issue

The app-monitor backend was unable to fetch logs from Google Cloud Logging due to insufficient IAM permissions.

**Error:**

```
[ERROR] cloud:fetch_logs_failed - Failed to fetch cloud logs
  Error: 7 PERMISSION_DENIED: Permission denied for all log views
```

## Root Cause

The Firebase Admin SDK service account (`firebase-adminsdk-lfb0c@static-sites-257923.iam.gserviceaccount.com`) had `roles/logging.logWriter` (write logs) but was missing `roles/logging.viewer` (read logs).

## Fix Applied

Granted the Logs Viewer role to the service account:

```bash
gcloud projects add-iam-policy-binding static-sites-257923 \
  --member="serviceAccount:firebase-adminsdk-lfb0c@static-sites-257923.iam.gserviceaccount.com" \
  --role="roles/logging.viewer"
```

## Verification

Service account now has both required roles:

- ✓ `roles/logging.logWriter` - Write logs to Cloud Logging
- ✓ `roles/logging.viewer` - Read logs from Cloud Logging

## Configuration

The app-monitor backend uses the service account key file at:

```
.firebase/serviceAccountKey.json
```

Referenced in `app-monitor/backend/.env`:

```env
GOOGLE_APPLICATION_CREDENTIALS=../../.firebase/serviceAccountKey.json
```

## Next Steps

1. Restart the app-monitor backend to use the new permissions
2. Test cloud logging functionality in the app-monitor dashboard
3. Verify logs are fetched successfully from staging/production environments

## Documentation

Full setup and troubleshooting guide: [app-monitor/docs/GOOGLE_CLOUD_LOGGING_PERMISSIONS.md](app-monitor/docs/GOOGLE_CLOUD_LOGGING_PERMISSIONS.md)

## Date

October 26, 2025
