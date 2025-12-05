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

## Deprecations / Removals
- Earlier idea to run Gmail ingest in the worker: **superseded** by this API-side plan; no worker endpoints to be added. Avoid adding any Gmail logic to `job-finder-worker`.
- No other components marked for removal.

## Risks & Mitigations
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
