# Firestore Export Helpers

Utility workspace for exporting legacy Firestore collections into JSON snapshots that can be replayed into SQLite via the migration scripts.

## Usage

1. Ensure you have a Firebase service account JSON accessible via `FIREBASE_SERVICE_ACCOUNT_PATH`. Locally, drop the key from 1Password into the gitignored `job-finder-FE/.firebase/serviceAccountKey.json` (the same file Firebase Hosting uses) or point to a temporary path, then set `FIREBASE_PROJECT_ID`.
2. Run the exporter with the same env vars that power the host:

```bash
set -a
source ../.env
set +a
npm run --workspace infra/sqlite/seeders export:firestore
```

The command writes one JSON file per collection into `infra/sqlite/seeders/output/`. Zip that directory and attach it to the migration log before running `sqlite-migrator` (no host-level backup share needed).

## Collections

The exporter currently dumps the following collections:

- `content-items`
- `experience-entries`
- `experience-blurbs`
- `companies`
- `job-queue`
- `job-matches`
- `generator-documents`
- `job-finder-config`
- `job-sources`
- `contact-submissions`

Extend `src/export-firestore.ts` if new collections are added to the SQLite schema.
