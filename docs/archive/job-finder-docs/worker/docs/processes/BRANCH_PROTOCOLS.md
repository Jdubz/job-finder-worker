# Branch Protocols and Git Workflow

**Last Updated:** 2025-10-21  
**Status:** Active Policy

## Overview

This document defines the strict branch protocols for all repositories in the job-finder ecosystem. These protocols ensure consistency, prevent conflicts, and maintain a clean git history.

## Core Principle

**⚠️ CRITICAL: Never change the branch or remote of any job-finder directory. Each repository has a designated working branch. Stick to it.**

## Repository Branch Protocols

### job-finder-shared-types

**Working Branch:** `main`  
**Protocol:** Direct commit and push

```bash
cd /home/jdubz/Development/job-finder-app-manager/job-finder-shared-types
# Always on main branch
git add .
git commit -m "feat: your changes"
git push origin main
```

**Rationale:**

- Shared types are foundational to all projects
- Changes must be coordinated and immediately available
- No PR workflow needed - test locally before pushing
- Small, atomic changes only

**Rules:**

- ✅ Commit directly to `main`
- ✅ Push immediately after committing
- ✅ Test locally before pushing
- ❌ Never create feature branches
- ❌ Never use staging branch

---

### job-finder-worker

**Working Branch:** `staging`  
**Protocol:** Commit and push to staging

```bash
cd /home/jdubz/Development/job-finder-app-manager/job-finder-worker
# Always on staging branch
git add .
git commit -m "feat: your changes"
git push origin staging
```

**Rationale:**

- Staging branch is the integration point
- All development happens on staging
- PM controls staging → main promotion
- Clean, linear history

**Rules:**

- ✅ Commit directly to `staging`
- ✅ Push to `staging` branch
- ✅ Create PR from staging → main only when ready for production
- ❌ Never create feature branches
- ❌ Never work on main branch
- ❌ Never switch branches

---

### job-finder-FE

**Working Branch:** `staging`  
**Protocol:** Commit and push to staging

```bash
cd /home/jdubz/Development/job-finder-app-manager/job-finder-FE
# Always on staging branch
git add .
git commit -m "feat: your changes"
git push origin staging
```

**Rationale:**

- Same as job-finder-worker
- Consistent workflow across all dev repos
- Staging is the integration branch

**Rules:**

- ✅ Commit directly to `staging`
- ✅ Push to `staging` branch
- ✅ Create PR from staging → main only when ready for production
- ❌ Never create feature branches
- ❌ Never work on main branch
- ❌ Never switch branches

---

### job-finder-BE

**Working Branch:** `staging`  
**Protocol:** Commit and push to staging

```bash
cd /home/jdubz/Development/job-finder-app-manager/job-finder-BE
# Always on staging branch
git add .
git commit -m "feat: your changes"
git push origin staging
```

**Rationale:**

- Same as other development repositories
- Cloud Functions development on staging
- PM controls production deployments

**Rules:**

- ✅ Commit directly to `staging`
- ✅ Push to `staging` branch
- ✅ Create PR from staging → main only when ready for production
- ❌ Never create feature branches
- ❌ Never work on main branch
- ❌ Never switch branches

---

### job-finder-app-manager

**Working Branch:** `staging`  
**Protocol:** Commit and push to staging

```bash
cd /home/jdubz/Development/job-finder-app-manager
# Always on main for docs, staging for code
git add .
git commit -m "docs: your changes"
git push origin main  # or staging for code changes
```

**Rationale:**

- Manager repo coordinates all projects
- Documentation lives on main
- Development scripts on staging

**Rules:**

- ✅ Commit documentation to `main`
- ✅ Commit dev scripts to `staging`
- ✅ Push immediately after committing
- ❌ Never create feature branches
- ❌ Never mix doc and code changes

---

## Feature Branches: DO NOT USE

### Why No Feature Branches?

**Feature branches create problems:**

1. **Context Switching:** Switching branches loses local state
2. **Merge Conflicts:** More branches = more conflicts
3. **Complexity:** Adds cognitive overhead
4. **Stale Branches:** Feature branches get forgotten
5. **Lost Work:** Easy to lose uncommitted changes when switching

### What About Large Features?

For large bodies of work that span multiple days or weeks, use **worktrees** instead of feature branches.

---

## Worktrees for Large Features

### When to Use Worktrees

Use worktrees when you need to:

- Work on multiple large features simultaneously
- Test different approaches side-by-side
- Preserve working state across context switches
- Review PRs while keeping your work intact

### How to Use Worktrees

**Create a worktree:**

```bash
# From the main repository directory
cd /home/jdubz/Development/job-finder-app-manager/job-finder-worker

# Create a worktree for a large feature
git worktree add ../job-finder-worker-feature1 staging

# Now you have:
# - /home/jdubz/Development/job-finder-app-manager/job-finder-worker (main working copy on staging)
# - /home/jdubz/Development/job-finder-app-manager/job-finder-worker-feature1 (also on staging)
```

**Work in the worktree:**

```bash
cd /home/jdubz/Development/job-finder-app-manager/job-finder-worker-feature1

# Make your changes
git add .
git commit -m "feat: large feature work"
git push origin staging
```

**Remove worktree when done:**

```bash
cd /home/jdubz/Development/job-finder-app-manager/job-finder-worker
git worktree remove ../job-finder-worker-feature1
```

### Worktree Best Practices

✅ **Do:**

- Create worktrees from staging branch
- Name worktrees descriptively: `job-finder-worker-oauth`, `job-finder-FE-dashboard`
- Remove worktrees when feature is complete
- Keep worktrees in the parent directory alongside main repo

❌ **Don't:**

- Create worktrees from feature branches (we don't use feature branches!)
- Let worktrees accumulate indefinitely
- Mix worktree workflows with branch switching
- Create nested worktrees

---

## The Golden Rule

### NEVER Change Branches or Remotes

**❌ DO NOT DO THIS:**

```bash
cd /home/jdubz/Development/job-finder-app-manager/job-finder-worker
git checkout -b feature/new-thing  # ❌ NO!
git checkout main                   # ❌ NO!
git remote add fork https://...     # ❌ NO!
```

**✅ INSTEAD DO THIS:**

```bash
cd /home/jdubz/Development/job-finder-app-manager/job-finder-worker
# Stay on staging, just commit your work
git add .
git commit -m "feat: new thing"
git push origin staging

# OR if you need parallel work:
cd /home/jdubz/Development/job-finder-app-manager
git worktree add job-finder-worker-feature staging
cd job-finder-worker-feature
# Work here independently
```

### Why This Rule Exists

1. **Prevents Lost Work:** No more uncommitted changes lost to branch switches
2. **Reduces Confusion:** Always know what branch you're on
3. **Simplifies Workflow:** One branch = one purpose
4. **Prevents Conflicts:** No accidental merges from wrong branches
5. **Maintains Sanity:** Cognitive load stays low

---

## Quick Reference Card

```
┌────────────────────────────────────────────────────────────────┐
│                    BRANCH PROTOCOL QUICK REF                   │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  job-finder-shared-types     →  main     (direct push)        │
│  job-finder-worker           →  staging  (direct push)        │
│  job-finder-FE               →  staging  (direct push)        │
│  job-finder-BE               →  staging  (direct push)        │
│  job-finder-app-manager      →  staging  (direct push)        │
│                                                                │
│  RULES:                                                        │
│  ✅ Commit to designated branch                               │
│  ✅ Push immediately                                          │
│  ✅ Use worktrees for parallel work                           │
│  ❌ Never create feature branches                             │
│  ❌ Never switch branches                                     │
│  ❌ Never change remotes                                      │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## Troubleshooting

### "I accidentally switched branches!"

```bash
# Go back to staging immediately
git checkout staging

# If you had uncommitted changes, they might be lost
# Check if you can recover them:
git stash list
git stash pop  # if there's a stash

# Moving forward: STAY ON STAGING
```

### "I need to work on two things at once!"

```bash
# Use worktrees, not branches
cd /home/jdubz/Development/job-finder-app-manager

# Create a worktree for the second task
git worktree add job-finder-worker-task2 staging

# Now work in parallel:
# Terminal 1: cd job-finder-worker (original)
# Terminal 2: cd job-finder-worker-task2 (worktree)
```

### "Someone told me to create a feature branch!"

```bash
# Don't do it! Politely refer them to this document.
# Our workflow is: staging → staging → staging
# Large features use worktrees, not branches.
```

### "I need to test a PR from someone else!"

```bash
# Use a temporary worktree for PR review
cd /home/jdubz/Development/job-finder-app-manager/job-finder-worker
git fetch origin pull/123/head:pr-123
git worktree add ../job-finder-worker-pr123 pr-123

# Review the PR
cd ../job-finder-worker-pr123
# Test and review...

# When done, remove the worktree
cd /home/jdubz/Development/job-finder-app-manager/job-finder-worker
git worktree remove ../job-finder-worker-pr123
git branch -D pr-123
```

---

## Workflow Examples

### Example 1: Adding a feature to job-finder-worker

```bash
cd /home/jdubz/Development/job-finder-app-manager/job-finder-worker

# Check you're on staging
git branch
# * staging  ← Should see this

# Pull latest
git pull origin staging

# Make changes
# ... edit files ...

# Commit and push
git add .
git commit -m "feat(queue): add retry logic"
git push origin staging

# Done! No branches, no PRs to staging, just push.
```

### Example 2: Large feature spanning multiple days

```bash
cd /home/jdubz/Development/job-finder-app-manager

# Create worktree for large feature
git worktree add job-finder-worker-oauth staging

# Work on large feature
cd job-finder-worker-oauth
# ... make changes over multiple days ...
git add .
git commit -m "feat(auth): add OAuth flow"
git push origin staging

# Meanwhile, you can still use the main directory for quick fixes
cd /home/jdubz/Development/job-finder-app-manager/job-finder-worker
# ... make quick fix ...
git add .
git commit -m "fix(queue): handle edge case"
git push origin staging

# When large feature is done, remove worktree
cd /home/jdubz/Development/job-finder-app-manager/job-finder-worker
git worktree remove ../job-finder-worker-oauth
```

### Example 3: Updating shared types

```bash
cd /home/jdubz/Development/job-finder-app-manager/job-finder-shared-types

# Check you're on main
git branch
# * main  ← Should see this

# Make changes
# ... edit types ...

# Test locally
npm run build
npm test

# Commit and push directly to main
git add .
git commit -m "feat(types): add new queue status"
git push origin main

# Update version and publish
npm version minor
git push --tags
npm publish
```

---

## Summary

| Repository   | Working Branch | Commit Directly | Use Worktrees | Feature Branches |
| ------------ | -------------- | --------------- | ------------- | ---------------- |
| shared-types | `main`         | ✅ Yes          | ✅ Yes        | ❌ Never         |
| worker       | `staging`      | ✅ Yes          | ✅ Yes        | ❌ Never         |
| FE           | `staging`      | ✅ Yes          | ✅ Yes        | ❌ Never         |
| BE           | `staging`      | ✅ Yes          | ✅ Yes        | ❌ Never         |
| app-manager  | `staging`      | ✅ Yes          | ✅ Yes        | ❌ Never         |

**Remember:**

- Stay on your designated branch
- Push your commits to that branch
- Use worktrees for parallel work
- Never create feature branches
- Never switch branches in job-finder directories

This keeps our workflow simple, predictable, and conflict-free. 🎯
