> Status: Archived
> Owner: @jdubz
> Last Updated: 2025-11-18

# Firestore Security Rules & Index Verification

This document describes how to verify and manage Firestore security rules and indexes for the Job Finder backend.

## Table of Contents

- [Security Rules Overview](#security-rules-overview)
- [Index Verification](#index-verification)
- [Testing Rules Locally](#testing-rules-locally)
- [Deployment Process](#deployment-process)
- [Rollback Procedures](#rollback-procedures)
- [Common Issues](#common-issues)

## Security Rules Overview

Firestore security rules are defined in `firestore.rules` at the repository root.

### Rule Structure

The rules implement a role-based access control (RBAC) system:

- **Viewer**: Read-only access to own data
- **Editor**: Create and manage own content
- **Admin**: Full access to all resources

### Protected Collections

| Collection | Create | Read | Update | Delete | Notes |
|------------|--------|------|--------|--------|-------|
| `job-queue` | User (own) | User (own), Admin | User (own, pending), Admin | User (own, pending), Admin | Queue submissions |
| `generator-documents` | Editor (own) | User (own), Admin | Editor (own), Admin | Editor (own), Admin | AI-generated documents |
| `content-items` | Editor (own) | User (own), Admin | Editor (own), Admin | Editor (own), Admin | Resume content |
| `experiences` | Editor (own) | User (own), Admin | Editor (own), Admin | Editor (own), Admin | Work history |
| `personal-info` | Editor (own) | User (own), Admin | Editor (own), Admin | Editor (own), Admin | Personal details |
| `job-matches` | ❌ | Viewer (own), Admin | ❌ | ❌ | Read-only (worker writes) |
| `companies` | ❌ | Authenticated | ❌ | Admin | Read-only (worker writes) |
| `job-sources` | ❌ | Authenticated | ❌ | Admin | Source configurations |

### Custom Claims

User roles are stored in Firebase Auth custom claims:

```json
{
  "role": "editor"  // "viewer" | "editor" | "admin"
}
```

Set claims via Admin SDK:

```typescript
import { auth } from 'firebase-admin'

await auth().setCustomUserClaims(userId, { role: 'editor' })
```

## Index Verification

### List Current Indexes

```bash
# Via Firebase CLI
firebase firestore:indexes --project static-sites-257923

# Via gcloud
gcloud firestore indexes composite list \
  --database='(default)' \
  --project=static-sites-257923
```

### Compare with Repository

```bash
# Validate defined indexes
npm run validate:indexes

# Show differences between deployed and repository
firebase firestore:indexes --project static-sites-257923 > /tmp/deployed.json
diff firestore.indexes.json /tmp/deployed.json
```

### Index Build Status

Check index build progress:

```bash
gcloud firestore operations list --database='(default)' --project=static-sites-257923
```

## Testing Rules Locally

### Run Emulator Tests

```bash
# Install dependencies
npm install

# Run Firestore rules tests
npm run test:firestore-rules
```

### Test Coverage

The test suite (`functions/test/firestore/rules.test.ts`) covers:

- ✅ User ownership validation
- ✅ Role-based access (viewer, editor, admin)
- ✅ Field-level security (prevent userId changes)
- ✅ Unauthenticated access denial
- ✅ Cross-user data isolation

### Manual Testing with Emulator

```bash
# Start emulator
firebase emulators:start --only firestore

# Test in another terminal
curl http://localhost:8080/emulator/v1/projects/demo-test-project/databases/(default)/documents/job-queue
```

## Deployment Process

### Pre-Deployment Checklist

- [ ] Rules file syntax is valid: `firebase deploy --only firestore:rules --dry-run`
- [ ] All tests pass: `npm run test:firestore-rules`
- [ ] Indexes validated: `npm run validate:indexes`
- [ ] Changes reviewed by team
- [ ] Deployment window scheduled (if production)

### Deploy to Staging

```bash
# Deploy rules and indexes together
npm run deploy:firestore:staging

# Or deploy separately
firebase deploy --only firestore:rules -P staging
firebase deploy --only firestore:indexes -P staging
```

### Deploy to Production

```bash
# Deploy rules and indexes together
npm run deploy:firestore:production

# Verify deployment
firebase firestore:indexes --project static-sites-257923
```

### Post-Deployment Verification

1. **Check index status**:
   ```bash
   firebase firestore:indexes --project static-sites-257923
   ```

2. **Test critical queries**:
   - User can read own queue items
   - User cannot read others' data
   - Admin can access all resources

3. **Monitor logs** for permission denied errors:
   ```bash
   gcloud logging read \
     'resource.type="cloud_function" AND severity>=ERROR' \
     --limit 50 \
     --project=static-sites-257923
   ```

## Rollback Procedures

### Immediate Rollback (Emergency)

If rules break production:

```bash
# Revert to previous rules
git checkout HEAD~1 firestore.rules

# Deploy immediately
firebase deploy --only firestore:rules -P production
```

### Controlled Rollback

1. **Identify commit with working rules**:
   ```bash
   git log --oneline -- firestore.rules
   ```

2. **Checkout specific version**:
   ```bash
   git checkout <commit-sha> firestore.rules
   ```

3. **Test locally**:
   ```bash
   npm run test:firestore-rules
   ```

4. **Deploy**:
   ```bash
   npm run deploy:firestore:production
   ```

5. **Commit rollback**:
   ```bash
   git add firestore.rules
   git commit -m "fix(firestore): rollback rules to <commit-sha>"
   ```

### Rollback Indexes

Indexes cannot be "rolled back" - they can only be deleted or created. To remove an index:

1. **Remove from firestore.indexes.json**
2. **Delete via Firebase Console** or gcloud:
   ```bash
   gcloud firestore indexes composite delete INDEX_ID \
     --database='(default)' \
     --project=static-sites-257923
   ```

## Common Issues

### Permission Denied Errors

**Symptom**: Users getting "permission denied" on allowed operations

**Diagnosis**:
1. Check custom claims: `auth().getUser(userId)`
2. Verify rule logic in emulator
3. Check field names (case-sensitive)

**Solution**:
- Ensure user has correct role claim
- Update rules to match data structure
- Test with `npm run test:firestore-rules`

### Missing Index Errors

**Symptom**: Query fails with "missing index" error

**Diagnosis**:
1. Error message includes index creation URL
2. Query uses multiple fields with ordering

**Solution**:
1. Click error URL to auto-create index
2. Add index to `firestore.indexes.json`
3. Redeploy: `npm run deploy:firestore:staging`

### Index Build Stuck

**Symptom**: Index shows "CREATING" status for hours

**Diagnosis**:
```bash
gcloud firestore operations list --project=static-sites-257923
```

**Solution**:
- Wait (can take 24+ hours for large collections)
- Check Firebase status page for outages
- Contact Firebase support if stuck > 48 hours

### Rules Too Broad

**Symptom**: Security audit warns about overly permissive rules

**Solution**:
1. Add field-level validation
2. Require specific fields in writes
3. Use `hasValidTimestamps()` helper
4. Test with emulator

### Emulator Tests Failing

**Symptom**: `npm run test:firestore-rules` fails

**Diagnosis**:
1. Check test output for specific failure
2. Verify emulator is not running separately

**Solution**:
```bash
# Kill any running emulators
pkill -f firebase

# Re-run tests
npm run test:firestore-rules
```

## Best Practices

1. **Test before deploy**: Always run `npm run test:firestore-rules`
2. **Version control**: Commit rules and indexes together
3. **Gradual rollout**: Deploy to staging first, verify, then production
4. **Monitor after deploy**: Watch logs for 15-30 minutes post-deployment
5. **Document changes**: Add comments to rules explaining security model
6. **Least privilege**: Default to deny, explicitly allow needed operations
7. **Use helpers**: Centralize logic in helper functions (e.g., `isOwner()`)
8. **Field validation**: Validate data types and required fields
9. **Prevent ownership changes**: Ensure `userId` cannot be changed on update
10. **Test edge cases**: Include tests for boundary conditions and role transitions

## CI/CD Integration

The GitHub Actions workflow automatically:

- ✅ Validates Firestore rules syntax
- ✅ Runs emulator tests on all PRs
- ✅ Validates indexes before deployment
- ✅ Deploys rules and indexes together

See `.github/workflows/deploy-*.yml` for configuration.

## Related Documentation

- [FIRESTORE_INDEXES.md](../../FIRESTORE_INDEXES.md) - Index definitions and query patterns
- [firestore.rules](../../firestore.rules) - Security rules source
- [functions/src/config/database.ts](../../functions/src/config/database.ts) - Database configuration

## Support

For questions or issues:

1. Check [Firebase Firestore Docs](https://firebase.google.com/docs/firestore/security/get-started)
2. Review test failures: `npm run test:firestore-rules -- --verbose`
3. Check deployment logs: `firebase functions:log`
4. Contact team in project Slack channel
