# Job Finder Frontend

The Vite/React web client now lives inside this monorepo. All feature specs, troubleshooting guides, and plans were migrated into `docs/frontend/`. See [`docs/frontend/README.md`](../docs/frontend/README.md) plus the [docs guidelines](../docs/DOCUMENTATION_GUIDELINES.md) for the canonical structure.

## Commands

Run everything from the repo root so Husky/CI stay in sync:

- Install deps: `npm install`
- Lint: `npm run lint:frontend`
- Unit tests: `npm run test:unit --workspace job-finder-FE`
- Integration tests (hits mocked REST adapters, no Firebase emulators needed): `npm run test:integration --workspace job-finder-FE`
- Build (staging): `npm run build:frontend`

The frontend now authenticates via Firebase Auth/App Check but **all** data access goes through the Node API and shared SQLite database (`VITE_API_BASE_URL` defaults to `/api`). Adjust `.env` files rather than touching code when endpoints move.

Legacy per-repo automation (no-verify scripts, local logs, etc.) was removed; use the root workflows/hooks instead.
