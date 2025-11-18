# Job Finder Frontend

The Vite/React web client now lives inside this monorepo. All feature specs, troubleshooting guides, and plans were migrated into `docs/frontend/`. See [`docs/frontend/README.md`](../docs/frontend/README.md) plus the [docs guidelines](../docs/DOCUMENTATION_GUIDELINES.md) for the canonical structure.

## Commands

Run everything from the repo root so Husky/CI stay in sync:

- Install deps: `npm install`
- Lint: `npm run lint:frontend`
- Unit tests: `npm run test:unit --workspace job-finder-FE`
- Integration tests (requires Firebase emulators): `npm run test:integration --workspace job-finder-FE`
- Build (staging): `npm run build:frontend`

Legacy per-repo automation (no-verify scripts, local logs, etc.) was removed; use the root workflows/hooks instead.
