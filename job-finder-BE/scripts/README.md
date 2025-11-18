# Backend Scripts

## Data Migration & Sync Scripts

### `migrate-generator-collection.js`
**Purpose**: Migrate data from old portfolio schema to job-finder schema

**What it does**:
- Moves resume/cover letter generation documents from `generator` → `generator-documents`
- Moves `personal-info` from `generator` → `job-finder-config`

**Usage**:
```bash
FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/migrate-generator-collection.js
```

**Status**: ✅ Completed - 79 documents migrated + 1 personal-info

---

### `seed-local-config.js`
**Purpose**: Create default job-finder-config documents in local emulator

**What it creates**:
- `ai-settings` - AI provider configuration
- `job-filters` - Job filtering rules
- `queue-settings` - Queue processing settings
- `scheduler-settings` - Cron job schedules
- `stop-list` - Excluded companies/keywords/domains
- `technology-ranks` - Technology priority rankings

**Usage**:
```bash
FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/seed-local-config.js
```

**Status**: ✅ Completed - 6 config documents created

---

### `sync-content-from-production.js`
**Purpose**: Copy content-items from production Firestore to local emulator

**Prerequisites**:
- Service account key file at `job-finder-BE/service-account.json`
- OR gcloud authentication

**What it does**:
- Fetches all `content-items` from production database (`portfolio`)
- Overwrites local emulator `content-items` collection
- Preserves all document IDs and data

**Usage**:
```bash
# Method 1: With service account
FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/sync-content-from-production.js

# Method 2: Alternative - use Firebase CLI export/import
# See export-production-content.sh
```

**Status**: ⏳ Ready to run (requires credentials)

---

### `export-production-content.sh`
**Purpose**: Export content-items from production using gcloud CLI

**Prerequisites**:
- gcloud CLI installed
- Authenticated: `gcloud auth login`
- Project set: `gcloud config set project static-sites-257923`

**What it does**:
- Exports content-items to Cloud Storage
- Provides instructions for downloading and importing

**Usage**:
```bash
./scripts/export-production-content.sh
```

---

### `start-emulators.sh`
**Purpose**: Start Firebase emulators with data persistence

**What it does**:
- Starts emulators with `--import` to restore data
- Configures `--export-on-exit` to save data
- Ensures data persists across restarts

**Usage**:
```bash
./scripts/start-emulators.sh
```

**Note**: The Makefile `make emulators` command is preferred.

---

## Quick Reference

### Initial Setup (One Time)
```bash
# 1. Migrate generator collection
FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/migrate-generator-collection.js

# 2. Seed config documents
FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/seed-local-config.js

# 3. Sync content-items from production
FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/sync-content-from-production.js
```

### Daily Development
```bash
# Start emulators with data persistence
make emulators

# Stop emulators (auto-exports data)
make emulators-stop
```

### Manual Data Export/Import
```bash
# Export current emulator data
firebase emulators:export .firebase/emulator-data

# Import data to emulator
firebase emulators:start --import=.firebase/emulator-data
```

## Troubleshooting

### "Service account not found"
If `sync-content-from-production.js` fails:

**Option 1**: Use Firebase Console
1. Go to https://console.firebase.google.com/project/static-sites-257923/firestore
2. Click Import/Export
3. Export `content-items` collection
4. Download and extract
5. Import: `firebase emulators:start --import=<path>`

**Option 2**: Get service account key
1. Go to https://console.firebase.google.com/project/static-sites-257923/settings/serviceaccounts
2. Click "Generate new private key"
3. Save as `job-finder-BE/service-account.json`
4. Run sync script again

### "FIRESTORE_EMULATOR_HOST not set"
Make sure emulators are running and set the environment variable:
```bash
export FIRESTORE_EMULATOR_HOST=localhost:8080
```

### "Collections empty after restart"
Always use `make emulators` which includes `--import` and `--export-on-exit` flags.

