# Contributing Guide

Thanks for helping improve Job Finder! This monorepo contains every service (frontend, Node API, Firebase Functions, shared types, worker). To keep things safe and predictable:

## Branching & PRs

- Work from `staging` (branch protections require PRs into `main`).
- Force pushes are disabled on `main`; create feature branches off `staging` and open PRs targeting `staging`.
- Keep commits focused (code, docs, infra in the same change is fine if they are related).

## Installation

```bash
npm install           # installs workspace deps
npx husky install     # enables git hooks (lint+build guards)
```

Workspaces:

- `shared`
- `job-finder-BE/functions`
- `job-finder-BE/server`
- `job-finder-FE`

## Common Commands

```bash
npm run lint:server       # eslint for Node API
npm run lint:functions    # eslint for Firebase Functions
npm run lint:frontend     # eslint for frontend
npm run build:server      # tsc + tsc-alias for Node API
npm run build:frontend    # build Vite app
```

Each package also exposes its own scripts (use `npm run <script> --workspace <name>` when needed).

## Shared Types

All cross-service types live in `/shared`. Import them with `@shared/types`. If you change a schema, update the shared files first, then adjust the consuming packages.

## Tests

Not every package has automated tests yet, but please run the applicable lint/build tasks locally before pushing. CI will run the same commands from the workspace scripts.

## Code Style

- TypeScript: strict mode (see individual `tsconfig` files)
- Python worker: follow existing formatting (Black)
- Keep documentation in `docs/` up to date

## Reporting Issues

Open GitHub issues with clear reproduction steps and label the affected area (frontend/API/worker/shared/docs).
