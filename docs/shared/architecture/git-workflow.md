# Git Workflow and Branch Strategy

> Status: Active
> Owner: @jdubz
> Last Updated: 2025-12-09

## Overview

This document defines the branch protocols and git workflow for the job-finder-bot repository. These protocols ensure consistency, prevent conflicts, and maintain a clean git history.

## Core Principle

**Stay on your designated branch. Each repository has a working branch for development.**

## Repository Branch Protocol

### job-finder-bot

**Working Branch:** `bot`
**Protocol:** Direct commit and push for active development

```bash
cd /home/jdubz/Development/job-finder-bot
# Always on bot branch
git add .
git commit -m "feat: your changes"
git push origin bot
```

**Rules:**

- Commit directly to `bot` for development work
- Push to `bot` branch regularly
- Create PR from bot → main when ready for production
- Never work directly on main branch
- Never create unnecessary feature branches for small changes

## Branch Strategy

### Production (`main`)

- Protected branch
- Stable, production-ready code
- Only updated via PR from `bot` branch
- Requires review before merge

### Development (`bot`)

- Active development branch
- Integration point for all features
- Direct commits allowed
- Push frequently to share progress

### Feature Branches (Optional)

Use short-lived feature branches for:

- Large features spanning multiple days
- Experimental work requiring isolation
- Collaborative features with multiple developers

**Feature branch workflow:**

```bash
# Create feature branch from bot
git checkout bot
git pull origin bot
git checkout -b feature/my-feature

# Work on feature
git add .
git commit -m "feat(scope): implement feature"
git push origin feature/my-feature

# Create PR to bot branch
# After merge, delete feature branch
git checkout bot
git branch -d feature/my-feature
```

## Commit Standards

### Semantic Commit Format

All commits must follow semantic commit structure:

```
<type>(<scope>): <short description>

<detailed description>

Closes #<issue-number>
```

### Commit Types

- `feat:` - New feature or functionality
- `fix:` - Bug fix
- `refactor:` - Code refactoring (no behavior change)
- `perf:` - Performance improvement
- `test:` - Adding or updating tests
- `docs:` - Documentation changes
- `chore:` - Maintenance (dependencies, config)
- `style:` - Code style (formatting only)
- `ci:` - CI/CD changes

### Commit Scopes

Use descriptive scopes relevant to the change:

- `(scraper)` - Web scraping functionality
- `(parser)` - Content parsing
- `(storage)` - Data storage operations
- `(config)` - Configuration changes
- `(cli)` - Command-line interface
- `(api)` - API integration
- `(tests)` - Test infrastructure

## Workflow Examples

### Example 1: Adding a Feature

```bash
cd /home/jdubz/Development/job-finder-bot

# Ensure on bot branch
git checkout bot
git pull origin bot

# Make changes
# ... edit files ...

# Commit and push
git add .
git commit -m "feat(scraper): add LinkedIn job scraper"
git push origin bot
```

### Example 2: Bug Fix

```bash
cd /home/jdubz/Development/job-finder-bot

# Pull latest
git pull origin bot

# Fix bug
# ... edit files ...

# Commit and push
git add .
git commit -m "fix(parser): handle malformed job descriptions"
git push origin bot
```

### Example 3: Production Release

```bash
# Create PR from bot to main
# Review changes
# Merge via GitHub PR interface
# Tag release
git checkout main
git pull origin main
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0
```

## Troubleshooting

### Accidentally on Wrong Branch

```bash
# Return to bot branch
git checkout bot

# If you had uncommitted changes
git stash
git checkout bot
git stash pop
```

### Merge Conflicts

```bash
# Pull latest changes
git pull origin bot

# If conflicts occur
# 1. Open conflicted files
# 2. Resolve conflicts manually
# 3. Mark as resolved
git add .
git commit -m "fix: resolve merge conflicts"
git push origin bot
```

### Resetting Local Changes

```bash
# Discard all local changes
git reset --hard origin/bot

# Discard specific file
git checkout -- path/to/file
```

## Best Practices

- **Commit frequently** - Small, atomic commits are easier to review
- **Pull before push** - Avoid conflicts by staying up to date
- **Write descriptive messages** - Explain what and why, not how
- **Reference issues** - Include issue numbers in commit messages
- **Test before commit** - Ensure code works before committing
- **Keep history clean** - Avoid unnecessary merge commits

## Quick Reference

```
Repository: job-finder-bot
Working Branch: bot
Production Branch: main

Standard Workflow:
1. git pull origin bot
2. Make changes
3. git add .
4. git commit -m "type(scope): description"
5. git push origin bot

Production Release:
1. Create PR: bot → main
2. Review and test
3. Merge PR
4. Tag release
```

## Summary

| Aspect | Configuration |
| --- | --- |
| Working Branch | `bot` |
| Production Branch | `main` |
| Commit Directly | Yes (to bot) |
| Feature Branches | Optional (for large features) |
| Commit Format | Semantic commits required |
| PR Process | bot → main for production |

Stay on the `bot` branch for development, commit frequently, and create PRs to `main` for production releases.
