# Job Finder Backend

This workspace now lives inside the monorepo and only contains the Express + SQLite API (`server/`). The legacy Firebase Functions codebase was fully removed as part of MIG-008. All design docs, runbooks, and migration notes were consolidated under `docs/backend/`—check [`docs/backend/README.md`](../docs/backend/README.md) and the global [documentation guidelines](../docs/DOCUMENTATION_GUIDELINES.md) for the canonical references.

## Development

- Install dependencies from the repo root (`npm install`)
- Build the shared types first: `npm run build:shared`
- Express API: `npm run dev --workspace job-finder-BE/server`

Running lint/tests from the root automatically targets the server workspace (`npm run lint:server`). Use the root Husky hooks + CI workflows for enforcement.

## Generator assets (avatar/logo)

- Upload endpoint: `POST /api/generator/assets/upload` with JSON `{ type: "avatar" | "logo", dataUrl?: string, url?: string }`
- Files are written under `GENERATOR_ARTIFACTS_DIR` (default `/data/artifacts`) inside `assets/{date}/...` and are served via `GET /api/generator/artifacts/assets/...`.
- Personal info should store the returned `path` (e.g., `/assets/2025-11-25/avatar-xxxx.jpg`) so the PDF renderer can embed the images from the local filesystem.
