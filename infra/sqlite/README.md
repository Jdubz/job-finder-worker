# SQLite Artifacts

This folder contains everything related to the monorepo’s SQLite deployment:

- `migrations/` – versioned SQL migrations (e.g., `001_initial_schema.sql`). Add new files here instead of editing existing ones.
- `schema.sql` – helper that replays the baseline migration (useful for ad-hoc `sqlite3 jobfinder.db < schema.sql` invocations).
- `seeders/` – a TypeScript workspace for exporting Firestore data and loading SQLite with seed fixtures.

## Applying migrations

```bash
# Apply migrations to infra/sqlite/jobfinder.db
npm run migrate --workspace job-finder-BE/server

# Override paths if needed
JF_SQLITE_DB_PATH=/path/to/db \
JF_SQLITE_MIGRATIONS_DIR=/path/to/migrations \
npm run migrate --workspace job-finder-BE/server
```

## Working With the Seeders Workspace

```bash
# Install dependencies (only needed once)
npm install --workspace infra/sqlite/seeders

# Export Firestore content items to JSON
npm run export:firestore --workspace infra/sqlite/seeders
```

Refer back to `docs/plans/prod-migration-prep.md` for the broader migration plan and operational processes surrounding this schema.
