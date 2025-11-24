> Status: Active
> Owner: @jdubz
> Last Updated: 2025-11-18

# SQLite Schema Reference

Canonical map of the SQLite tables shared across the Node API (`job-finder-BE/server`) and the Python worker. The schema is defined through versioned SQL files in `infra/sqlite/migrations` and hydrated via the migration runner (`npm run migrate --workspace job-finder-BE/server`).

## Table Inventory

### schema_migrations
Tracks applied migration filenames with timestamps. Never edit directly—add a new SQL file instead.

### content_items
Normalized resume/content data presented in the frontend.
- Primary key: `id` (TEXT).
- Columns mirror `ContentItem` fields from `shared/src/content-item.types.ts` (type, visibility, order, parent_id, body_json, ai_context).
- Indexes: `idx_content_items_visible`, `idx_content_items_parent`.

### companies
Canonical employer list scored for sourcing.
- Lowercased `name_lower` enforces uniqueness; update both when renaming.
- Worker adapters mirror the structure via `job-finder-worker/src/job_finder/companies/sqlite_manager.py`.
- `analysis_status` added in `002_queue_enhancements.sql` to track batch processing state.

### job_queue
Source of truth for queue orchestration.
- `type`, `status`, `source`, and metadata fields follow `SharedQueueItem` in `shared/src/queue.types.ts`.
- `pipeline_stage`, `source_*`, `tracking_id`, and spawn depth columns were introduced by migration 002.
- When adding new queue metadata, update: migrations, worker adapters, backend repository (`job-finder-BE/server/src/modules/job-queue`), and shared types.

### job_matches
Results surfaced to the UI.
- `match_score`, `application_priority`, and reason arrays are stored as JSON text (`match_reasons`, `missing_skills`, etc.).
- Backend repository: `job-matches/job-match.repository.ts`.

### generator_documents
Stores prompt requests/responses, personalization documents, etc. Each row includes `document_type` plus JSON payload. Used by the generator routes and worker ingest.

### job_finder_config
Key–value store for configuration blobs (queue settings, AI prompts, stop list). `PromptsRepository` uses the `ai-prompts` entry.

### job_sources
Scraper/source registry with counters and failure tracking.
- JSON columns: `config_json`, `tags`.
- Exposed through shared types under `shared/src/job-source.types.ts` (future work).

### contact_submissions
Contact form payloads plus tracing metadata for auditing.
- `metadata_json` contains client context.
- `transaction_json` stores serialized logging spans from the worker/FE.

### users
Admin roster seeded with default accounts. Worker/backends currently rely on Firebase Auth/App Check headers but this table is the base for future auth.

### Supporting Tables
- `generator_documents` indices, `view_queue_ready`, and other helper views live in the migrations as needed.

## Adding or Modifying Columns
1. Create a new SQL file under `infra/sqlite/migrations` with the next sequence number (e.g., `003_new_feature.sql`).
2. Include the schema change and any data backfills. Never edit existing migration files.
3. Update shared types (`shared/src/**`) to match the new columns.
4. Update backend repositories + worker adapters to read/write the new fields.
5. Run `npm run migrate --workspace job-finder-BE/server` locally; commit both the migration and any regenerated database snapshots (if applicable).

## Default Paths & Environment Variables
- Local development uses `infra/sqlite/jobfinder.db` (checked into git for seed data) and respects `JF_SQLITE_DB_PATH` if set.
- Docker/production deployments expect `JF_SQLITE_DB_PATH` to point to the mounted volume defined in the root `Makefile` and deployment scripts.

## Related Documentation
- Backend routing details: `docs/backend/api-docs/development/job-matches-and-prompts.md`.
- Worker adapter notes: `job-finder-worker/README.md` and `docs/worker/reference/STATE_DRIVEN_PIPELINE_SUMMARY.md`.
- Firestore-era schema docs now live under `docs/archive/2025-11/firestore-ops/shared` for historical lookup only.
