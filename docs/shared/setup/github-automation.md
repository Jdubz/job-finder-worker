# GitHub Automation Setup Guide

> Status: Active
> Owner: @jdubz
> Last Updated: 2025-12-09

## Overview

This guide covers automated setup for GitHub Projects integration, labels, issue templates, and workflow automation for the job-finder-bot repository.

## Automated Setup Capabilities

### Fully Automated

- Project column creation
- Label creation and configuration
- Issue template setup
- PR template configuration
- Basic workflow automation

### Manual Configuration Required

- GitHub App permissions
- Organization-level settings
- External service integrations

## Quick Setup

### Prerequisites

- GitHub repository with admin access
- GitHub personal access token with `repo` and `project` scopes
- Node.js 18+ installed (if using automation scripts)

### Environment Variables

```bash
export GITHUB_TOKEN=your_github_token_here
export GITHUB_OWNER=your_username_or_organization
export GITHUB_REPO=job-finder-bot
```

### Automated Setup Script

If automation scripts are available:

```bash
# Navigate to repository
cd /home/jdubz/Development/job-finder-bot

# Install dependencies
npm install

# Run setup script
node scripts/setup-github-project.js
```

### GitHub Actions Workflow

Trigger automated setup via GitHub Actions:

1. Go to repository on GitHub
2. Navigate to Actions tab
3. Select "Setup GitHub Project" workflow (if available)
4. Click "Run workflow"
5. Monitor execution and review results

## Label Configuration

### Priority Labels

- `priority-p0` - Critical (Red: #d73a4a)
- `priority-p1` - High (Orange: #ff6b35)
- `priority-p2` - Medium (Yellow: #fbca04)
- `priority-p3` - Low (Green: #0e8a16)

### Type Labels

- `bug` - Bug report (Red: #d73a4a)
- `enhancement` - Feature request (Blue: #0075ca)
- `task` - General task (Purple: #7057ff)
- `documentation` - Documentation (Navy: #0075ca)

### Status Labels

- `status-todo` - Not started (Gray: #d4c5f9)
- `status-in-progress` - Active work (Blue: #0e8a16)
- `status-review` - Under review (Yellow: #fbca04)
- `status-done` - Completed (Green: #0e8a16)

### Component Labels

- `scraper` - Web scraping functionality
- `parser` - Content parsing
- `storage` - Data storage
- `config` - Configuration
- `tests` - Testing

## Issue Templates

### Bug Report Template

Located at `.github/ISSUE_TEMPLATE/bug_report.md`:

- Bug description
- Steps to reproduce
- Expected vs actual behavior
- Environment details
- Screenshots/logs

### Feature Request Template

Located at `.github/ISSUE_TEMPLATE/feature_request.md`:

- Feature description
- Use case and benefits
- Proposed implementation
- Alternatives considered

### Task Template

Located at `.github/ISSUE_TEMPLATE/task.md`:

- Task overview
- Acceptance criteria (checkboxes)
- Dependencies
- Estimated effort

## Pull Request Template

Located at `.github/PULL_REQUEST_TEMPLATE.md`:

- Change description
- Related issues
- Testing performed
- Checklist (tests, docs, lint)

## Project Board Setup

### Project Columns

1. **To Do** - Backlog and upcoming work
2. **In Progress** - Active development
3. **Review** - Code review and testing
4. **Done** - Completed work

### Automation Rules

- **Auto-move to In Progress** - When issue assigned or PR opened
- **Auto-move to Review** - When PR marked ready for review
- **Auto-move to Done** - When issue/PR closed

## Workflow Automation

### GitHub Actions Integration

Create `.github/workflows/project-automation.yml`:

```yaml
name: Project Automation

on:
  issues:
    types: [opened, assigned, labeled]
  pull_request:
    types: [opened, ready_for_review, closed]

jobs:
  update-project:
    runs-on: ubuntu-latest
    steps:
      - name: Update project board
        uses: actions/add-to-project@v0.5.0
        with:
          project-url: https://github.com/users/USERNAME/projects/PROJECT_NUMBER
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Label Automation

Auto-label based on file paths or content patterns.

### Status Synchronization

Sync issue status with project board column.

## Verification Checklist

After setup completion:

- [ ] Project board created with correct columns
- [ ] All labels configured with proper colors
- [ ] Issue templates available in repository
- [ ] PR template configured
- [ ] Automation rules active
- [ ] GitHub Actions workflows enabled
- [ ] Test issue/PR to verify automation

## Troubleshooting

### Permission Errors

Verify GitHub token has required scopes:

- `repo` - Full repository access
- `project` - Project board access
- `workflow` - GitHub Actions access

### Label Conflicts

If labels already exist:

```bash
# Delete existing label
gh label delete "label-name" --yes

# Recreate with correct configuration
gh label create "label-name" --color "hexcolor" --description "description"
```

### Automation Not Triggering

1. Check workflow file syntax
2. Verify GitHub Actions enabled for repository
3. Review workflow run logs in Actions tab
4. Ensure token has necessary permissions

## Manual Setup Fallback

If automated setup fails, refer to:

- [Manual GitHub Project Setup](./github-manual-setup.md)

## Next Steps

After completing setup:

1. Create initial issues using templates
2. Test automation by moving issues through workflow
3. Configure project board views and filters
4. Set up notifications for team members
5. Document any custom automation rules

## Support

- Review GitHub Actions logs for detailed error messages
- Check GitHub documentation for Projects API
- Verify repository permissions and token scopes
- Test with minimal example before full setup
