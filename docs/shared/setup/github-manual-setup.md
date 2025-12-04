# Manual GitHub Project Setup

> Status: Active
> Owner: @jdubz
> Last Updated: 2025-11-25

## Overview

This guide provides step-by-step instructions for manually configuring GitHub Projects, labels, and automation for the job-finder-bot repository.

## Step 1: Create GitHub Project

1. Navigate to GitHub.com and sign in
2. Click your profile picture (top right)
3. Select "Your projects" from dropdown
4. Click "New project"
5. Choose "Board" view for Kanban-style workflow
6. Name: `Job Finder Bot`
7. Description: `Project management for job-finder-bot automation`
8. Click "Create project"

## Step 2: Configure Project Columns

Create the following columns in order:

### Column 1: To Do

- Click "Add column"
- Name: `To Do`
- Description: `Backlog and upcoming tasks`
- Preset: None

### Column 2: In Progress

- Click "Add column"
- Name: `In Progress`
- Description: `Active development work`
- Preset: None

### Column 3: Review

- Click "Add column"
- Name: `Review`
- Description: `Code review and testing`
- Preset: None

### Column 4: Done

- Click "Add column"
- Name: `Done`
- Description: `Completed work`
- Preset: Automatically move closed items

## Step 3: Create Labels

Navigate to repository Settings → Labels, then create:

### Priority Labels

| Label | Color | Description |
| --- | --- | --- |
| `priority-p0` | #d73a4a (Red) | Critical priority |
| `priority-p1` | #ff6b35 (Orange) | High priority |
| `priority-p2` | #fbca04 (Yellow) | Medium priority |
| `priority-p3` | #0e8a16 (Green) | Low priority |

### Type Labels

| Label | Color | Description |
| --- | --- | --- |
| `bug` | #d73a4a (Red) | Bug or defect |
| `enhancement` | #0075ca (Blue) | New feature |
| `task` | #7057ff (Purple) | General task |
| `documentation` | #0075ca (Navy) | Documentation update |

### Status Labels

| Label | Color | Description |
| --- | --- | --- |
| `status-todo` | #d4c5f9 (Light Purple) | Not started |
| `status-in-progress` | #0e8a16 (Green) | In progress |
| `status-review` | #fbca04 (Yellow) | Under review |
| `status-done` | #0e8a16 (Green) | Completed |

### Component Labels

| Label | Color | Description |
| --- | --- | --- |
| `scraper` | #5319e7 (Purple) | Web scraping |
| `parser` | #1d76db (Blue) | Content parsing |
| `storage` | #e99695 (Pink) | Data storage |
| `config` | #bfd4f2 (Light Blue) | Configuration |
| `tests` | #d4c5f9 (Lavender) | Testing |

## Step 4: Create Issue Templates

Create `.github/ISSUE_TEMPLATE/` directory with these files:

### bug_report.md

```markdown
---
name: Bug Report
about: Report a bug or issue
title: '[BUG] '
labels: bug
assignees: ''
---

## Bug Description
Clear description of the bug.

## Steps to Reproduce
1. Step one
2. Step two
3. Step three

## Expected Behavior
What should happen.

## Actual Behavior
What actually happens.

## Environment
- OS:
- Python version:
- Browser (if applicable):

## Additional Context
Screenshots, logs, or other relevant information.
```

### feature_request.md

```markdown
---
name: Feature Request
about: Suggest a new feature
title: '[FEATURE] '
labels: enhancement
assignees: ''
---

## Feature Description
Clear description of the proposed feature.

## Use Case
Why is this feature needed? What problem does it solve?

## Proposed Implementation
How should this work?

## Alternatives Considered
Other approaches you've thought about.

## Additional Context
Any other relevant information.
```

### task.md

```markdown
---
name: Task
about: Create a task
title: '[TASK] '
labels: task
assignees: ''
---

## Task Overview
Brief description of the task.

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Dependencies
Related issues or PRs.

## Estimated Effort
Rough estimate of time required.
```

## Step 5: Create Pull Request Template

Create `.github/PULL_REQUEST_TEMPLATE.md`:

```markdown
## Description
Brief description of changes.

## Related Issues
Closes #

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
Describe testing performed.

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated
- [ ] Tests added/updated
- [ ] All tests passing
- [ ] No new warnings
```

## Step 6: Configure Automation Rules

In Project settings:

### Rule 1: Auto-add New Issues

- **Trigger:** Item opened
- **Action:** Add to project
- **Column:** To Do

### Rule 2: Move to In Progress

- **Trigger:** Label added (`status-in-progress`)
- **Action:** Move to column "In Progress"

### Rule 3: Move to Review

- **Trigger:** Label added (`status-review`)
- **Action:** Move to column "Review"

### Rule 4: Move to Done

- **Trigger:** Item closed
- **Action:** Move to column "Done"

## Step 7: Configure Notifications

In Project settings → Notifications:

- Enable: Items added to project
- Enable: Items moved between columns
- Enable: Items completed

## Step 8: Create Initial Issues

Create several starter issues to populate the board:

### Issue 1: Setup Documentation

```
Title: Document project setup and configuration
Labels: documentation, priority-p1
Status: To Do
```

### Issue 2: Configure Linting

```
Title: Set up code linting and formatting
Labels: task, config, priority-p2
Status: To Do
```

### Issue 3: Initial Testing Framework

```
Title: Configure pytest and test infrastructure
Labels: task, tests, priority-p1
Status: To Do
```

## Step 9: Verify Setup

Confirm the following:

- [ ] Project board visible and accessible
- [ ] All columns created in correct order
- [ ] Labels created with correct colors
- [ ] Issue templates available when creating issues
- [ ] PR template appears when creating PRs
- [ ] Automation rules configured
- [ ] Initial issues created and visible on board

## Step 10: Test Workflow

1. Create a test issue using a template
2. Apply labels and verify automation
3. Move issue through columns manually
4. Create a test PR and link to issue
5. Close issue and verify it moves to Done

## Troubleshooting

### Labels Not Appearing

- Refresh repository page
- Check repository settings permissions
- Verify label creation was successful

### Automation Not Working

- Verify automation rules are enabled
- Check project settings for active rules
- Ensure labels match rule conditions exactly

### Templates Not Showing

- Confirm files in `.github/ISSUE_TEMPLATE/` directory
- Check YAML frontmatter syntax
- Verify files committed to repository

## Maintenance

### Regular Tasks

- Review and update labels quarterly
- Archive completed project boards
- Update issue/PR templates as needed
- Audit automation rules effectiveness

### Optimization

- Gather team feedback on workflow
- Adjust labels based on usage patterns
- Refine automation rules for efficiency
- Update documentation with lessons learned

## Next Steps

After completing manual setup:

1. Train team on new workflow
2. Create comprehensive backlog
3. Begin using labels consistently
4. Monitor automation effectiveness
5. Iterate on process improvements

## Summary

Manual setup complete when:

- Project board created and configured
- All labels created with proper colors and descriptions
- Issue and PR templates committed to repository
- Automation rules configured and tested
- Initial issues created and organized
- Team trained on workflow and tools

This provides a solid foundation for project management using GitHub's native tools.
