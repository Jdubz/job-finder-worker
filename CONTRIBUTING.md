# Contributing Guide

Thanks for helping improve Job Finder! This monorepo contains every service (frontend, Node API, Firebase Functions, shared types, worker). To keep things safe and predictable:

## Branching & PRs

- Work from `staging` (branch protections require PRs into `main`).
- Force pushes are disabled on `main`; create feature branches off `staging` and open PRs targeting `staging`.
- Keep commits focused (code, docs, infra in the same change is fine if they are related).

## Installation

```bash
git config core.hooksPath .husky   # point Git at the Husky hooks (once per clone)
npm install                       # installs workspace deps
npm run prepare                   # verifies hooks are executable
```

Workspaces:

- `shared`
- `job-finder-BE/functions`
- `job-finder-BE/server`
- `job-finder-FE`
- `infra/sqlite/seeders`

## Common Commands

```bash
npm run lint:server       # eslint for Node API
npm run lint:functions    # eslint for Firebase Functions
npm run lint:frontend     # eslint for frontend
npm run build:server      # shared types + Node API build
npm run build:frontend    # shared types + Vite app build
```

Each package also exposes its own scripts (use `npm run <script> --workspace <name>` when needed).
The Python worker (`job-finder-worker`) relies on its Makefile (`make test`, `make dev`).

## Shared Types

All cross-service types live in `/shared`. Import them with `@shared/types` (declared via a `file:` dependency). If you change a schema, run `npm run build --workspace shared` first, then update the consuming packages.

## Tests

Use `npm run tests:staged` to execute the unit/integration suites for every workspace that changed (the script also calls `make test` inside `job-finder-worker` when Python files are touched). The pre-push hook enforces the same check.

Not every package has automated tests yet, but please run the applicable lint/build tasks locally before pushing. CI will run the same commands from the workspace scripts.

## Code Style

- TypeScript: strict mode (see individual `tsconfig` files)
- Python worker: follow existing formatting (Black)
- Keep documentation in `docs/` up to date

## Reporting Issues

Open GitHub issues with clear reproduction steps and label the affected area (frontend/API/worker/shared/docs).
