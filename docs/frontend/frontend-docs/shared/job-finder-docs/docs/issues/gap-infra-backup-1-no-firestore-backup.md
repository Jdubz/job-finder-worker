# GAP-INFRA-BACKUP-1 — No Automated Firestore Backup Strategy

- **Status**: To Do
- **Owner**: Worker A
- **Priority**: P1 (High)
- **Labels**: priority-p1, type-infrastructure, repository-backend, disaster-recovery
- **Estimated Effort**: 2 days
- **Dependencies**: None
- **Related**: Identified in comprehensive gap analysis

## What This Issue Covers

Implement automated backup and disaster recovery strategy for Firestore. Currently, there is **no backup mechanism** - data loss would be catastrophic and unrecoverable.

## Context

**Current State**:

- No automated Firestore backups
- No point-in-time recovery
- No disaster recovery plan
- No backup testing
- **Result**: Data loss = permanent loss, no recovery possible

**Critical Risk**:

- Accidental data deletion (human error)
- Malicious data deletion (security breach)
- Corruption from buggy code
- No way to recover from mistakes
- Compliance violations (data retention)

**Why This Is P1 High**:

- Data is the most valuable asset
- User trust depends on data safety
- Regulatory requirements (GDPR, etc.)
- Business continuity requirement
- Industry standard practice

## Tasks

### 1. Set Up Automated Backups

- [ ] Enable Firestore export API
- [ ] Create Cloud Storage bucket for backups
- [ ] Configure bucket lifecycle policies
- [ ] Set up IAM permissions
- [ ] Create backup scheduling function

### 2. Schedule Regular Backups

- [ ] Daily backups (retain 7 days)
- [ ] Weekly backups (retain 4 weeks)
- [ ] Monthly backups (retain 12 months)
- [ ] Use Cloud Scheduler for automation

### 3. Implement Backup Monitoring

- [ ] Alert on backup failures
- [ ] Track backup size and duration
- [ ] Verify backup integrity
- [ ] Monitor storage costs

### 4. Create Restore Procedures

- [ ] Document restore process
- [ ] Create restore script
- [ ] Test restore on staging
- [ ] Document RTO/RPO targets

### 5. Test Disaster Recovery

- [ ] Perform full restore test (quarterly)
- [ ] Perform partial restore test (monthly)
- [ ] Document lessons learned
- [ ] Update procedures based on tests

### 6. Implement Point-in-Time Recovery

- [ ] Enable Firestore PITR (if available)
- [ ] Or implement transaction logging
- [ ] Document recovery window

### 7. Documentation

- [ ] Disaster recovery runbook
- [ ] Backup architecture documentation
- [ ] Restore procedures
- [ ] Testing schedule and results

## Proposed Implementation

### Automated Backup Cloud Function

```typescript
// job-finder-BE/functions/src/scheduled/firestoreBackup.function.ts
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

      // Wait for operation to complete (optional)
      await operation.promise();

      console.log("Backup completed successfully");

      // Record backup metadata in Firestore
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
  // Send email, Slack notification, or PagerDuty alert
  console.error("BACKUP FAILURE ALERT:", error);
  // TODO: Integrate with alerting system
}
```

### Backup Storage Bucket Setup

```bash
# Create backup bucket with lifecycle policies
gcloud storage buckets create gs://static-sites-257923-firestore-backups \
  --project=static-sites-257923 \
  --location=us-central1 \
  --uniform-bucket-level-access

# Add lifecycle rules
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

gcloud storage buckets update gs://static-sites-257923-firestore-backups \
  --lifecycle-file=lifecycle.json
```

### IAM Permissions

```bash
# Grant backup permissions to Cloud Functions
gcloud projects add-iam-policy-binding static-sites-257923 \
  --member="serviceAccount:static-sites-257923@appspot.gserviceaccount.com" \
  --role="roles/datastore.importExportAdmin"

# Grant storage permissions
gsutil iam ch \
  serviceAccount:static-sites-257923@appspot.gserviceaccount.com:objectAdmin \
  gs://static-sites-257923-firestore-backups
```

### Cloud Scheduler Configuration

```yaml
# scheduler/firestore-backup.yaml
name: firestore-daily-backup
schedule: "0 2 * * *"
timeZone: "UTC"
httpTarget:
  uri: "https://us-central1-static-sites-257923.cloudfunctions.net/backupFirestore"
  httpMethod: POST
  headers:
    Content-Type: "application/json"
  oidcToken:
    serviceAccountEmail: "static-sites-257923@appspot.gserviceaccount.com"
retryConfig:
  retryCount: 3
  maxRetryDuration: "3600s"
  minBackoffDuration: "5s"
  maxBackoffDuration: "300s"
```

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
  // Add interactive confirmation
  console.warn("WARNING: This will overwrite existing data!");
  console.warn("Are you sure you want to continue? (yes/no)");
  // In production, use readline or similar
  return true; // Placeholder
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

### Backup Monitoring Dashboard

```typescript
// job-finder-BE/functions/src/functions/backupStatus.function.ts
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

## Acceptance Criteria

- [ ] Automated daily backups running
- [ ] Backup retention policies configured
- [ ] Backup failures trigger alerts
- [ ] Restore procedure documented and tested
- [ ] Full restore test completed successfully
- [ ] Backup monitoring dashboard available
- [ ] Disaster recovery runbook complete
- [ ] Team trained on restore process

## Implementation Strategy

### Phase 1: Backup Infrastructure (1 day)

- Create storage bucket
- Set up IAM permissions
- Configure lifecycle policies
- Create backup function

### Phase 2: Automation & Monitoring (0.5 days)

- Schedule backups with Cloud Scheduler
- Add backup monitoring
- Configure failure alerts
- Create status dashboard

### Phase 3: Restore & Testing (0.5 days)

- Create restore script
- Test restore on staging
- Document procedures
- Create disaster recovery runbook

## Benefits

- **Data Safety**: Can recover from data loss
- **Compliance**: Meets data retention requirements
- **Peace of Mind**: Backups happen automatically
- **Fast Recovery**: Clear procedures reduce downtime
- **Auditability**: Track all backups and restores
- **Testing**: Regular tests ensure backups work

## Cost Estimate

### Storage Costs

- Daily backups (7 days): ~7 × backup_size
- Weekly backups (4 weeks): ~4 × backup_size
- Monthly backups (12 months): ~12 × backup_size
- Estimated total: ~23 × backup_size

Example: If Firestore is 1 GB

- Storage: 23 GB × $0.026/GB = $0.60/month

### Egress Costs

- Restore operations: Minimal (only during incidents)

### Function Costs

- Daily backup function: ~1 minute × $0.40/million seconds = negligible

**Total estimated cost**: ~$1-5/month (depending on data size)

## Related Issues

- GAP-DEVOPS-MON-1: Monitor backup success/failure
- GAP-SEC-AUTH-1: Secure backup access
- GAP-DOC-INFRA-1: Document backup architecture

## Disaster Recovery Targets

### Recovery Time Objective (RTO)

- Target: 4 hours
- Full restore takes ~1-2 hours
- Additional time for validation and cutover

### Recovery Point Objective (RPO)

- Target: 24 hours
- Daily backups mean max 24h data loss
- Consider more frequent backups for critical data

## Backup Testing Schedule

### Monthly

- Partial restore (single collection)
- Verify data integrity
- Time the operation

### Quarterly

- Full restore to staging environment
- End-to-end validation
- Update runbooks based on findings

### Annually

- Full disaster recovery drill
- Restore to new project
- Test entire team's response

## Notes

- Backups should run during low-traffic periods (2 AM)
- Monitor backup size growth over time
- Consider cross-region backups for geographic redundancy
- Test restores regularly - untested backups are useless
- Automate as much as possible
