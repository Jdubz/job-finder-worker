# Firestore Schema Migration - Portfolio to Job Finder

## 🎯 Migration Goal

Restructure Firestore collections from Portfolio app schema to Job Finder app schema.

## 📊 Schema Changes

### Collection Rename: `generator` → `generator-documents`

**Old Schema (Portfolio App)**:

```
generator/
  ├── personal-info (single document)
  ├── resume-generator-request-* (many documents)
  └── resume-generator-response-* (many documents)
```

**New Schema (Job Finder App)**:

```
generator-documents/
  ├── resume-generator-request-* (moved from generator)
  └── resume-generator-response-* (moved from generator)

job-finder-config/
  ├── personal-info (moved from generator/personal-info)
  ├── ai-prompts
  └── (other config documents)
```

## ✅ Changes Applied

### 1. Backend Code Updates

**File**: `job-finder-BE/functions/src/config/database.ts`

- ✅ `GENERATOR_COLLECTION` = `"generator-documents"` (was `"generator"`)

**File**: `job-finder-BE/functions/src/services/generator.service.ts`

- ✅ Generation requests/responses now use `generator-documents` collection
- ✅ `getPersonalInfo()` now reads from `job-finder-config/personal-info`
- ✅ `updatePersonalInfo()` now writes to `job-finder-config/personal-info`

### 2. Frontend Code Updates

**File**: `job-finder-FE/src/hooks/useGeneratorDocuments.ts`

- ✅ Queries `generator-documents` collection (was trying `generator`)
- ✅ No userId filtering - editors see ALL documents
- ✅ Orders by `createdAt` descending

### 3. Firestore Indexes

**File**: `job-finder-BE/firestore.indexes.json`

- ✅ Added indexes for `generator-documents` collection:
  - `createdAt` (descending) - for listing all documents
  - `access.userId + createdAt` (descending) - for future user filtering
  - `type + access.userId + createdAt` - for filtering by type

### 4. Security Rules

**File**: `job-finder-BE/firestore.rules`

- ✅ Updated `generator-documents` rules - any authenticated user can read/write
- ✅ Updated `job-finder-config` rules - personal-info writable by authenticated users
- ✅ Removed all userId ownership checks - editors see everything

### 5. Data Migration

**Script**: `job-finder-BE/scripts/migrate-generator-collection.js`

**Migration Results**:

- ✅ Moved **79 documents** from `generator` → `generator-documents`
  - All `resume-generator-request-*` documents
  - All `resume-generator-response-*` documents
- ✅ Moved **1 document** (`personal-info`) from `generator` → `job-finder-config`

## 📝 Next Steps

### 1. Verify Migration in Emulator UI

Visit: http://localhost:4000/firestore

Check:

- ✅ `generator-documents` collection has 79 documents
- ✅ `job-finder-config` collection has `personal-info` document
- ⚠️ Old `generator` collection still exists (can be deleted)

### 2. Delete Old Collection (Optional)

Once verified, you can delete the old `generator` collection:

```bash
# In Emulator UI, or via script
firebase firestore:delete generator --recursive --project static-sites-257923
```

### 3. Test All Pages

- **Document History**: Should show all 79 generated documents
- **Experience/Content Items**: Should show all items
- **Queue Management**: Should show all queue items

## 🔄 Editor Behavior

**All queries now return ALL documents** (no userId filtering):

```typescript
// Content Items
useContentItems(); // Returns ALL content items from ALL users

// Generator Documents
useGeneratorDocuments(); // Returns ALL generated docs from ALL users

// Queue Items
useQueueItems(); // Returns ALL queue items from ALL users
```

## 🔐 Security Model

**Development/Emulator**:

- Any authenticated user = full access to everything
- No role checks
- No ownership validation

**Future Production Considerations**:

- May want to re-add role checks (isEditor, isAdmin)
- May want to add multi-tenancy (team/organization filtering)
- Currently: single-user/admin tool

## 📚 Collections Summary

| Collection            | Purpose                                       | Documents |
| --------------------- | --------------------------------------------- | --------- |
| `generator-documents` | Resume/cover letter requests & responses      | 79        |
| `job-finder-config`   | App configuration (personal-info, ai-prompts) | 1+        |
| `content-items`       | Resume content (experience, skills, projects) | Many      |
| `job-queue`           | Job scraping queue                            | Many      |
| `experiences`         | Work experience entries                       | Many      |
| `companies`           | Company data                                  | Many      |
| `job-matches`         | AI job match results                          | Many      |

## ✨ Benefits of New Schema

1. **Clarity**: `generator-documents` is more descriptive than just `generator`
2. **Organization**: Config documents grouped in `job-finder-config`
3. **Consistency**: Matches job-finder app naming conventions
4. **Scalability**: Easier to add new config types

## 🚀 Status

- ✅ Migration script executed successfully
- ✅ Backend rebuilt with new collection names
- ✅ Frontend updated to query correct collections
- ✅ Indexes configured
- ✅ Security rules updated
- ✅ Emulators restarted with changes
- ✅ Data persisted through migration
