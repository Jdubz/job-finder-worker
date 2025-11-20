# Structured Logging Overview

**Last Updated:** 2025-10-28  
**Owner:** Platform / Observability

Structured JSON logging is now standard across the Job Finder platform. Every service emits log entries that conform to the `StructuredLogEntry` schema published in `job-finder-shared-types`. Aggregation, local streaming, and cloud forwarding are coordinated through App Monitor.

## Goals
- Consistent event shape across frontend, backend, worker, and tooling logs.
- Easy correlation via `requestId`, `sessionId`, `queueItemId`, and environment labels.
- Local-first developer experience with App Monitor, backed by Google Cloud Logging in staging/production.

## Service Runbooks
- **Schema Ownership:** `job-finder-shared-types/docs/structured-logging-schema.md`
- **Backend Cloud Logging:** `job-finder-BE/docs/operations/structured-logging.md`
- **Frontend Browser Logging:** `job-finder-FE/docs/development/structured-logging.md`
- **Worker JSON Formatter:** `job-finder-worker/docs/observability/structured-logging.md`
- **Aggregation & Streaming:** `app-monitor/docs/dev-monitor/structured-logging.md`

Use this overview as the hub for structured logging references. Service-specific runbooks contain installation commands, code snippets, and troubleshooting guidance.
