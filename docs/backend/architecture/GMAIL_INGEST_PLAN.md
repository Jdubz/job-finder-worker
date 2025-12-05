> Status: Draft
> Owner: @jdubz
> Last Updated: 2025-12-05

# Gmail Job Listing Ingest – API Server Plan

## Goal
Add Gmail ingestion to capture job listings delivered by email and feed them into the existing queue/intake pipeline **from the API server**, keeping worker load unchanged.

## Scope (In)
- Poll Gmail for new messages under a dedicated label/query.
- Parse messages to extract candidate job listings and enqueue them as `QueueItemType.JOB` with `source="email"`.
- Persist idempotence state in SQLite on the API side.
- Expose cron + manual trigger in the API server.

## Scope (Out)
- No changes to the Python worker or scraper runners.
- No UI changes beyond seeing email-sourced items in existing queue views.

## Existing Systems to Leverage
- **Job queue API/service** (`server/src/modules/job-queue/*`): `JobQueueService.submitJob` already accepts `source="email"`; reuses queue dedupe and metadata packing.
- **Job listing dedupe** (`job_listings` table via worker intake) and URL-based queue dedupe already prevent repeat processing.
- **Cron framework** (`server/src/scheduler/cron.ts`): schedule `gmailIngest` job alongside scrape/maintenance.
- **Config repo** (`ConfigRepository`, `worker-settings` entry): store runtime Gmail ingest settings.
- **Logging/metrics** (`logger`, queue event SSE) for ingest stats.

## Proposed Architecture
- **Poller module** (`server/src/services/gmail-ingest/`):
  - Auth: service account with domain delegation or OAuth token file path from env (`GOOGLE_APPLICATION_CREDENTIALS`, `GMAIL_USER`, optional `GMAIL_TOKEN_PATH`).
  - Fetch strategy: `history.list` starting from `last_history_id` checkpoint OR `messages.list` with label/query; cap by `maxMessages`.
  - Idempotence: skip if `message_id` already recorded in `email_ingest_state`.
- **Parser**:
  - Extract links from HTML/text; keep job-ish URLs (Greenhouse/Lever/Workday/boards.*) and anchors near role/company snippets.
  - Optional lightweight LLM fallback (guarded by config) when a single link lacks title/company.
  - Output job dict: `{url, title?, company?, location?, description?}` plus metadata `{messageId, threadId, subject, from, snippet}`.
- **Enqueue**:
  - Call `JobQueueService.submitJob` per parsed job with:
    - `source: "email"`, `metadata` carrying Gmail context, `companyName`/`title`/`description` when available.
    - `source_label: "gmail:<sender>"` stored in metadata for observability.
  - Allow configurable `remoteSourceDefault` to pass through as `metadata` (worker prefilter will respect remote hint only after future change; no worker code change now).
- **State persistence**:
  - New SQLite table `email_ingest_state(message_id PRIMARY KEY, thread_id, history_id, processed_at, jobs_found, jobs_enqueued, error TEXT)`.
  - Single-row `ingest_cursor` optional for `last_history_id` if using Gmail History API.
- **Scheduling**:
  - Add `gmailIngest` cron job in `cron.ts` (e.g., every 15–30 minutes).
  - Admin-only manual trigger route `POST /cron/trigger/gmail-ingest`.

## Config & Env
- `worker-settings` (or dedicated `gmail-ingest` entry) fields:
  - `enabled`, `label`, `query`, `maxMessages`, `allowedSenders`, `remoteSourceDefault`, `aiFallbackEnabled`.
- Env vars: `GOOGLE_APPLICATION_CREDENTIALS`, `GMAIL_USER`, optional `GMAIL_TOKEN_PATH`, `GMAIL_LABEL` default fallback.

## Data Model Changes
- Migration (API DB): create `email_ingest_state` table and optional `ingest_cursor` row for `last_history_id`.
- No worker DB changes required.

## API/Routes
- New admin route: `POST /cron/trigger/gmail-ingest` (mirrors existing scrape trigger).
- No public API surface change; queue items already exposed with source metadata.

## Admin Configuration UI
- Add an **admin-only Gmail tab** in the existing config area (job-finder-config page) to surface:
  - Status (connected/not connected), last sync time, and label/query preview.
  - Editable settings: label/query, max messages, allowed senders, remoteSourceDefault, AI fallback toggle.
  - “Authorize Gmail” button that kicks off the OAuth consent flow using the existing OAuth client; on success, it stores `refresh_token` (and `access_token` if present) plus token expiry in the backend config store.
- Backend adds a new `job_finder_config` record, e.g., key `gmail-ingest`, holding:
  ```json
  {
    "enabled": true,
    "label": "job-alerts",
    "query": "label:job-alerts newer_than:2d",
    "maxMessages": 100,
    "allowedSenders": ["alerts@example.com"],
    "remoteSourceDefault": false,
    "aiFallbackEnabled": false,
    "defaultLabelOwner": null
  }
  ```
- Authorization flow: FE opens OAuth window → receives auth code → POSTs to a new admin endpoint (e.g., `POST /admin/gmail/oauth/callback`) to exchange code for tokens and persist them into the `gmail-ingest` config record. The poller reads tokens from that record (or secure secret store) to refresh access tokens headlessly.

## Multi-Inbox & User-Scoped Tokens
- Goal: ingest from multiple admin mailboxes; tokens are user-scoped.
- Schema change: add columns to `users` table (migration):
  - `gmail_email` TEXT NULL (mailbox authenticated)
  - `gmail_auth_json` TEXT NULL **encrypted at rest** (stores `refresh_token`, optional `access_token`, `expiry_date`, `history_id`, `scopes`)
  - Index on `gmail_email` for lookup.
- Admin Gmail tab behavior:
  - On successful OAuth callback, upsert the user (by email) in `users`; set `gmail_email` to the authorized mailbox and store tokens in `gmail_auth_json`.
  - Show a list of linked inboxes (users with gmail_auth_json present); allow revoke (clears those columns).
- Poller behavior:
  - Load all users with `gmail_auth_json` and `gmail_email` set.
  - For each, run ingest with that user’s tokens + the shared `gmail-ingest` settings (label/query). History checkpoint can live inside `gmail_auth_json.history_id` per mailbox.

## Auth Strategy (recommended)
- Primary: reuse the existing OAuth client (same as current sign-in) and request `gmail.readonly` (optionally `gmail.modify` only if we label/archive). This supports multiple inboxes and avoids new keys.
- Encryption: store refresh tokens only, encrypted using app-level envelope encryption (e.g., AES-256 key from env or GCP KMS); never store plaintext tokens in SQLite. Decrypt in memory only when polling.
- Fallback (only if Workspace admin approves): service account + domain delegation for a dedicated shared inbox; still store delegated subject + key path in config, not in DB.

## Deprecations / Removals
- Earlier idea to run Gmail ingest in the worker: **superseded** by this API-side plan; no worker endpoints to be added. Avoid adding any Gmail logic to `job-finder-worker`.
- No other components marked for removal.

## Risks & Mitigations
- **Token security**: refresh tokens are sensitive—**must be encrypted at rest** (envelope or KMS) and redacted from logs; add revocation flow in admin UI. Rotate encryption key via env/KMS and document recovery.
- **PII handling**: store only `messageId/threadId/from/subject/snippet`; discard full bodies after parse.
- **Duplicate URLs**: rely on queue + `job_listings` URL dedupe; also record `message_id` to avoid reprocessing digests.
- **Gmail quota**: batch `messages.get` and respect `maxMessages`; use history checkpoints to reduce calls.
- **Parsing quality**: start with domain/anchor heuristics; keep LLM fallback off by default, configurable.

## Implementation Steps
1) Add migration for `email_ingest_state` (backend DB).
2) Implement `gmail-ingest` service (auth, poller, parser, enqueue hook).
3) Wire cron job + admin trigger route.
4) Add configuration schema validation and docs (`docs/backend/setup` mention env/config).
5) Tests: parser unit tests with sample emails; ingest service integration test using mocked Gmail API; cron trigger test.

## Open Questions
- Which inbox/label to monitor (single shared vs per-user)?
- Preferred auth mode: service account with delegation vs OAuth installed app?
- Default cadence (15m vs hourly) given Gmail quota and queue noise tolerance?
