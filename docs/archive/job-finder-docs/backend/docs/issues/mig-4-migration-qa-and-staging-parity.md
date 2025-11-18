# MIG-4 — Migration QA & Staging Parity

- **Status**: On Hold
- **Owner**: Project Manager (coordinate Workers A & B)
- **Priority**: P1 (High Impact)
- **Labels**: priority-p1, repository-pm, type-coordination, status-todo

## What This Issue Covers

Coordinate an end-to-end readiness review across all repos to confirm staging matches production before cutover. Deliverables must be documented in the top-level `job-finder-app-manager` workspace so stakeholders can review without browsing individual repos.

## Tasks

1. **Build the Parity Checklist**
   - Create `docs/migration/staging-parity-checklist.md` containing sections for frontend, backend, worker, shared types, and infrastructure. Each section should list configuration items (Firebase project IDs, env files, DNS records, secrets) and link to the repo-specific issue files updated earlier.
   - Populate the checklist with current state using information available in each repo’s docs/issues folder. Note any unknowns as “TBD” with an assigned owner.
2. **Coordinate Verification Runs**
   - _Paused_: No parity session or asynchronous gathering is scheduled. Document current readiness constraints and await new direction before collecting smoke-test evidence.
3. **Gap Tracking**
   - For each failed checklist item or test, open/confirm an issue in the appropriate repo and record the link in the checklist plus in a table within this issue (`Gap`, `Repo`, `Issue Link`, `Owner`, `ETA`).
   - Ensure blockers are reflected in `PROJECT_TASK_LIST.md` with clear status updates.
4. **Stakeholder Reporting**
   - Draft a concise readiness report `docs/migration/staging-parity-report.md` summarizing:
     - Completed checks
     - Outstanding gaps
     - Recommended next steps
   - Share the report link in company Slack/email (note recipients + date in this issue under “Communications Log”).
5. **Sign-off Collection**
   - Add a “Sign-off” section to this issue capturing approvals from Worker A, Worker B, and PM (include date/time). Approvals can be issue comments or checkboxes referencing meeting notes.

## Acceptance Criteria

- [ ] `docs/migration/staging-parity-checklist.md` populated with current state and links to repo issues.
- [ ] Verification evidence recorded in this issue (log URLs, screenshot references) covering frontend, backend, worker smoke tests.
- [ ] Gap table filled with issue links and assigned owners.
- [ ] Readiness report (`docs/migration/staging-parity-report.md`) published and communications log updated.
- [ ] Sign-off section completed with explicit approvals.

## Current Status (2025-10-20)

- Parity checklist drafted at `docs/migration/staging-parity-checklist.md` with initial blockers noted.
- Verification activities are on hold; no live or asynchronous parity gathering planned as of 2025-10-20.
- Readiness report initiated (`docs/migration/staging-parity-report.md`) with outstanding gaps captured.
- Firebase deploy IAM binding + GitHub secrets provisioned 2025-10-20, clearing FE-RECOVERY-4 blocker ahead of parity work.

## Verification Evidence

| Area     | Test  | Timestamp (UTC) | Result | Evidence | Follow-up |
| -------- | ----- | --------------- | ------ | -------- | --------- |
| Frontend | _TBD_ | —               | —      | —        | —         |
| Backend  | _TBD_ | —               | —      | —        | —         |
| Worker   | _TBD_ | —               | —      | —        | —         |

## Gap Tracking Table

| Gap                                                       | Repo              | Issue Link    | Owner               | ETA        |
| --------------------------------------------------------- | ----------------- | ------------- | ------------------- | ---------- |
| ✅ GitHub environments + secrets provisioned (2025-10-20) | job-finder-FE     | FE-RECOVERY-4 | PM / Worker A       | —          |
| Repair backend CI pipeline                                | job-finder-BE     | BE-CICD-1     | Worker B            | 2025-10-24 |
| Execute queue smoke + data integrity test                 | job-finder-worker | DATA-QA-1     | Worker A            | 2025-10-24 |
| Auth role validation (FE/BE)                              | cross-repo        | SEC-AUTH-1    | Worker A & Worker B | 2025-10-27 |

## Communications Log

| Date       | Audience            | Message                                                                                     | Follow-up                                              |
| ---------- | ------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 2025-10-20 | Worker A & Worker B | Shared parity checklist and report; noted parity verification on hold pending new guidance. | Monitor for updated directive before scheduling tests. |

## Sign-off Checklist

- [ ] Worker A — Backend validation complete (Date/Time: \_\_\_\_)
- [ ] Worker B — Frontend validation complete (Date/Time: \_\_\_\_)
- [ ] PM — Parity evidence reviewed & approved (Date/Time: \_\_\_\_)

## Useful Files

- `PRODUCTION_CUTOVER_CHECKLIST.md`
- `PROJECT_TASK_LIST.md`
- `docs/migration/`
- Repo-specific issue docs under `job-finder-*/docs/issues/`
