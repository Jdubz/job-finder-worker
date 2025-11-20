# Simplified Workflow - Issue-Based Task Tracking

## Overview

We use a simple, markdown-based workflow with GitHub issues in the manager repo for task tracking. No GitHub Projects, no complex automation - just clear documentation and issue tracking.

**📖 IMPORTANT:** See [BRANCH_PROTOCOLS.md](./BRANCH_PROTOCOLS.md) for detailed branch and git workflow rules.

## Task Management

### Creating Tasks

**PM creates issues in `job-finder-app-manager` repository:**

1. Create a new issue with clear title
2. Add detailed description with acceptance criteria
3. Label with: `worker-a`, `worker-b`, or `pm`
4. Label with priority: `priority-p0`, `priority-p1`, `priority-p2`, `priority-p3`
5. Label with repository: `repo-backend`, `repo-frontend`, `repo-shared`, `repo-be`
6. Assign to yourself (PM) for tracking

### Task Documentation

**PM maintains markdown files in manager repo:**

- `PROJECT_TASK_LIST.md` - PM master backlog and prioritization decisions
- `CLAUDE_WORKER_A.md` - Worker A's actionable queue (kept in sync by Worker A)
- `CLAUDE_WORKER_B.md` - Worker B's actionable queue (kept in sync by Worker B)
- `BACKLOG.md` - Idea parking lot (not an active task board)
- `COMPLETED.md` - Archive of completed tasks

## Worker Workflow

### Worker A (Queue Worker Specialist)

**Primary Responsibilities:**

- Queue worker (job-finder/job-finder-worker)
- Backend API functions (job-finder-BE)
- E2E testing for scraping logic

**Workflow:**

1. **Check assigned issues** in job-finder-app-manager
2. **Navigate to repository**:
   ```bash
   cd /home/jdubz/Development/job-finder-app-manager/job-finder-worker
   ```
3. **Ensure on staging and sync**:
   ```bash
   git pull origin staging  # Always on staging, never switch branches
   ```
4. **Implement the feature**
5. **Commit changes** with clear messages:
   ```bash
   git add .
   git commit -m "feat: your feature description"
   ```
6. **Push to staging**:
   ```bash
   git push origin staging
   ```
7. **Comment on issue** in manager repo with commit link
8. **PM reviews directly on staging**

**⚠️ NEVER:**

- Create feature branches
- Switch branches
- Change remotes
- For large features, use worktrees (see [BRANCH_PROTOCOLS.md](./BRANCH_PROTOCOLS.md))

### Worker B (Frontend + Cloud Functions Specialist)

**Primary Responsibilities:**

- Frontend (job-finder-FE)
- Cloud Functions migration (job-finder-BE)
- Integration testing

**Workflow:**

1. **Check assigned issues** in job-finder-app-manager
2. **Navigate to repository**:
   ```bash
   cd /home/jdubz/Development/job-finder-app-manager/job-finder-FE
   ```
3. **Ensure on staging and sync**:
   ```bash
   git pull origin staging  # Always on staging, never switch branches
   ```
4. **Implement the feature**
5. **Commit changes** with clear messages:
   ```bash
   git add .
   git commit -m "feat: your feature description"
   ```
6. **Push to staging**:
   ```bash
   git push origin staging
   ```
7. **Comment on issue** in manager repo with commit link
8. **PM reviews directly on staging**

**⚠️ NEVER:**

- Create feature branches
- Switch branches
- Change remotes
- For large features, use worktrees (see [BRANCH_PROTOCOLS.md](./BRANCH_PROTOCOLS.md))

## PM Workflow

### Task Assignment

1. **Create issue** in job-finder-app-manager
2. **Add detailed requirements** and acceptance criteria
3. **Label appropriately** (worker, priority, repository)
4. **Update `PROJECT_TASK_LIST.md`** with owner, priority, and issue link
5. **Notify worker / ensure their CLAUDE file reflects the task** (they maintain the checklist)

### Code Review

1. **Worker comments on issue** with PR link
2. **PM reviews PR** in development repo
3. **PM provides feedback** or approves
4. **PM merges to staging** when ready
5. **PM closes issue** in manager repo
6. **PM updates `PROJECT_TASK_LIST.md`, the relevant worker file, and `COMPLETED.md`**

### Documentation Updates

PM commits directly to `main` branch in manager repo:

```bash
cd /home/jdubz/Development/job-finder-app-manager
git checkout main
# Update documentation
git add .
git commit -m "Update task tracking"
git push origin main
```

## Repository Branch Protocols

### Manager Repo (job-finder-app-manager)

- **Branch**: `staging` (all workers commit here)
- **Purpose**: Documentation, task tracking, coordination, dev scripts
- **Workflow**: Commit directly to staging, no PRs needed

### Development Repos (job-finder-worker, job-finder-FE, job-finder-BE)

- **Branch**: `staging` (ONLY branch - never switch)
- **Workflow**: Commit directly to staging, push immediately
- **Large Features**: Use worktrees, not feature branches
- **PR Flow**: PM creates staging → main PR when ready for production
- **⚠️ NEVER**: Create feature branches, switch branches, or change remotes

### Shared Types Repo (job-finder-shared-types)

- **Branch**: `main` (ONLY branch - never switch)
- **Workflow**: Test locally, commit, push directly to main
- **Reason**: Types are foundational and must be immediately available
- **⚠️ NEVER**: Use staging branch, create feature branches, or switch branches

**📖 See [BRANCH_PROTOCOLS.md](./BRANCH_PROTOCOLS.md) for complete details and worktree usage.**

## Repository Structure

```
/home/jdubz/Development/job-finder-app-manager/
├── [Main directory - PM works here]
├── docs/                          # Documentation
├── PROJECT_TASK_LIST.md           # PM master backlog (single source)
├── CLAUDE_WORKER_A.md             # Worker A actionable queue
├── CLAUDE_WORKER_B.md             # Worker B actionable queue
├── BACKLOG.md                     # Idea parking lot / future considerations
├── COMPLETED.md                   # Completed tasks archive
├── PRIORITIZED_TASKS.md           # Retired board (historical reference)
├── job-finder-worker/             # Python queue worker repo
├── job-finder-FE/                 # React frontend + Cloud Functions repo
├── job-finder-BE/                 # Backend API Cloud Functions repo
└── job-finder-shared-types/       # Shared TypeScript types repo
```

## Task Status Tracking

### PROJECT_TASK_LIST.md Guidance

- Capture every scoped task with owner, priority, repository, and blocking dependencies.
- Highlight the current P0 items at the top so the team sees what ships next.
- When a task finishes (merged to `main`), mark it complete here and note the completion date.

### Worker Files (CLAUDE_WORKER_A.md / CLAUDE_WORKER_B.md)

- Each worker mirrors the PM's decisions into their file but can break work into smaller checklists.
- Workers update their file whenever they start, make progress on, or complete a task.
- The PM reviews these files to confirm alignment before reprioritizing.

### Archived Boards

- `ACTIVE_TASKS.md` and `PRIORITIZED_TASKS.md` remain in the repo for historical context only. Do not resurrect them; they are intentionally frozen.

### Issue Labels

- **Workers**: `worker-a`, `worker-b`, `pm` (for assignment/ownership tracking)
- **Priority**: `priority-p0`, `priority-p1`, `priority-p2`, `priority-p3`
- **Repository**: `repo-backend`, `repo-frontend`, `repo-shared`, `repo-be`
- **Type**: `task`, `bug`, `enhancement`, `documentation`
- **Status**: `in-progress`, `blocked`, `review-needed`

## Communication

### Issue Comments

Workers and PM use issue comments for:

- Status updates
- Questions and clarifications
- PR links
- Blocker notifications

### Documentation Updates

PM keeps documentation current:

- Update `PROJECT_TASK_LIST.md` when status or priority changes
- Ensure completed items land in `COMPLETED.md`
- Capture new ideas or unscheduled concepts in `BACKLOG.md`
- Mirror decisions into the relevant worker CLAUDE file (workers keep detailed checklists current)

## Benefits of This Approach

### Simple

- No complex GitHub Projects setup
- Just issues and markdown files
- Easy to understand and maintain

### Flexible

- PM can easily reprioritize tasks
- Easy to add notes and context
- Simple to track status

### Clear

- Workers know exactly where to work (worktrees)
- Clear PR flow (worker branch → staging)
- Single source of truth (manager repo issues)

### Maintainable

- All documentation in one place
- Easy to search and reference
- Git history tracks all changes

## Example Workflow

### PM Creates Task

1. Create issue #130 in manager repo
2. Title: "Implement job queue retry logic"
3. Body: Detailed requirements and acceptance criteria
4. Labels: `worker-a`, `priority-p1`, `repo-backend`, `task`
5. Record assignment in `PROJECT_TASK_LIST.md` and ensure Worker A's file reflects it

### Worker A Implements

1. Check issue #130 in manager repo
2. `cd /home/jdubz/Development/job-finder-app-manager/job-finder-worker`
3. `git pull origin staging` (always on staging, never switch)
4. Implement feature
5. `git add .`
6. `git commit -m "feat(queue): implement retry logic for #130"`
7. `git push origin staging`
8. Comment on issue #130 with commit SHA

### PM Reviews

1. Review commits directly on staging branch
2. Test on staging environment
3. Provide feedback via issue comments
4. When ready for production, create staging → main PR
5. Close issue #130
6. Update `PROJECT_TASK_LIST.md` and Worker A's file
7. Add to `COMPLETED.md`

This workflow is simple, clear, and maintainable!
