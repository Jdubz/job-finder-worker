# Job Finder Docs Hub

This repository holds cross-repository planning artifacts for the Job Finder platform. Product and service documentation now lives alongside the code in their respective repos (`job-finder-BE`, `job-finder-FE`, `job-finder-worker`, `job-finder-shared-types`, `app-monitor`). Use this hub to coordinate initiatives that span multiple teams.

---

## What Lives Here

- `docs/plans/` – Active program plans and migration trackers (e.g., `doc-migration-tracker.md`, `job-finder-repo-sunset-plan.md`).
- `docs/processes/` – Portfolio-wide processes (branch protocols, PM automation, team context).
- `docs/architecture/` – Shared architecture summaries that need to be available to every team (e.g., `structured-logging-overview.md`).
- `docs/archive/` – Completed milestones retained for historical reference.

All service-specific runbooks, incident reports, and specs have been migrated into their owning repositories.

---

## Quick Start

- Review `docs/plans/doc-migration-tracker.md` to see remaining migration tasks.
- Read `docs/plans/project-task-list.md` for the authoritative backlog.
- Check `docs/processes/NEW_WORKFLOW_SUMMARY.md` to understand the issue-based workflow across repos.
- Use `docs/processes/project-management/system-summary.md` for an overview of current PM tooling.

---

## Contributing

- Follow service-specific contributing guides when working inside code repositories.
- For cross-repo process adjustments, open PRs here and coordinate with the PM.
- Reference `CONTRIBUTING.md` for a pointer to the correct repository workflows.

---

## Related Repositories

- `job-finder-BE` – Backend (Firebase Cloud Functions) + security runbooks.
- `job-finder-FE` – Frontend (React) docs and operational guides.
- `job-finder-worker` – Queue worker documentation and operations runbooks.
- `job-finder-shared-types` – Shared type definitions, schema references.
- `app-monitor` – Observability tooling and runbooks.

---

_Last updated: 2025-10-29_
