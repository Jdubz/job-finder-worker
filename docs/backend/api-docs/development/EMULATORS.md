# Firebase Emulators Guide

This guide explains how to use Firebase Emulators for local development with the Job Finder backend.

## Overview

The Firebase Emulator Suite provides local emulation of:

- **Authentication** (port 9099) - User authentication and custom claims
- **Cloud Functions** (port 5001) - Callable functions and HTTP endpoints
- **Firestore** (port 8080) - NoSQL database with security rules
- **Storage** (port 9199) - File storage buckets
- **Emulator UI** (port 4000) - Web dashboard to inspect and manage emulator data

All emulators are configured with **data persistence** enabled, so your data persists between restarts.

## Quick Start

### Start Emulators

```bash
# From functions directory
cd functions
npm run emulators:start

# Or from project root
firebase emulators:start
```

This will:
1. Build the functions (TypeScript → JavaScript)
2. Start all emulators with persistence
3. Import previously saved data (if available)
4. Export data on shutdown

### Access Emulator UI

Open [http://localhost:4000](http://localhost:4000) to access the Emulator UI dashboard.

## Available Commands

### Start Emulators (with persistence)

```bash
npm run emulators:start
```

This runs `scripts/emulator/start-with-persistence.sh`, which:
- Checks for existing persisted data in `.firebase/emulator-data/`
- Imports data if available
- Starts all emulators
- Exports data when you stop the emulators (Ctrl+C)

### Clear Persisted Data

```bash
npm run emulators:clear
```

This runs `scripts/emulator/clear-data.sh`, which:
- Prompts for confirmation
- Deletes all persisted emulator data
- Preserves the directory structure

Use this when you want to start fresh.

### Seed Test Data

```bash
npm run emulators:seed
```

This runs `scripts/emulator/seed-test-data.sh`, which:
- Checks if emulators are running
- Populates emulators with test users and data
- Useful for development and testing

**Note:** Seed script implementation is at `functions/src/scripts/seed-emulator.ts` (to be created).

## Emulator Ports

| Emulator | Port | URL |
|----------|------|-----|
| Auth | 9099 | http://localhost:9099 |
| Functions | 5001 | http://localhost:5001 |
| Firestore | 8080 | http://localhost:8080 |
| Storage | 9199 | http://localhost:9199 |
| Emulator UI | 4000 | http://localhost:4000 |

## Data Persistence

### How It Works

Data persistence is enabled via Firebase CLI flags:

```bash
firebase emulators:start \
  --import=./.firebase/emulator-data \
  --export-on-exit=./.firebase/emulator-data
```

- **`--import`**: Loads previously saved data on startup
- **`--export-on-exit`**: Saves data when you stop the emulators

### Persisted Data Location

```
.firebase/emulator-data/
├── auth_export/          # Authentication users and tokens
├── firestore_export/     # Firestore documents and collections
├── storage_export/       # Storage buckets and files
└── .gitkeep              # Keeps directory in git (data is gitignored)
```

### What Gets Persisted

✅ **Persisted:**
- Firestore documents and collections
- Auth users and custom claims
- Storage files and buckets
- Firestore security rules state

❌ **Not Persisted:**
- Cloud Functions code (rebuilt on each start)
- Emulator configuration (from `firebase.json`)

### Managing Persisted Data

**Start fresh:**
```bash
npm run emulators:clear
npm run emulators:start
```

**Keep your data:**
```bash
# Just stop and restart
Ctrl+C
npm run emulators:start
```

**Backup your data:**
```bash
cp -r .firebase/emulator-data .firebase/emulator-data-backup
```

**Restore a backup:**
```bash
rm -rf .firebase/emulator-data
cp -r .firebase/emulator-data-backup .firebase/emulator-data
npm run emulators:start
```

## Development Workflow

### 1. Initial Setup

```bash
cd functions
npm install
npm run emulators:start
```

### 2. Create Test Users

Open [http://localhost:4000](http://localhost:4000), go to **Authentication**, and add test users:

```
Email: viewer@test.com
Password: password123
Custom Claims: { "role": "viewer" }

Email: editor@test.com
Password: password123
Custom Claims: { "role": "editor" }

Email: admin@test.com
Password: password123
Custom Claims: { "role": "admin" }
```

### 3. Add Test Data

Go to **Firestore** in the UI and create test documents, or run:

```bash
npm run emulators:seed
```

### 4. Develop Functions

Edit functions in `functions/src/`, then:

```bash
# In another terminal
cd functions
npm run dev  # Watches TypeScript files
```

Functions will auto-reload when you save changes.

### 5. Test Your Changes

Use the Emulator UI or call functions directly:

```bash
# Test a callable function
curl -X POST http://localhost:5001/static-sites-257923/us-central1/manageJobQueue \
  -H "Content-Type: application/json" \
  -d '{"data": {"action": "list", "userId": "test-user-123"}}'
```

## Testing with Emulators

### Unit Tests

```bash
npm run test
```

Unit tests automatically connect to emulators via `@firebase/rules-unit-testing`.

### Integration Tests

```bash
# Start emulators in one terminal
npm run emulators:start

# Run integration tests in another
npm run test:integration
```

### Firestore Rules Tests

```bash
npm run test:firestore-rules
```

This runs the Firestore security rules test suite using the emulator.

## Environment Variables

The functions automatically detect emulator mode:

```typescript
// functions/src/config/database.ts
const isEmulator = process.env.FIRESTORE_EMULATOR_HOST ||
                   process.env.FUNCTIONS_EMULATOR === "true"

if (isEmulator) {
  return "(default)"  // Uses emulator database
}
```

## Troubleshooting

### Emulators Won't Start

**Port already in use:**
```bash
# Kill process using port 5001 (or other port)
lsof -ti:5001 | xargs kill -9

# Or kill all Firebase processes
pkill -f firebase
```

**Build errors:**
```bash
cd functions
npm run build
# Fix any TypeScript errors
npm run emulators:start
```

### Data Not Persisting

**Check export directory:**
```bash
ls -la .firebase/emulator-data/
```

Should show `auth_export/`, `firestore_export/`, etc.

**Ensure clean shutdown:**
- Use `Ctrl+C` to stop emulators (allows export)
- Don't force kill the process

**Check script permissions:**
```bash
chmod +x scripts/emulator/*.sh
```

### Functions Not Loading

**Rebuild functions:**
```bash
cd functions
npm run build
# Check dist/ directory has compiled code
npm run emulators:start
```

**Check function source path:**

In `firebase.json`:
```json
{
  "functions": [{
    "source": ".",  // Points to project root, not functions/
    ...
  }]
}
```

### Storage Emulator Issues

**Rules not loading:**

Create `storage.rules` in project root:
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Add to `firebase.json`:
```json
{
  "storage": {
    "rules": "storage.rules"
  }
}
```

## Best Practices

1. **Always use persistence**: Don't lose your test data between sessions
2. **Seed test data once**: Create a seed script with realistic test data
3. **Clear data for fresh tests**: Run `npm run emulators:clear` before important tests
4. **Use the UI**: The Emulator UI at :4000 is excellent for debugging
5. **Test security rules**: Always test rules changes in the emulator first
6. **Watch function logs**: The emulator shows function logs in real-time
7. **Backup your test data**: Keep a backup of good test data for quick restoration

## CI/CD Integration

For CI environments, start emulators without persistence:

```bash
# In GitHub Actions
firebase emulators:start --only auth,functions,firestore --project demo-test
```

Don't use `--import` or `--export-on-exit` in CI.

## Related Documentation

- [Firebase Emulator Suite Docs](https://firebase.google.com/docs/emulator-suite)
- [Firestore Rules Testing](./firestore-rules-testing.md)
- [Function Development](./function-development.md)
- [Environment Configuration](../config/environments.md)

## Support

For issues:

1. Check emulator logs in the terminal
2. Check function logs in Emulator UI at :4000
3. Review [Firebase Emulator Troubleshooting](https://firebase.google.com/docs/emulator-suite/install_and_configure#troubleshooting)
4. Contact team in project Slack channel
