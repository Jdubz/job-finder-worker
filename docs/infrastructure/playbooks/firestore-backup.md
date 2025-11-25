# Firestore Backup and Disaster Recovery Playbook

> Status: Active
> Owner: @jdubz
> Last Updated: 2025-11-25

Automated backup and disaster recovery procedures for Firestore databases. This playbook covers backup implementation, restore procedures, and testing schedules.

## Overview

**Purpose**: Protect against data loss through automated backups and tested recovery procedures.

**Critical Risks Without Backups**:
- Accidental data deletion (human error)
- Malicious data deletion (security breach)
- Data corruption from buggy code
- Permanent loss with no recovery possible
- Compliance violations (data retention requirements)

## Backup Architecture

### Automated Backup Components

1. **Cloud Function** - Scheduled backup execution
2. **Cloud Storage Bucket** - Backup storage with lifecycle policies
3. **Cloud Scheduler** - Backup scheduling
4. **Monitoring** - Backup success/failure tracking
5. **Metadata Store** - Backup history and status

### Backup Schedule

- **Daily backups**: Retain 7 days
- **Weekly backups**: Retain 4 weeks
- **Monthly backups**: Retain 12 months

## Implementation

### 1. Backup Storage Bucket Setup

Create a Cloud Storage bucket with lifecycle policies:

```bash
# Create backup bucket with uniform access
gcloud storage buckets create gs://[PROJECT_ID]-firestore-backups \
  --project=[PROJECT_ID] \
  --location=us-central1 \
  --uniform-bucket-level-access

# Create lifecycle policy file
cat > lifecycle.json <<EOF
{
  "lifecycle": {
    "rule": [
      {
        "action": {"type": "Delete"},
        "condition": {
          "age": 7,
          "matchesPrefix": ["daily/"]
        }
      },
      {
        "action": {"type": "Delete"},
        "condition": {
          "age": 28,
          "matchesPrefix": ["weekly/"]
        }
      },
      {
        "action": {"type": "Delete"},
        "condition": {
          "age": 365,
          "matchesPrefix": ["monthly/"]
        }
      }
    ]
  }
}
EOF

# Apply lifecycle policy
gcloud storage buckets update gs://[PROJECT_ID]-firestore-backups \
  --lifecycle-file=lifecycle.json
```

### 2. IAM Permissions

Grant necessary permissions for backup operations:

```bash
# Grant backup permissions to Cloud Functions service account
gcloud projects add-iam-policy-binding [PROJECT_ID] \
  --member="serviceAccount:[PROJECT_ID]@appspot.gserviceaccount.com" \
  --role="roles/datastore.importExportAdmin"

# Grant storage permissions
gsutil iam ch \
  serviceAccount:[PROJECT_ID]@appspot.gserviceaccount.com:objectAdmin \
  gs://[PROJECT_ID]-firestore-backups
```

### 3. Backup Cloud Function

```typescript
// functions/src/scheduled/firestoreBackup.function.ts
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Automated Firestore backup
 * Runs daily at 2 AM UTC
 */
export const backupFirestore = onSchedule(
  {
    schedule: "0 2 * * *", // Daily at 2 AM UTC
    timeZone: "UTC",
    memory: "512MiB",
    timeoutSeconds: 540,
  },
  async (event) => {
    const projectId = process.env.GCLOUD_PROJECT!;
    const timestamp = new Date().toISOString().split("T")[0];
    const bucketName = `${projectId}-firestore-backups`;
    const outputUriPrefix = `gs://${bucketName}/${timestamp}`;

    console.log(`Starting Firestore backup to ${outputUriPrefix}`);

    try {
      const client = getFirestore();
      const [operation] = await client.v1
        .FirestoreAdminClient()
        .exportDocuments({
          name: `projects/${projectId}/databases/(default)`,
          outputUriPrefix,
          // Optional: Specify collections to backup
          // collectionIds: ['jobs', 'users', 'companies'],
        });

      console.log("Backup operation started:", operation.name);

      // Wait for operation to complete
      await operation.promise();

      console.log("Backup completed successfully");

      // Record backup metadata
      await recordBackupMetadata({
        timestamp,
        outputUri: outputUriPrefix,
        status: "success",
        duration: Date.now() - event.scheduleTime,
      });

      return { success: true, outputUri: outputUriPrefix };
    } catch (error) {
      console.error("Backup failed:", error);

      // Record failure
      await recordBackupMetadata({
        timestamp,
        status: "failed",
        error: error.message,
      });

      // Alert on failure
      await sendBackupFailureAlert(error);

      throw error;
    }
  },
);

async function recordBackupMetadata(metadata: any) {
  const db = getFirestore();
  await db
    .collection("_system")
    .doc("backups")
    .collection("history")
    .add({
      ...metadata,
      createdAt: new Date(),
    });
}

async function sendBackupFailureAlert(error: Error) {
  // Implement alerting (email, Slack, PagerDuty, etc.)
  console.error("BACKUP FAILURE ALERT:", error);
  // TODO: Integrate with monitoring system
}
```

### 4. Cloud Scheduler Configuration

```yaml
# scheduler/firestore-backup.yaml
name: firestore-daily-backup
schedule: "0 2 * * *"
timeZone: "UTC"
httpTarget:
  uri: "https://us-central1-[PROJECT_ID].cloudfunctions.net/backupFirestore"
  httpMethod: POST
  headers:
    Content-Type: "application/json"
  oidcToken:
    serviceAccountEmail: "[PROJECT_ID]@appspot.gserviceaccount.com"
retryConfig:
  retryCount: 3
  maxRetryDuration: "3600s"
  minBackoffDuration: "5s"
  maxBackoffDuration: "300s"
```

## Restore Procedures

### Restore Script

```typescript
// scripts/restore-firestore.ts
import { FirestoreAdminClient } from "@google-cloud/firestore";

interface RestoreOptions {
  backupDate: string; // YYYY-MM-DD
  collections?: string[]; // Optional: specific collections
  targetProject?: string; // Optional: restore to different project
}

async function restoreFirestore(options: RestoreOptions) {
  const projectId = options.targetProject || process.env.GCLOUD_PROJECT!;
  const bucketName = `${projectId}-firestore-backups`;
  const inputUriPrefix = `gs://${bucketName}/${options.backupDate}`;

  console.log(`Restoring Firestore from ${inputUriPrefix}`);
  console.log(`Target project: ${projectId}`);

  // WARNING: This will overwrite existing data!
  const confirmed = await confirmRestore();
  if (!confirmed) {
    console.log("Restore cancelled");
    return;
  }

  const client = new FirestoreAdminClient();

  try {
    const [operation] = await client.importDocuments({
      name: `projects/${projectId}/databases/(default)`,
      inputUriPrefix,
      collectionIds: options.collections,
    });

    console.log("Restore operation started:", operation.name);

    // Wait for completion
    const [response] = await operation.promise();
    console.log("Restore completed successfully");

    return response;
  } catch (error) {
    console.error("Restore failed:", error);
    throw error;
  }
}

async function confirmRestore(): Promise<boolean> {
  // Implement interactive confirmation (readline, prompts, etc.)
  console.warn("WARNING: This will overwrite existing data!");
  console.warn("Are you sure you want to continue? (yes/no)");
  return true; // Placeholder - implement actual confirmation
}

// Usage
if (require.main === module) {
  const backupDate = process.argv[2];
  if (!backupDate) {
    console.error("Usage: ts-node restore-firestore.ts YYYY-MM-DD");
    process.exit(1);
  }

  restoreFirestore({ backupDate })
    .then(() => console.log("Restore complete"))
    .catch((error) => {
      console.error("Restore failed:", error);
      process.exit(1);
    });
}
```

### Manual Restore Steps

1. **Identify backup date** to restore from:
   ```bash
   gsutil ls gs://[PROJECT_ID]-firestore-backups/
   ```

2. **Verify backup exists**:
   ```bash
   gsutil ls gs://[PROJECT_ID]-firestore-backups/[BACKUP_DATE]/
   ```

3. **Run restore script**:
   ```bash
   ts-node scripts/restore-firestore.ts [BACKUP_DATE]
   ```

4. **Verify data** after restore completes

5. **Document incident** and restoration

## Monitoring

### Backup Status Dashboard

```typescript
// functions/src/functions/backupStatus.function.ts
import { onRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Get backup status and history
 * Endpoint: GET /backupStatus
 */
export const backupStatus = onRequest(async (req, res) => {
  const db = getFirestore();

  // Get last 30 backups
  const backupsRef = db
    .collection("_system")
    .doc("backups")
    .collection("history")
    .orderBy("createdAt", "desc")
    .limit(30);

  const snapshot = await backupsRef.get();
  const backups = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  // Calculate statistics
  const totalBackups = backups.length;
  const successfulBackups = backups.filter(
    (b) => b.status === "success",
  ).length;
  const failedBackups = backups.filter((b) => b.status === "failed").length;
  const lastBackup = backups[0];
  const successRate = (successfulBackups / totalBackups) * 100;

  res.json({
    statistics: {
      total: totalBackups,
      successful: successfulBackups,
      failed: failedBackups,
      successRate: `${successRate.toFixed(1)}%`,
    },
    lastBackup,
    recentBackups: backups.slice(0, 10),
  });
});
```

### Alerting

Configure alerts for:
- Backup failures
- Missing backups (schedule not running)
- Backup size anomalies
- Storage quota approaching limits

## Testing Schedule

### Monthly - Partial Restore Test

1. Select single collection
2. Restore to staging environment
3. Verify data integrity
4. Time the operation
5. Document results

### Quarterly - Full Restore Test

1. Full restore to staging environment
2. End-to-end validation
3. Application testing on restored data
4. Update runbooks based on findings
5. Document lessons learned

### Annually - Disaster Recovery Drill

1. Full restore to new project
2. Complete application stack setup
3. Test entire team's response
4. Validate runbooks and procedures
5. Update disaster recovery plan

## Recovery Targets

### Recovery Time Objective (RTO)

**Target**: 4 hours
- Full restore: 1-2 hours
- Validation and cutover: 1-2 hours
- Communication and coordination: 30-60 minutes

### Recovery Point Objective (RPO)

**Target**: 24 hours
- Daily backups mean maximum 24-hour data loss
- Consider more frequent backups for critical data
- Evaluate need for point-in-time recovery

## Cost Estimation

### Storage Costs

- Daily backups (7 days): ~7 × backup_size
- Weekly backups (4 weeks): ~4 × backup_size
- Monthly backups (12 months): ~12 × backup_size
- **Total**: ~23 × backup_size

**Example**: 1 GB Firestore database
- Storage: 23 GB × $0.026/GB = **$0.60/month**

### Operational Costs

- Function execution: ~1 minute/day × $0.40/million seconds = negligible
- Restore operations: Minimal (only during incidents)

**Total estimated cost**: $1-5/month (depending on data size)

## Best Practices

1. **Test backups regularly** - Untested backups are useless
2. **Run during low-traffic periods** - Schedule for 2 AM local time
3. **Monitor backup size growth** - Track trends over time
4. **Automate everything** - Reduce human error
5. **Document all procedures** - Keep runbooks updated
6. **Consider cross-region backups** - Geographic redundancy
7. **Secure backup access** - Restrict IAM permissions
8. **Track and audit** - Log all backup and restore operations

## Troubleshooting

### Backup Failures

**Symptom**: Backup function fails with error

**Diagnosis**:
1. Check Cloud Logging for error details
2. Verify IAM permissions
3. Check storage bucket accessibility
4. Validate Firestore API status

**Resolution**:
- Review and restore IAM permissions if missing
- Verify bucket exists and is accessible
- Check quota limits
- Retry manually if needed

### Restore Issues

**Symptom**: Restore operation fails

**Diagnosis**:
1. Verify backup file exists and is complete
2. Check target database state
3. Validate IAM permissions
4. Review operation logs

**Resolution**:
- Use different backup date if file is corrupted
- Clear target database if conflicts exist
- Restore IAM permissions
- Contact support if operation hangs

## Additional Resources

- [Firestore Export/Import Documentation](https://cloud.google.com/firestore/docs/manage-data/export-import)
- [Cloud Storage Lifecycle Management](https://cloud.google.com/storage/docs/lifecycle)
- [Disaster Recovery Planning](https://cloud.google.com/architecture/dr-scenarios-planning-guide)
