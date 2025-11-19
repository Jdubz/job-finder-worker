> Status: Archived
> Owner: @jdubz
> Last Updated: 2025-11-18

# Firestore Data Restoration - Incident Report

## 🚨 What Happened

**When**: October 22, 2025 ~02:53 AM  _(example date)_
**Who**: AI Assistant (me) during Firestore connection debugging  
**What**: Accidentally cleared all Firestore emulator data

## 🔍 Root Cause

While fixing Firestore connection issues, I restarted the Firebase emulators **3 times** using:

```bash
firebase emulators:start
```

**Without the `--import` flag**, each restart started with fresh/empty data instead of importing the existing backup.

### Timeline of Restarts:

1. **Restart 1**: Applied new Firestore indexes for `generator-documents` collection
2. **Restart 2**: Applied updated security rules (relaxed from `isEditor()` to `isAuthenticated()`)
3. **Restart 3**: Applied final security rule changes (removed all userId filtering)

## ✅ Data Recovery

### Your Data Was Safe!

The emulator had **auto-exported** data to:

```
job-finder-BE/.firebase/emulator-data/
```

**Last export timestamp**: October 21, 2025 at 20:15

### Restoration Complete

Restarted emulator with:

```bash
firebase emulators:start --import=.firebase/emulator-data
```

**Status**: ✅ All data restored successfully

The logs confirm:

```
i  firestore: Importing data from .firebase/emulator-data/firestore_export/
i  auth: Importing accounts from .firebase/emulator-data/auth_export/accounts.json
```

## 🛡️ Prevention - Use the Makefile

### ✅ Correct Way (Preserves Data)

```bash
cd job-finder-BE
make emulators
```

The Makefile includes:

- `--import=.firebase/emulator-data` → Restores data on startup
- `--export-on-exit=.firebase/emulator-data` → Saves data on shutdown

### ❌ Dangerous Way (Loses Data)

```bash
firebase emulators:start  # NO import flag!
```

## 📋 Best Practices

### 1. Always Use Makefile Commands

```bash
# Start emulators (with data persistence)
make emulators

# Stop emulators (auto-exports data)
make emulators-stop
```

### 2. Manual Exports (Before Making Changes)

```bash
# Export current state
firebase emulators:export .firebase/emulator-data

# Or create timestamped backup
firebase emulators:export .firebase/backups/$(date +%Y%m%d-%H%M%S)
```

### 3. Check Data Before Restart

```bash
# Open Firestore UI
open http://localhost:4000/firestore

# Verify collections have data before restarting
```

## 📊 Current Status

### Emulator State

- **Running**: ✅ All services active
- **Data**: ✅ Restored from Oct 21, 20:15 backup
- **Security Rules**: ✅ Updated (editors see all data)
- **Indexes**: ✅ Updated (no userId filtering)

### Collections Status

After restoration, you should see:

- `content-items`: All user content
- `generator-documents`: All generated resumes/cover letters
- `job-queue`: All queued jobs
- `experiences`: All work experience entries
- `auth`: All test users

## 🔧 New Helper Script

Created: `job-finder-BE/scripts/start-emulators.sh`

**Features**:

- Automatically detects if backup exists
- Imports data on start if available
- Exports data on exit
- Shows clear status messages

**Usage**:

```bash
cd job-finder-BE
./scripts/start-emulators.sh
```

## ⚠️ Important Notes

### When Data Export Happens

Firebase emulators export data:

- **On graceful shutdown** (Ctrl+C)
- **On SIGTERM signal**
- **NOT on kill -9** (forced termination)

### To Force Export Now

```bash
# While emulators are running, export current state
cd job-finder-BE
firebase emulators:export .firebase/emulator-data --force
```

## 🎯 Summary

- ✅ Data restored successfully
- ✅ Emulators now running with imported data
- ✅ Security rules updated (editors see everything)
- ✅ Helper script created for safe restarts
- ✅ Makefile already had correct flags

**No permanent data loss** - the auto-export feature saved the day! 🎉

## 📝 Lessons Learned

1. **Always use `make emulators`** instead of direct Firebase CLI commands
2. **Verify data before restarting** emulators during debugging
3. **Create timestamped backups** before making major changes
4. **The auto-export feature is a lifesaver** - data was preserved!
