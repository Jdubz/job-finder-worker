# Job Finder Backend

This workspace now lives inside the monorepo and only contains the Express + SQLite API (`server/`). The legacy Firebase Functions codebase was fully removed as part of MIG-008. All design docs, runbooks, and migration notes were consolidated under `docs/backend/`—check [`docs/backend/README.md`](../docs/backend/README.md) and the global [documentation guidelines](../docs/DOCUMENTATION_GUIDELINES.md) for the canonical references.

## Development

- Install dependencies from the repo root (`npm install`)
- Build the shared types first: `npm run build:shared`
- Express API: `npm run dev --workspace job-finder-BE/server`

Running lint/tests from the root automatically targets the server workspace (`npm run lint:server`). Use the root Husky hooks + CI workflows for enforcement.
