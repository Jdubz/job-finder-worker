# New Workflow Summary - Issue-Based Task Tracking

## Overview

We have updated our workflow to use detailed GitHub issues with backing documents instead of assigning specific tasks to workers. This provides more flexibility and allows workers to select issues based on their availability and expertise.

## Key Changes

### 1. Issue Creation Process

- **PM creates detailed GitHub issues** in the appropriate repository (job-finder-BE, job-finder-FE, job-finder-worker, job-finder-shared-types)
- **PM creates backing issue documents** in each repository's `docs/issues/` directory
- **Issues include comprehensive specifications** using the ISSUE_TEMPLATE.md format
- **Issues are labeled appropriately** with priority, type, and status

### 2. Worker Selection Process

- **Workers select issues** based on availability and expertise
- **Workers update issue status** to `in-progress` and assign to themselves
- **Workers comment on issues** indicating they're starting work
- **No pre-assignment** - workers choose from available `ready` status issues

### 3. Issue Management

- **Status Labels**: `ready`, `in-progress`, `blocked`, `review-needed`
- **Priority Labels**: `priority-p0`, `priority-p1`, `priority-p2`, `priority-p3`
- **Type Labels**: `task`, `bug`, `enhancement`, `documentation`
- **Issue Comments**: Used for status updates, questions, and PR links

### 4. Documentation Structure

- **Manager Repository**: `job-finder-app-manager` - PM coordination hub
- **Issue Documents**: Each repository maintains `docs/issues/` directory
- **Backing Documents**: Comprehensive specifications linked to GitHub issues
- **Completed Documents**: Removed when work is finished

## Benefits

### Flexibility

- Workers can select issues based on current capacity and expertise
- PM can prioritize issues without micro-managing assignments
- Easy to adjust workload based on worker availability

### Clarity

- Detailed issue specifications ensure clear requirements
- Backing documents provide comprehensive context
- GitHub issues provide centralized tracking

### Maintainability

- All documentation in appropriate repositories
- Easy to search and reference
- Git history tracks all changes

## Updated Files

### Workflow Documentation

- `docs/processes/WORKFLOW_SIMPLIFIED.md` - Updated main workflow
- `CLAUDE_SHARED.md` - Updated shared context
- `CLAUDE_WORKER_A.md` - Updated Worker A directives
- `CLAUDE_WORKER_B.md` - Updated Worker B directives
- `PROJECT_TASK_LIST.md` - Updated task management approach

### Key Workflow Changes

1. **Removed worker assignment** - workers now select issues
2. **Added issue selection workflow** - clear process for workers
3. **Updated PM responsibilities** - focus on issue creation and guidance
4. **Simplified task tracking** - GitHub issues as single source of truth

## Next Steps

1. **PM creates issues** for all pending tasks in appropriate repositories
2. **Workers review available issues** and select based on expertise
3. **PM provides guidance** on issue selection and prioritization
4. **Monitor issue status** and provide support as needed

This new workflow provides better flexibility while maintaining clear accountability and comprehensive task specifications.
