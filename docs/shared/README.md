> Status: Active
> Owner: @jdubz
> Last Updated: 2025-11-18

# Shared Documentation

This folder contains cross-cutting documentation that applies to multiple services (structured logging, shared Firestore schemas, npm publishing notes, etc.).

## Highlights

- [`shared-docs/firestore-schema-codification.md`](./shared-docs/firestore-schema-codification.md) – definitive Firestore schema reference.
- [`shared-docs/structured-logging-schema.md`](./shared-docs/structured-logging-schema.md) – logging payload contracts used by both the worker and frontend.
- Archived references from the historical `job-finder-docs` repo now live in [`docs/archive/job-finder-docs/shared`](../archive/job-finder-docs/shared).

## When to Update

- Whenever the shared TypeScript types change meaningfully, add context here (e.g., schema migrations, new logging fields).
- If documentation spanned multiple repos previously, keep the canonical copy under this folder going forward.
