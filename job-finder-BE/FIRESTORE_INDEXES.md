# Firestore Indexes

This document describes the Firestore indexes required for the Job Finder backend Cloud Functions.

## Overview

Firestore requires composite indexes for queries that:
- Sort on multiple fields
- Filter on one field and sort on another
- Use array-contains with additional filters

All indexes are defined in `firestore.indexes.json` and deployed with:

```bash
npm run deploy:firestore:staging
# or
npm run deploy:firestore:production
```

## Index Configuration

### job-queue Collection

Used by: `functions/src/services/job-queue.service.ts`

| Fields | Purpose |
|--------|---------|
| `submitted_by`, `created_at` (DESC) | Get user's queue items sorted by date |
| `submitted_by`, `status`, `created_at` (DESC) | Filter user's queue by status |
| `submitted_by`, `type`, `created_at` (DESC) | Filter user's queue by job type |
| `submitted_by`, `url` | Check for duplicate URLs per user |

**Example Queries:**

```typescript
// Get all queue items for user, sorted by date
db.collection('job-queue')
  .where('submitted_by', '==', userId)
  .orderBy('created_at', 'desc')

// Get pending items for user
db.collection('job-queue')
  .where('submitted_by', '==', userId)
  .where('status', '==', 'pending')
  .orderBy('created_at', 'desc')
```

### generator-documents Collection

Used by: `functions/src/services/generator.service.ts`

| Fields | Purpose |
|--------|---------|
| `type`, `access.userId`, `createdAt` (DESC) | Get user's generation history |

**Example Query:**

```typescript
// Get document generation requests for user
db.collection('generator-documents')
  .where('type', '==', 'request')
  .where('access.userId', '==', userId)
  .orderBy('createdAt', 'desc')
```

### content-items Collection

Used by: `functions/src/services/content-item.service.ts`

| Fields | Purpose |
|--------|---------|
| `userId`, `order` | Get user's content sorted by order |
| `userId`, `type`, `order` | Filter content by type (experience, skill, etc.) |
| `userId`, `visibility`, `order` | Filter content by visibility |
| `userId`, `parentId`, `order` | Get nested content items |
| `userId`, `tags` (array-contains) | Search content by tags |

**Example Queries:**

```typescript
// Get all content items for user, sorted
db.collection('content-items')
  .where('userId', '==', userId)
  .orderBy('order', 'asc')

// Get experience entries only
db.collection('content-items')
  .where('userId', '==', userId)
  .where('type', '==', 'experience')
  .orderBy('order', 'asc')

// Search by tag
db.collection('content-items')
  .where('userId', '==', userId)
  .where('tags', 'array-contains', 'featured')
```

### experiences Collection

Used by: `functions/src/services/experience.service.ts`

| Fields | Purpose |
|--------|---------|
| `userId`, `type`, `startDate` (DESC) | Get user's experiences sorted by date |

**Example Query:**

```typescript
// Get all experiences for user
db.collection('experiences')
  .where('userId', '==', userId)
  .where('type', '==', 'experience')
  .orderBy('startDate', 'desc')
```

## Validation

To validate indexes before deployment:

```bash
npm run validate:indexes
```

This script checks for:
- Duplicate indexes
- Missing required indexes
- Potentially unused indexes

## Deployment

### Deploy to Staging

```bash
npm run deploy:firestore:staging
```

### Deploy to Production

```bash
npm run deploy:firestore:production
```

### Verify Deployment

After deployment, verify indexes are created:

```bash
firebase firestore:indexes --project static-sites-257923
```

## Troubleshooting

### Missing Index Error

If you get a missing index error:

1. Copy the index URL from the error message
2. Open it in a browser to auto-create the index
3. Wait for index to build (may take several minutes)
4. Retry the query

Alternatively, add the index to `firestore.indexes.json` and redeploy.

### Index Already Exists

If deployment fails with "index already exists":

1. Check if the index was manually created
2. Indexes created via error URLs may not match `firestore.indexes.json`
3. Delete manual indexes via Firebase Console
4. Redeploy using `firestore.indexes.json`

### Query Performance

If queries are slow:

1. Check index coverage with Firebase Console
2. Verify index is being used (not falling back to single-field)
3. Consider adding indexes for frequently used query combinations
4. Monitor query performance in Cloud Logging

## Best Practices

1. **Always define indexes in code** - Don't rely on manually created indexes
2. **Test locally with emulator** - Emulator warns about missing indexes
3. **Validate before deploy** - Run `npm run validate:indexes`
4. **Document query patterns** - Add comments explaining why each index exists
5. **Clean up unused indexes** - Remove indexes for deprecated queries

## Database Names

- **Staging**: `portfolio-staging`
- **Production**: `portfolio`
- **Emulator**: `(default)`

Environment selection is automatic based on `ENVIRONMENT` variable (see `functions/src/config/database.ts`).

## Related Documentation

- [Firestore Security Rules](./docs/security/index-verification.md)
- [Database Configuration](./functions/src/config/database.ts)
- [Query Optimization](https://firebase.google.com/docs/firestore/query-data/indexing)
