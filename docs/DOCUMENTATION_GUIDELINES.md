> Status: Active
> Owner: @jdubz
> Last Updated: 2025-11-18

# Documentation System

This repository intentionally limits documentation to content that accelerates delivery. Every new doc must fall into one of the categories below, live in the prescribed location, and include the required metadata block.

## Required Metadata

Every Markdown doc must start with:

```markdown
> Status: Draft|Active|Deprecated
> Owner: @github-handle
> Last Updated: YYYY-MM-DD
```

Docs without owners or recent updates will be archived during monthly housekeeping.

## Canonical Doc Types

| Type | Purpose | Location | Required Sections |
| --- | --- | --- | --- |
| **Plan** | Upcoming initiative, migration, or multi-sprint effort. | `docs/plans/` | Problem, Desired Outcome, Work Breakdown, Open Questions. |
| **Runbook** | Step-by-step operational or troubleshooting guide. | Service-specific directory (`docs/backend`, `docs/worker`, etc.) under `runbooks/` or `operations/`. | Trigger, Preconditions, Step-by-step, Verification, Rollback. |
| **Reference** | Long-lived schema or architectural reference. | `docs/shared/` or service-specific `reference/`. | Context, API/Schema, Consumers, Change Process. |
| **Decision Record** | Single choice with alternatives considered. | `docs/decisions/ADR-####.md` (create directory). | Context, Decision, Alternatives, Consequences. |
| **Retro / Postmortem** | Learnings tied to a specific incident or project. | `docs/retros/` (new directory) or service-specific `retros/`. | Summary, Timeline, Root Cause, Follow-ups. |

Anything else (brain dumps, scratchpads, meeting notes) should go to `docs/archive/` with a 30-day expiry or a private scratch space—never the repo.

## Task & Action Tracking

- Outstanding actions must be appended to `docs/tasks/backlog.md`. Each entry captures: `ID`, `Description`, `Owner`, `Target Date`, and `Status`.
- Plans/runbooks can reference backlog IDs instead of embedding TODOs inline. Inline TODOs are prohibited; convert them into backlog entries.

## Folder Expectations

- `docs/` root only contains index files (`README.md`, this guide, templates, backlog).
- Subdirectories mirror services (`backend`, `frontend`, `worker`, `shared`) or doc types (`plans`, `decisions`, `templates`, `tasks`).
- Historical material from prior repos stays under `docs/archive/`. Add a banner at the top flagging it as archived.

## Contribution Workflow

1. Pick the correct template from `docs/templates/`.
2. Create the doc under the required directory and include the metadata block.
3. Link it from the nearest `README.md` index.
4. If new action items emerge, record them in `docs/tasks/backlog.md`.
5. During reviews, reject docs that don’t follow this structure.

## Housekeeping Rules

- Monthly: archive docs with `Status: Deprecated` or `Last Updated` > 90 days unless explicitly renewed.
- When archiving, move files to `docs/archive/YYYY/` and keep a short summary + pointer in the original index so history remains discoverable.

This system keeps the repo small, search-friendly, and action-oriented—anything else belongs in ephemeral tools, not Git.
