# Firestore Export Helpers

Utility workspace for exporting legacy Firestore collections into JSON snapshots that can be replayed into SQLite via the migration scripts.

## Usage

1. Ensure you have a Firebase service account JSON accessible via `FIREBASE_SERVICE_ACCOUNT_PATH` (absolute path) and set `FIREBASE_PROJECT_ID`.
2. Run the exporter with the env file used on the host:

```bash
op run --env-file ../.env -- npm run --workspace infra/sqlite/seeders export:firestore
```

The command writes one JSON file per collection into `infra/sqlite/seeders/output/`. Copy the resulting files to `/srv/job-finder/backups/firestore-exports/` before running `sqlite-migrator`.

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
