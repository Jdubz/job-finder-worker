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
npm install         # installs workspace dependencies
npm run build:server      # Build the Node API (tsc + tsc-alias)
npm run build:frontend    # Build the React app
npm run lint:server       # Lint the Node API
npm run lint:functions    # Lint Firebase Functions
npm run lint:frontend     # Lint the frontend
```

To run scripts inside a workspace manually:

```bash
npm run <script> --workspace job-finder-BE/server
```

## Shared Types

Import shared definitions via the `@shared/types` alias. Each TypeScript package sets up a `tsconfig` path and (where necessary) runs `tsc-alias` during build so emitted JavaScript uses relative paths. There is no npm package to install.

## Husky Hooks

Git hooks live at the repo root and run automatically when Husky is installed:

- `pre-commit`: runs `npm run lint:server`, `npm run lint:functions`, `npm run lint:frontend`
- `pre-push`: runs `npm run build:server` and `npm run build:frontend`

After cloning, enable hooks with:

```bash
npm install
npx husky install
```

## Next Steps

- Finish migrating the worker + frontend to the new Node server / SQLite backend
- Remove remaining Firebase dependencies once parity is achieved
- Flesh out CI so the root `build` job runs workspace builds + tests
