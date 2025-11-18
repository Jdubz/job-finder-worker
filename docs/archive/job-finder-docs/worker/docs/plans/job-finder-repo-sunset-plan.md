# Job Finder Repo Decommission & Documentation Migration Plan

**Date:** 2025-10-28  
**Prepared by:** Codex (draft – assign ownership on kickoff)  
**Objective:** Retire the legacy `job-finder-app-manager` repository, upstream the `app-monitor` application as a fully standalone project, and redistribute all documentation into the active service repositories while preserving a single set of shared architecture plans.

---

## 1. Guiding Principles
- **Single Source of Truth:** Every document lives exactly once, in the repository it describes. Cross-repo architecture docs are synced automatically.
- **Read Before You Move/Delete:** Each doc must be reviewed in full, validated for accuracy, and updated or archived accordingly before relocation.
- **Keep Only Strategic Plans Here:** Once work completes, the renamed `job-finder` repo should contain only high-level program plans and coordination notes.
- **Incremental, Observable Changes:** Execute in discrete PRs per workstream; verify invariants (builds, lint, docs) after each move.

---

## 2. Current-State Snapshot (2025-10-28)
- **Directories:** root tooling (`dev-bots/`, `dev-monitor/`, `logs/`, `scripts/`, `Makefile`, etc.), managed service repos (`job-finder-FE`, `job-finder-BE`, `job-finder-worker`, `job-finder-shared-types`, `app-monitor`), and extensive Markdown catalogs in root and `docs/`.
- **Planning/Context Files:** `PROJECT_TASK_LIST.md`, `CLAUDE_*`, multiple phased summaries, and logging/scripting plans focused on dev-monitor → app-monitor abstraction.
- **Docs Inventory Examples:**  
  - `docs/architecture/*`, `docs/operations/README.md`, `docs/processes/*`, `docs/issues/*`, migration runbooks, PM checklists.  
  - `app-monitor/docs/*` (architecture, migration guide, dev-bots).  
  - Root-level postmortems, task logs, Firebase migration notes, etc.
- **Known Couplings:** `app-monitor/backend` still reads logs from `../../../../logs`, Makefiles reference relative paths into `job-finder-app-manager`, shared-type imports via local workspace links.

---

## 3. Workstreams & Deliverables

### A. Repository Restructure & Infrastructure Removal
**Goal:** Convert `job-finder-app-manager` into `job-finder` without legacy orchestration baggage.

Key Tasks:
1. **Change Freeze & Branching**
   - Announce freeze, branch `sunset/job-finder-app-manager` for archival.
2. **Audit & Remove Legacy Tooling**
   - Identify git-specific assets: `.git`, `.github/`, `WORKTREE_SETUP.md`, `dev-bots/`, `dev-monitor/`, root Makefile/scripts.
   - Plan replacement entry points that now live inside each service repo.
3. **Move `app-monitor` to `/home/jdubz/Development/app-monitor`**
   - Update symlinks, relative imports, env configs, log paths.  
   - Introduce `.env`/config override to point to new log directory once relocation completes.
4. **Rename Repo Directory**
   - Rename folder to `job-finder/` (update workspace configs, package.json `name`, README references, local tooling scripts).
   - Verify all internal paths (e.g., shared-types linking, npm workspace root) still resolve.
5. **Delete Git Tracking**
   - Remove `.git` metadata once archived; ensure each child repo maintains its own git history.
6. **Verification**
   - Run smoke scripts for FE, BE, worker from their native repos.  
   - Confirm `app-monitor` Makefile targets run from new location.

### B. Documentation Audit, Migration, and Cleanup
**Goal:** Resettle every document into the repo that owns the subject matter, updating for accuracy and deleting stale completions.

Process (repeat per doc):
1. **Read & Annotate**
   - Capture key facts, decisions, outstanding TODOs.
   - Flag inaccuracies or outdated references while reading.
2. **Determine Destination**
   - **app-monitor**: dev-monitor/app-monitor architecture, logging pipeline, scripting consolidation (`LOGGING_ARCHITECTURE.md`, `DEV_SCRIPTING_REFACTOR_PLAN.md`, etc.).
   - **job-finder-FE**: frontend build/deploy, FE workflow analysis, FE issue docs.
   - **job-finder-BE**: Firestore migrations, backend deployment, API contract docs.
   - **job-finder-worker**: worker CICD, workflow analysis, queue tasks.
   - **job-finder-shared-types**: schema/type references, contracts consumed by multiple services.
   - **job-finder (new root)**: Only strategic program plans, active cross-team coordination, finalized architecture overview indexes.
3. **Update/Rewrite as Needed**
   - Modernize instructions (paths, commands) to reflect new repo layout.  
   - Split multi-repo docs into sections, moving each piece to its owner repo.
4. **Migrate**
   - Create/align target repo `docs/` structure (architecture, development, ops, processes, etc.).  
   - Use commits within each repo to add updated docs.  
   - Ensure navigation indexes (`docs/INDEX.md`, READMEs) reflect new file locations.
5. **Delete Redundant or Completed Artifacts**
   - Remove sprint boards (`ACTIVE_TASKS.md`, `COMPLETED.md`), per instructions.  
   - Preserve historical context via git history only after verifying knowledge captured elsewhere.
6. **Validation**
   - Run doc lint/checkers (Markdown lint, link check).  
   - Spot-check cross-references (links across repos) post-move.

Supporting Actions:
- Build a spreadsheet or issue tracker enumerating every Markdown file with source → destination → status.
- Schedule review sessions with FE/BE/Worker leads to confirm placement and updates.

### C. Cross-Repo Architecture Documentation Sync
**Goal:** Maintain shared architecture docs editable from any repo with deterministic propagation.

Proposed Solution:
1. **Create `job-finder-architecture-docs` Repository**
   - Contains `/architecture`, `/system-overview`, and `/runbooks` directories with shared content.
   - Use consistent front-matter for ownership metadata.
2. **Integrate via Git Subtree**
   - Add subtree at `docs/shared-architecture/` in each repo (`git subtree add --prefix docs/shared-architecture git@... job-finder-architecture-docs main`).  
   - Document pull/push workflows (`docs/shared-architecture/CONTRIBUTING.md`).
3. **Automation**
   - Add `scripts/sync-shared-docs.sh` (wrapper around `git subtree pull/push`).  
   - Set up GitHub Action in each repo to fail CI if shared docs drift (`git diff --exit-code docs/shared-architecture` after sync).
4. **Editing Workflow**
   - Contributors edit within local repo → run sync script → PR includes subtree update.  
   - Alternatively, edit central repo directly, then downstream repos run pull script.
5. **Access & Visibility**
   - Update each repo’s docs README to reference shared architecture bundle.  
   - Add global navigation index inside shared repo.

Alternate Considerations (evaluate during implementation):
- If subtree overhead proves heavy, evaluate `nx graph` style docs pipeline or `rsync`-based `Makefile` sync triggered via CI bots.

---

## 4. Phased Timeline (Draft)
1. **Preparation (Oct 29–30, 2025)**
   - Confirm stakeholders, freeze window, set up tracking spreadsheet, bootstrap shared docs repo.
2. **Phase 1 – Infrastructure Changes (Oct 31–Nov 4)**
   - Move `app-monitor`, adjust configs, rename repo, remove legacy tooling.
3. **Phase 2 – Documentation Audit & Migration (Nov 5–Nov 15)**
   - Sequential passes: architecture, operations/process docs, issue/task logs.  
   - Parallel PRs to target repos with review sign-off from owners.
4. **Phase 3 – Shared Doc Sync Implementation (Nov 6–Nov 12 overlap)**
   - Stand up shared repo, integrate subtrees, finalize automation.
5. **Phase 4 – Final Cleanup & Sign-off (Nov 18)**
   - Validate docs indexes, run link checks, archive sunset branch, update onboarding docs.

Dates assume dedicated focus; adjust after stakeholder confirmation.

---

## 5. Risks & Mitigations
- **Path Breakage After Move:** Update configs/tests immediately; run end-to-end smoke per repo.  
- **Documentation Drift During Migration:** Enforce migration tracker and daily standups; freeze new doc creation until mapping complete.  
- **Subtree Workflow Complexity:** Provide step-by-step runbook and short screencast; consider training session.  
- **Accidental Loss of Active Info:** Require reviewer confirmation that knowledge exists in new location before deleting source doc.

---

## 6. Open Questions
1. Confirm whether any automation still depends on root Makefile or `scripts/` (e.g., CI triggers).
2. Decide ultimate home for PM configuration (`PM_CONFIG.yaml`)—does it stay in new `job-finder` planning repo or move to tooling service?
3. Verify if shared architecture repo should include diagrams/assets (and where to host binaries).
4. Determine archival strategy for large log files and historical session summaries (git tag vs external storage).

---

## 7. Immediate Next Actions
- [ ] Assign owners for each workstream (recommend FE, BE, Worker, Platform leads).  
- [ ] Stand up migration tracker (sheet or Notion) listing every Markdown file and status.  
- [ ] Kick off prep meeting to validate timeline and open questions.  
- [ ] Start drafting shared architecture repo structure + automation prototypes.

---

_This plan should be versioned and updated as decisions are made. Track revisions directly in `docs/plans/` and link to execution issues/PRs once created._

