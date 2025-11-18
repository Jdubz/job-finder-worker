> Status: Active
> Owner: @jdubz
> Last Updated: 2025-11-17

# SQLite Migration Plan (Job Finder BE)

_Last updated: November 17, 2025_

## 1. Context & Goals
- Both `job-finder-BE` (Firebase Cloud Functions) and `job-finder-FE` currently depend on Firestore directly.
- All runtime services (Node API, worker, SQLite) will now live on a single managed edge machine; the legacy NAS is no longer part of the stack.
- Running a standalone database daemon (Mongo, CouchDB, etc.) is still undesirable for this footprint, so SQLite remains the target.
- Objective: replace Firestore with a lightweight SQLite database that runs in-process with the backend/worker. Backward compatibility is not required because the old app is effectively greenfield; we'll attempt to capture as much historical data as possible, but losing data is acceptable.
- Firebase Auth/App Check/Storage remain for now; only persistence changes.

## 2. Target Architecture
- **SQLite**: single `.db` file stored on the edge host's local disk (e.g., `/srv/job-finder/data/jobfinder.db`) and mounted into every service container via the shared `docker-compose.yml`. Node server and Python worker access it using `better-sqlite3`/`sqlite3`, keeping everything on the same machine.
- **Schema approach**: map Firestore collections to tables. Keep documents as JSON columns where convenient, or normalize when necessary. Timestamps stored as ISO strings or integer millis.
- **Access layer**: thin data access modules per domain (`ContentItemStore`, `JobQueueStore`, etc.) that issue SQL queries/transactions. Since the footprint is small, a lightweight query builder (Drizzle ORM, Kysely, or raw SQL) is acceptable.
- **Backups**: nightly `sqlite3 jobfinder.db ".backup jobfinder-YYYYMMDD.db"` into `/srv/job-finder/backups`, followed by sync to off-site object storage (e.g., rclone to Backblaze/S3) because NAS snapshots are gone. Optional weekly prune of local copies.

## 3. Migration Phases
### Phase 0 – Inventory & Schema Design
1. Enumerate Firestore collections + fields pulled by BE/FE (`contact-submissions`, `job-queue`, `job-matches`, `generator-documents`, `job-finder-config`, `content-items`, `blurbs`, `experience`, worker-specific collections).
2. For each collection, design a corresponding SQLite table (e.g., `content_items`, `job_queue`, `generator_documents`). Decide when to store JSON vs normalized tables. Capture indexes needed for queries (status filters, order, created_at desc, etc.).
3. Define master schema file (`server/db/schema.sql`) plus migration scripts (simple SQL files or a tool like `drizzle-kit`).

### Phase 1 – Data Access Adapters
1. Create per-domain store modules inside the backend (e.g., `src/stores/content-item.store.ts`) exposing the same methods services currently expect. Initially, they still call Firestore but live behind an interface to ease swapping.
2. Port each store to SQLite by translating Firestore operations:
   - `collection.add` → `INSERT` with generated UUID (`requestId` etc.).
   - Queries with `orderBy/limit` → SQL `ORDER BY` + `LIMIT`.
   - `array-contains` → junction tables or JSON queries (`json_each` / `LIKE`).
   - Batched writes (`db.batch()`) → SQL transactions.
3. Update Jest tests to cover both implementations: Firestore emulator for legacy, SQLite (using `better-sqlite3` or `sqlite3` with an in-memory DB) for the new path.

### Phase 2 – SQLite Runtime Setup
1. Add a `sqlite` helper (`src/config/sqlite.ts`) to open a shared connection (or pool) with busy timeout and WAL mode enabled (`PRAGMA journal_mode = wal;`).
2. Create migration runner script (`npm run db:migrate`) to apply schema files on startup (this runs inside containers before services come online).
3. Place the `.db` file on the host path managed by Compose (e.g., `/srv/job-finder/data/jobfinder.db`) and reference it via bind-mount volume + env var (`JOBFINDER_DB_PATH`). Both backend and worker share the same volume within the single-machine stack.

### Phase 3 – Data Migration
1. Write Firestore export script (`scripts/firestore-export.ts`) that dumps each collection to NDJSON, preserving IDs and timestamps, storing files under the host backup path (e.g., `/srv/job-finder/backups/firestore`).
2. Author import script (`scripts/sqlite-import.ts`) that reads NDJSON and inserts rows into SQLite tables. Convert Firestore timestamps to ISO strings, flatten nested objects where needed, and store arrays either in JSON columns or child tables.
3. Run the import in a temporary Compose service or dev container, validate row counts + sample queries. Iterate on schema if gaps arise.
4. Enable dual writes in adapters (write to Firestore + SQLite) for high-churn collections (`job-queue`, `generator-documents`) until confident.

### Phase 4 – Frontend & Worker Alignment
1. **Frontend**: replace direct Firestore SDK usage (`src/services/firestore/*`, `FirestoreContext`) with REST clients hitting backend endpoints exposed via the Cloudflared tunnel. Use SWR/React Query for caching; emulate "real-time" by polling or later adding WebSockets.
2. **Worker**: swap Firestore client code (`google.cloud.firestore`) for Python `sqlite3` queries using the shared `.db` file path. Reuse schema definitions (maybe export JSON schema from TypeScript).
3. Update shared types to include SQLite-specific metadata where needed (e.g., `id` now stored as TEXT primary key) but keep API-compatible.

### Phase 5 – Cutover & Cleanup
1. Flip backend env to `DATA_STORE=sqlite` in dev and then the single production stack (staging is no longer maintained). Monitor logs for SQL errors via the local pull-agent dashboard.
2. After verifying parity, disable Firestore writes (security rules read-only) and keep a final Firestore export as archival backup.
3. Remove Firebase emulator/deploy scripts once fully decommissioned.

## 4. Risk Mitigation
- **Concurrency**: enable WAL mode and set `PRAGMA busy_timeout` so simultaneous writes from backend + worker queue gracefully wait instead of failing.
- **Schema drift**: use a migration tool or versioned SQL scripts committed alongside code; require migrations to run before boot.
- **Backups**: schedule `.backup` command + off-site sync (no NAS), and test restore quarterly by pulling a remote snapshot onto the host.
- **Frontend transition**: plan communications/UI changes because real-time Firestore listeners disappear; rely on explicit refresh or periodic polling in the UI.

## 5. Success Criteria
- All persistence operations run through SQLite with matching behavior (tested via regression suites comparing Firestore export vs SQLite queries).
- Frontend no longer imports `firebase/firestore`; data comes from backend API.
- Worker job orchestration completes using SQLite data.
- Daily backup job produces `.db` snapshots stored locally then synced to the chosen off-site bucket.
