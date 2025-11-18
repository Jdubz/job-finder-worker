# GitHub Project Setup Guide

## Complete Manual Setup Instructions

Since the automated GraphQL API is having authentication issues, here are the complete manual steps to set up your GitHub project board.

## Step 1: Create the GitHub Project

1. **Go to GitHub.com** and sign in
2. **Click your profile picture** in the top right
3. **Click "Your projects"** from the dropdown
4. **Click "New project"**
5. **Choose "Table" view** (recommended for project management)
6. **Name it**: `Job Finder App Manager`
7. **Description**: `Central project management hub for the Job Finder application ecosystem`
8. **Click "Create project"**

## Step 2: Add Repositories to Project

1. **In your new project**, click the **"Add items"** button
2. **Click "Add repositories"**
3. **Add these 4 repositories**:
   - `Jdubz/job-finder-app-manager` (PM)
   - `Jdubz/job-finder` (Backend)
   - `Jdubz/job-finder-FE` (Frontend)
   - `Jdubz/job-finder-shared-types` (Shared)

## Step 3: Create Custom Fields

### Status Field

1. **Click the "+" button** next to column headers
2. **Select "Single select"**
3. **Name**: `Status`
4. **Add these options**:
   - `To Do` (Gray)
   - `In Progress` (Blue)
   - `Review` (Yellow)
   - `Done` (Green)

### Priority Field

1. **Click the "+" button** again
2. **Select "Single select"**
3. **Name**: `Priority`
4. **Add these options**:
   - `P0 - Critical` (Red)
   - `P1 - High` (Orange)
   - `P2 - Medium` (Yellow)
   - `P3 - Low` (Green)

### Repository Field

1. **Click the "+" button** again
2. **Select "Single select"**
3. **Name**: `Repository`
4. **Add these options**:
   - `Backend` (Brown)
   - `Frontend` (Blue)
   - `Shared` (Purple)
   - `PM` (Gold)

## Step 4: Set Up Automation Rules

### Auto-assign Issues Based on Repository

1. **Go to project settings** (gear icon)
2. **Click "Automation"**
3. **Add rule**: "When an issue is added to this project"
4. **Condition**: "Label contains repository-backend"
5. **Action**: "Assign to user" (select Worker A)
6. **Repeat for**:
   - `repository-frontend` → Worker B
   - `repository-pm` → PM
   - `repository-shared` → PM

### Auto-move Issues Based on Status

1. **Add rule**: "When an issue is labeled"
2. **Condition**: "Label is status-in-progress"
3. **Action**: "Move to column" → "In Progress"
4. **Repeat for**:
   - `status-review` → "Review" column
   - `status-done` → "Done" column

## Step 5: Create Initial Issues

### PM Issues (High Priority)

1. **Create issue**: "Set up project management workflow"
   - **Repository**: `job-finder-app-manager`
   - **Labels**: `task`, `priority-p0`, `repository-pm`
   - **Status**: `To Do`

2. **Create issue**: "Create worker context files"
   - **Repository**: `job-finder-app-manager`
   - **Labels**: `task`, `priority-p1`, `repository-pm`
   - **Status**: `To Do`

### Backend Issues

1. **Create issue**: "Set up backend development environment"
   - **Repository**: `job-finder`
   - **Labels**: `task`, `priority-p1`, `repository-backend`
   - **Status**: `To Do`

2. **Create issue**: "Implement job scraping functionality"
   - **Repository**: `job-finder`
   - **Labels**: `enhancement`, `priority-p2`, `repository-backend`
   - **Status**: `To Do`

### Frontend Issues

1. **Create issue**: "Set up frontend development environment"
   - **Repository**: `job-finder-FE`
   - **Labels**: `task`, `priority-p1`, `repository-frontend`
   - **Status**: `To Do`

2. **Create issue**: "Implement job application interface"
   - **Repository**: `job-finder-FE`
   - **Labels**: `enhancement`, `priority-p2`, `repository-frontend`
   - **Status**: `To Do`

### Shared Types Issues

1. **Create issue**: "Define shared TypeScript types"
   - **Repository**: `job-finder-shared-types`
   - **Labels**: `task`, `priority-p1`, `repository-shared`
   - **Status**: `To Do`

## Step 6: Configure Project Views

### Table View (Default)

- **Columns**: Title, Status, Priority, Repository, Assignee, Due Date
- **Filters**: Set up saved filters for each repository
- **Sorting**: Priority (P0 → P3), then Status

### Board View (Optional)

1. **Click "Board" view**
2. **Group by**: Status
3. **Add columns**: To Do, In Progress, Review, Done

## Step 7: Set Up Notifications

1. **Go to project settings**
2. **Click "Notifications"**
3. **Enable**: "Notify when items are added"
4. **Enable**: "Notify when items are moved"
5. **Enable**: "Notify when items are completed"

## Step 8: Create Project Templates

### Issue Templates (Already Created)

- Bug Report template
- Feature Request template
- Task Request template

### Pull Request Template (Already Created)

- Standard PR template with checklists

## Step 9: Set Up GitHub Actions Integration

1. **Go to project settings**
2. **Click "Integrations"**
3. **Enable**: "GitHub Actions"
4. **Enable**: "Pull request automation"

## Step 10: Create Project Documentation

1. **Create a project README** with:
   - Project overview
   - Workflow processes
   - Team responsibilities
   - Contact information

2. **Create a project wiki** with:
   - Detailed setup instructions
   - Troubleshooting guide
   - Best practices

## Verification Checklist

- [ ] Project created with correct name and description
- [ ] All 4 repositories added to project
- [ ] Custom fields created (Status, Priority, Repository)
- [ ] Automation rules configured
- [ ] Initial issues created
- [ ] Project views configured
- [ ] Notifications enabled
- [ ] Templates available
- [ ] Documentation created

## Project URL

Once created, your project will be available at:
`https://github.com/users/Jdubz/projects/[PROJECT_NUMBER]`

## Next Steps

1. **Assign initial tasks** to team members
2. **Set up regular check-ins** (weekly project reviews)
3. **Configure branch protection** rules
4. **Set up CI/CD pipelines**
5. **Create deployment workflows**

## Support

If you encounter any issues:

1. Check GitHub's documentation on Projects
2. Review the project settings
3. Verify repository permissions
4. Contact GitHub support if needed

---

**Note**: This manual setup ensures you have full control over the project configuration and can customize it exactly to your needs.
