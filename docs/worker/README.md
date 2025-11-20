# Worker Documentation Hub

> Status: Active  
> Owner: @jdubz  
> Last Updated: 2025-11-18

Worker-specific docs are now organized by intent:

| Directory | Purpose |
| --- | --- |
| [`reference/`](./reference) | Architecture notes, schema descriptors, long-lived references. |
| [`runbooks/`](./runbooks) | Operational guides, troubleshooting steps, repeatable procedures. |
| [`retro/`](./retro) | Postmortems and historical retrospectives (create as needed). |

Legacy documentation imported from the standalone worker repo has been archived under [`docs/archive/job-finder-docs/worker-legacy`](../archive/job-finder-docs/worker-legacy). Use it only for historical context; new docs must follow the [documentation guidelines](../DOCUMENTATION_GUIDELINES.md).

## Contribution Notes

- Code-level quickstarts (e.g., `LOCAL_DEVELOPMENT.md`) still live inside `job-finder-worker/`.
- New RFCs should reference backlog IDs in [`docs/tasks/backlog.md`](../tasks/backlog.md).
