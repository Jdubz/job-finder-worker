# Job Finder Monorepo

This repository now hosts every service that powers Job Finder:

- `job-finder-FE`: Vite/React frontend deployed to Firebase Hosting
- `job-finder-BE/functions`: legacy Firebase Functions (still around until the Node server replacement is finished)
- `job-finder-BE/server`: new Express + SQLite API served via Docker
- `shared`: the canonical TypeScript types shared by all packages
- `docs`: consolidated documentation (backend/frontend/worker/shared)
- `job-finder-worker`: Python worker / scraper

## Workspaces

Run commands from the repo root with npm workspaces (npm v9+):

```bash
npm install              # installs workspace dependencies
npm run build:server     # Build shared types + Node API
npm run build:frontend   # Build shared types + React app
npm run lint:server      # Lint the Node API
npm run lint:functions   # Lint Firebase Functions
npm run lint:frontend    # Lint the frontend
npm run test:e2e        # Run cross-system end-to-end tests
```

To run scripts inside a workspace manually:

```bash
npm run <script> --workspace job-finder-BE/server
```

## Shared Types

Import shared definitions via the local `@shared/types` workspace package. Add it to a workspace with a `file:` dependency (e.g., `"@shared/types": "file:../shared"`), then run `npm run build --workspace shared` (or the root `build:*` scripts) to refresh the emitted `.d.ts` files whenever schemas change.

## Documentation Map

- [`docs/README.md`](docs/README.md) – platform-wide documentation hub (plans, backend/frontend/worker docs, shared schemas).
- [`docs/DOCUMENTATION_GUIDELINES.md`](docs/DOCUMENTATION_GUIDELINES.md) – rules for writing/archiving docs, metadata requirements, and templates.
- [`docs/tasks/backlog.md`](docs/tasks/backlog.md) – single backlog for outstanding documentation or process follow-ups.
- [`infra/README.md`](infra/README.md) – explanation of the deployment artifacts (`cloudflared`, Docker compose, SQLite schema/seeders).

## Husky Hooks

Git hooks live at the repo root and run automatically when Husky is installed:

- `pre-commit`: runs `npm run lint:server`, `npm run lint:functions`, `npm run lint:frontend`, and `npm run docs:audit`
- `pre-push`: runs `npm run tests:staged` which finds every workspace with changes (including the Python worker) and executes its `test:unit`/`test:integration` scripts or `make test`

After cloning, point Git hooks at `.husky` and install dependencies:

```bash
git config core.hooksPath .husky
npm install
npm run prepare
```

## Next Steps

- Finish migrating the worker + frontend to the new Node server / SQLite backend
- Remove remaining Firebase dependencies once parity is achieved
- Flesh out CI so the root `build` job runs workspace builds + tests

## Security

Please review `SECURITY.md` for responsible disclosure guidelines and expectations around scraping credentials, dependency upgrades, and reporting timelines.
