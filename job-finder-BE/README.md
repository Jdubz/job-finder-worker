# Job Finder Backend

This workspace now lives inside the monorepo. It contains the legacy Firebase Functions (`functions/`) and the new Express + SQLite API (`server/`). All design docs, runbooks, and migration notes were consolidated under `docs/backend/`—check [`docs/backend/README.md`](../docs/backend/README.md) and the global [documentation guidelines](../docs/DOCUMENTATION_GUIDELINES.md) for the canonical references.

## Development

- Install dependencies from the repo root (`npm install`)
- Build the shared types first: `npm run build:shared`
- Firebase Functions: `npm run dev --workspace job-finder-BE/functions`
- Express API: `npm run dev --workspace job-finder-BE/server`

Running lint/tests from the root automatically targets both workspaces (`npm run lint:server`, `npm run lint:functions`, etc.). Use the root Husky hooks + CI workflows instead of the retired scripts in this folder.
