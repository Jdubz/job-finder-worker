> Status: Active
> Owner: @jdubz
> Last Updated: 2025-11-18

# Backend Documentation

The backend docs were migrated from the Firebase Functions + Express repos and remain nested under `docs/backend/api-docs`. Use this file as a quick index.

## Where to Start

- [`api-docs/operations`](./api-docs/operations) – on-call / operational playbooks (queue troubleshooting, IAM references, Cloudflared notes).
- [`api-docs/development/job-matches-and-prompts.md`](./api-docs/development/job-matches-and-prompts.md) – REST coverage for job matches + AI prompts.
- [`api-docs/development/generator-workflow.md`](./api-docs/development/generator-workflow.md) – Codex-based generator routes (`/start`, `/step/:id`, artifacts) and CLI credential guidance.
- [`api-docs/issues`](./api-docs/issues) – historical gap/issue writeups from the migration audit.
- Legacy Firebase deployment/emulator docs (formerly `PRODUCTION_DEPLOYMENT*.md`, `EMULATORS.md`, `GRANT_DEPLOY_PERMISSIONS.md`) now live in [`docs/archive/2025-11/backend/`](../archive/2025-11/backend). Legacy Firestore operation runbooks were moved to `docs/archive/2025-11/firestore-ops/`.

## Guidelines

- Keep Express/SQLite notes here; Firebase Functions content now lives only in the archive.
- When a document only affects the new Node API, add it under `api-docs/development` and link to it from this index.
