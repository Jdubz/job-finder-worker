> Status: Active
> Owner: @jdubz
> Last Updated: 2025-11-18

# Shared Documentation

This folder contains cross-cutting documentation that applies to multiple services (SQLite schema reference, shared API contracts, structured logging, npm publishing notes).

## Highlights

- [`shared-docs/sqlite-schema-reference.md`](./shared-docs/sqlite-schema-reference.md) – canonical SQLite table + column mapping shared by backend + worker.
- [`shared-docs/structured-logging-schema.md`](./shared-docs/structured-logging-schema.md) – logging payload contracts used by both the worker and frontend.
- [`shared-docs/npm-publishing-setup.md`](./shared-docs/npm-publishing-setup.md) – how to publish the shared types package for local testing.
- Firestore schema docs were moved to [`docs/archive/2025-11/firestore-ops/shared`](../archive/2025-11/firestore-ops/shared) for historical reference only.

## When to Update

- Whenever the shared TypeScript types change meaningfully, add context here (e.g., schema migrations, new logging fields).
- If documentation spanned multiple repos previously, keep the canonical copy under this folder going forward.
