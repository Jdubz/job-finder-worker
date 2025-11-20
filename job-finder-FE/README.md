# Job Finder Frontend

The Vite/React web client now lives inside this monorepo. All feature specs, troubleshooting guides, and plans were migrated into `docs/frontend/`. See [`docs/frontend/README.md`](../docs/frontend/README.md) plus the [docs guidelines](../docs/DOCUMENTATION_GUIDELINES.md) for the canonical structure.

## Commands

Run everything from the repo root so Husky/CI stay in sync:

- Install deps: `npm install`
- Lint: `npm run lint:frontend`
- Unit tests: `npm run test:unit --workspace job-finder-FE`
- Integration tests (hits mocked REST adapters, no Firebase emulators needed): `npm run test:integration --workspace job-finder-FE`
- Build (staging): `npm run build:frontend`

The frontend now authenticates via Google Identity Services (GIS) ID tokens but **all** data access goes through the Node API and shared SQLite database (`VITE_API_BASE_URL` defaults to `/api`). Set `VITE_GOOGLE_OAUTH_CLIENT_ID` in your `.env` files rather than touching code when endpoints move.

Legacy per-repo automation (no-verify scripts, local logs, etc.) was removed; use the root workflows/hooks instead.

## Firebase Hosting Deploys

- The Firebase Hosting service account JSON lives at job-finder-FE/.firebase/serviceAccountKey.json. The entire .firebase/ directory is gitignored (see repo .gitignore) so the credential never leaves the machine, but Firebase CLI commands (e.g., firebase deploy --only hosting) will automatically pick it up.
- In GitHub Actions/CI, the same JSON is injected via the FIREBASE_SERVICE_ACCOUNT secret. Workflows that deploy the frontend should read that secret into a temporary file (or use firebase login:ci) before calling firebase deploy.
- If you need to rotate/regenerate the key, drop the new JSON into job-finder-FE/.firebase/serviceAccountKey.json locally and update the FIREBASE_SERVICE_ACCOUNT secret in CI to keep parity.
