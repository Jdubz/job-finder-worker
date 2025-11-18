> Status: Active
> Owner: @jdubz
> Last Updated: 2025-11-18

# Job Finder Documentation Hub

The `docs/` tree consolidates all written guidance that was scattered across the legacy repositories. Use the table below to jump into the section that matches the part of the stack you are touching.

| Directory | Scope | Good first file |
| --- | --- | --- |
| [`docs/plans`](./plans) | Roadmaps, migration plans, production prep notes | [`prod-migration-prep.md`](./plans/prod-migration-prep.md) |
| [`docs/backend`](./backend) | Express API + Firebase Functions design, issues, and runbooks | [`backend/README.md`](./backend/README.md) |
| [`docs/frontend`](./frontend) | Vite/React documentation migrated from the FE repo | [`frontend/README.md`](./frontend/README.md) |
| [`docs/worker`](./worker) | Python worker (scraper/scheduler) docs, including historical context | [`worker/README.md`](./worker/README.md) |
| [`docs/shared`](./shared) | Shared schema write-ups, structured logging specs, and other cross-cutting references | [`shared/README.md`](./shared/README.md) |
| [`docs/tasks`](./tasks) | Centralized backlog for outstanding actions | [`tasks/backlog.md`](./tasks/backlog.md) |
| [`docs/templates`](./templates) | Markdown templates for new docs | Choose the appropriate template |
| [`docs/archive`](./archive) | Read-only historical context | [`archive/README.md`](./archive/README.md) |

## How This Tree Is Organized

- Each major application now keeps *reference* docs inside its workspace (`job-finder-FE`, `job-finder-BE`, `job-finder-worker`). Long-form explanations live under `docs/`.
- Subdirectories such as `backend/api-docs` and `worker/worker-docs` retain the same hierarchy from the pre-mono repos, so old bookmarks keep working.
- When you add a new RFC or runbook, place it in the appropriate subdirectory and link it here so teammates can discover it.

## Writing Rules

- Follow the [Documentation System](./DOCUMENTATION_GUIDELINES.md) for allowed doc types, metadata, and archival rules.
- Use templates from [`docs/templates`](./templates). Pull requests adding docs without the required metadata block will be rejected.
- Capture action items in [`docs/tasks/backlog.md`](./tasks/backlog.md); do not scatter TODOs across files.

## Related Resources

- Infrastructure documentation now lives alongside the manifests in [`infra/`](../infra) (see `infra/README.md` for details).
- Shared TypeScript schema documentation is mirrored in [`shared/`](../shared).
