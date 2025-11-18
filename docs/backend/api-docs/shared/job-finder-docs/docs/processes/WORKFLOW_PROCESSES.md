# Workflow Processes

## Overview

This document outlines the standard workflow processes for the Job Finder application development team using git worktrees and explicit task management.

## PM Task Creation Process

### PM Works in Staging Branch

- **PM Location**: Main repository directories on `staging` branch
- **PM Role**: Task creation, coordination, and integration
- **PM Branch**: `staging` (receives all worker PRs)

### Explicit Task Creation Process

#### 1. PM Creates Detailed Tasks

The PM must create **very explicit tasks** for workers with:

**Required Task Information:**

- **Clear Title**: Specific, actionable task title
- **Detailed Description**: Step-by-step implementation requirements
- **Acceptance Criteria**: Specific, testable criteria for completion
- **Repository Assignment**: Which repository to work in
- **Worker Assignment**: Which Claude worker should handle the task
- **Context File**: Which context file to reference (CLAUDE_WORKER_A.md, CLAUDE_WORKER_B.md, CLAUDE_SHARED.md)
- **Priority Level**: P0-Critical, P1-High, P2-Medium, P3-Low
- **Dependencies**: Any dependencies or prerequisites
- **Testing Requirements**: Specific testing requirements
- **Documentation Requirements**: What documentation is needed

#### 2. PM Task Template

```markdown
## Task: [Clear, Specific Title]

### Description

[Detailed step-by-step description of what needs to be implemented]

### Acceptance Criteria

- [ ] Specific, testable criterion 1
- [ ] Specific, testable criterion 2
- [ ] Specific, testable criterion 3

### Repository

- [ ] Backend (job-finder)
- [ ] Frontend (job-finder-FE)
- [ ] Shared (job-finder-shared-types)
- [ ] PM (job-finder-app-manager)

### Worker Assignment

- **Claude Worker**: [Worker A/Worker B/PM]
- **Context File**: [CLAUDE_WORKER_A.md/CLAUDE_WORKER_B.md/CLAUDE_SHARED.md]

### Priority

- [ ] P0 - Critical
- [ ] P1 - High
- [ ] P2 - Medium
- [ ] P3 - Low

### Dependencies

[List any dependencies or prerequisites]

### Testing Requirements

[Specific testing requirements]

### Documentation Requirements

[What documentation is needed]
```

## Worker Development Workflow

# Workflow Processes

## Overview

This document outlines the standard workflow processes for the Job Finder application development team using git worktrees and explicit task management.

### Worker Setup Process

#### 1. Worker Receives Task

#### 2. Worker Switches to Worktree

```bash
# Worker A (Backend) - Primary worktree
cd /home/jdubz/Development/job-finder-app-manager/worktrees/worker-a-job-finder

# Worker B (Frontend) - Primary worktree
cd /home/jdubz/Development/job-finder-app-manager/worktrees/worker-b-job-finder-FE

# Cross-repository work (when needed)
cd /home/jdubz/Development/job-finder-app-manager/worktrees/worker-a-job-finder-FE
cd /home/jdubz/Development/job-finder-app-manager/worktrees/worker-b-job-finder
```

#### 3. Worker Development Process

1. **Create Feature Branch**: Create new branch from worker branch
2. **Implement Feature**: Follow explicit task requirements
3. **Self-Review**: Review code against acceptance criteria
4. **Test Locally**: Run all tests locally
5. **Submit PR**: Submit pull request to staging branch

### Worker Setup Process

#### 1. Worker Receives Task

- Worker receives explicit task from PM
- Worker reviews task requirements

#### 2. Prepare Local Working Copy

1. Navigate to the appropriate repository working copy (e.g., `job-finder/`, `job-finder-FE/`, or `job-finder-shared-types/`)
2. Ensure you're on `staging` and up-to-date:

```bash
cd /home/jdubz/Development/job-finder-app-manager/job-finder
git checkout staging
git pull origin staging
```

#### 3. Worker Development Process

1. **Create Feature Branch (optional)**: For larger changes, create a short-lived feature branch from `staging`.
2. **Implement Feature**: Follow explicit task requirements
3. **Self-Review**: Review code against acceptance criteria
4. **Test Locally**: Run all tests locally
5. **Submit PR / Commit to staging**: Either commit directly to `staging` for small fixes, or open a PR from your feature branch to `staging` for larger changes

### Daily Workflow for Workers

#### Morning Setup

1. **Check Updates**: Review any updates from PM or team
2. **Update Worktree**: Pull latest changes from staging in main repo
3. **Review Tasks**: Check assigned tasks and requirements
4. **Plan Day**: Plan work for the day

#### Development Process

1. **Switch to Worktree**: Navigate to appropriate worktree
2. **Create Feature Branch**: Create new branch from worker branch
3. **Implement Feature**: Write code following explicit requirements
4. **Self-Review**: Review own code against acceptance criteria
5. **Test Locally**: Run all tests locally
6. **Submit PR**: Submit pull request to staging

#### End of Day

1. **Update Status**: Update task status in GitHub
2. **Commit Work**: Commit any remaining work
3. **Push Changes**: Push changes to remote
4. **Report Progress**: Report progress to PM

### PM Workflow

#### PM Works in Main and Staging Branches

The PM operates differently for each repository:

```bash
# PM works in manager repo on main branch (documentation only)
cd /home/jdubz/Development/job-finder-app-manager
git checkout main

# PM works in development repos on staging branch (integration)
cd /home/jdubz/Development/job-finder
git checkout staging

cd /home/jdubz/Development/job-finder-FE
git checkout staging

cd /home/jdubz/Development/job-finder-shared-types
git checkout staging
```

#### Daily PM Tasks

1. **Review PRs**: Review all pending pull requests to staging
2. **Check Progress**: Monitor worker progress in worktrees
3. **Update Documentation**: Update project documentation
4. **Coordinate**: Coordinate between workers if needed
5. **Merge PRs**: Merge approved PRs to staging branch
6. **Integration Testing**: Test integrated features on staging

#### Weekly PM Tasks

1. **Sprint Planning**: Plan upcoming sprint with explicit tasks
2. **Task Assignment**: Create and assign explicit tasks to workers
3. **Progress Review**: Review overall progress across all repositories
4. **Documentation Review**: Review and update documentation
5. **Staging Integration**: Ensure staging branch integration works
6. **Production Preparation**: Prepare staging for production merge

## Branch Management Process

### Branch Strategy

#### Manager Repository (job-finder-app-manager)

- **Main (`main`)**: PM's working branch for documentation and process management
- **No Staging**: Commits go directly to main
- **No Worktrees**: PM works directly in main directory

#### Development Repositories (job-finder, job-finder-FE, job-finder-shared-types)

- **Production (`main`)**: Protected, only PM can merge from staging
- **Staging**: PM's working branch in main directories, receives all worker PRs
- **Worker Branches**: Each worker has dedicated branches in their worktrees
  - `worker-a-job-finder` - Worker A backend work
  - `worker-a-job-finder-FE` - Worker A frontend work
  - `worker-b-job-finder` - Worker B backend work
  - `worker-b-job-finder-FE` - Worker B frontend work
  - `worker-a-job-finder-shared-types` - Worker A shared types work
  - `worker-b-job-finder-shared-types` - Worker B shared types work
- **Feature Branches**: Created as needed from worker branches in worktrees

### Branch Creation Process

1. **Identify Need**: Determine if new branch is needed
2. **Create Branch**: Create branch from appropriate parent
3. **Set Up Tracking**: Set up remote tracking
4. **Notify Team**: Notify team of new branch

### Branch Merge Process

1. **Code Review**: Review code for quality and standards
2. **Testing**: Ensure all tests pass
3. **Approval**: Get PM approval for merge
4. **Merge**: Merge branch to target branch
5. **Cleanup**: Delete merged branch if appropriate

## Pull Request Process

### PR Creation (From Worktrees)

1. **Worker Creates Feature Branch**: In their worktree, create feature branch from worker branch
2. **Implement Feature**: Follow explicit task requirements
3. **Create PR**: Create pull request from feature branch to staging branch
4. **Add Description**: Include detailed description of changes and task completion
5. **Add Labels**: Add appropriate labels (repository, priority, worker assignment)
6. **Request Review**: Request review from PM

### PR Review Process

1. **PM Review**: PM reviews code for quality, standards, and task completion
2. **Check Acceptance Criteria**: PM verifies all acceptance criteria are met
3. **Feedback**: PM provides feedback and suggestions
4. **Address Feedback**: Worker addresses feedback in worktree
5. **Re-review**: PM re-reviews if needed
6. **Approval**: PM approves PR for merge to staging

### PR Merge Process

1. **Final Check**: PM performs final check before merge
2. **Merge to Staging**: PM merges PR to staging branch in main directory
3. **Integration Test**: PM tests integrated feature on staging
4. **Notification**: PM notifies team of merge
5. **Cleanup**: Worker cleans up merged branch in worktree

## Worktree Workflow

### Worktree Structure

```
/home/jdubz/Development/job-finder-app-manager/
├── worktrees/                           # Worker worktrees (3 repos only)
│   ├── worker-a-job-finder/            # Worker A - Backend
│   ├── worker-a-job-finder-FE/         # Worker A - Frontend
│   ├── worker-a-job-finder-shared-types/ # Worker A - Shared Types
│   ├── worker-b-job-finder/            # Worker B - Backend
│   ├── worker-b-job-finder-FE/         # Worker B - Frontend
│   └── worker-b-job-finder-shared-types/ # Worker B - Shared Types
├── job-finder/                          # Main Backend Repo (PM staging)
├── job-finder-FE/                       # Main Frontend Repo (PM staging)
├── job-finder-shared-types/             # Main Shared Types Repo (PM staging)
└── [PM works in main directory on main branch - documentation only]
```

# Worktree Structure

```
/home/jdubz/Development/job-finder-app-manager/
├── worktrees/                           # Worker worktrees (3 repos only)
│   ├── worker-a-job-finder/            # Worker A - Backend
│   ├── worker-a-job-finder-FE/         # Worker A - Frontend
│   ├── worker-a-job-finder-shared-types/ # Worker A - Shared Types
│   ├── worker-b-job-finder/            # Worker B - Backend
│   ├── worker-b-job-finder-FE/         # Worker B - Frontend
│   └── worker-b-job-finder-shared-types/ # Worker B - Shared Types
├── job-finder/                          # Main Backend Repo (PM staging)
├── job-finder-FE/                       # Main Frontend Repo (PM staging)
├── job-finder-shared-types/             # Main Shared Types Repo (PM staging)
└── [PM works in main directory on main branch - documentation only]
```

### Worker Navigation

````bash
# Worker A (Backend) - Primary worktree
cd /home/jdubz/Development/job-finder-app-manager/worktrees/worker-a-job-finder

# Worker B (Frontend) - Primary worktree
cd /home/jdubz/Development/job-finder-app-manager/worktrees/worker-b-job-finder-FE

# Cross-repository work (when needed)
cd /home/jdubz/Development/job-finder-app-manager/worktrees/worker-a-job-finder-FE
cd /home/jdubz/Development/job-finder-app-manager/worktrees/worker-b-job-finder

### Repository Structure (developer working copies)
```text
/home/jdubz/Development/job-finder-app-manager/
├── job-finder/                          # Backend repo working copy (use staging)
├── job-finder-FE/                       # Frontend repo working copy (use staging)
├── job-finder-shared-types/             # Shared types repo working copy (use staging)
└── [PM works in main directory on main branch - documentation only]
````

### Worker Navigation

```bash
# Example: prepare backend working copy
cd /home/jdubz/Development/job-finder-app-manager/job-finder
git checkout staging
git pull origin staging

# Example: prepare frontend working copy
cd /home/jdubz/Development/job-finder-app-manager/job-finder-FE
git checkout staging
git pull origin staging
```

# Shared types work (when needed)

cd /home/jdubz/Development/job-finder-app-manager/worktrees/worker-a-job-finder-shared-types
cd /home/jdubz/Development/job-finder-app-manager/worktrees/worker-b-job-finder-shared-types

```

### Worktree Development Process
1. **Worker Receives Task**: PM assigns explicit task with requirements
2. **Worker Switches to Worktree**: Navigate to appropriate worktree
3. **Worker Creates Feature Branch**: Create branch from worker branch
4. **Worker Implements Feature**: Follow explicit task requirements
5. **Worker Tests Locally**: Run tests in worktree
6. **Worker Submits PR**: Submit PR from worktree to staging
7. **PM Reviews and Merges**: PM reviews and merges to staging
8. **Worker Cleans Up**: Clean up merged branch in worktree

## Testing Process

### Unit Testing
1. **Write Tests**: Write unit tests for new code
2. **Run Tests**: Run tests locally
3. **Fix Issues**: Fix any failing tests
4. **Commit Tests**: Commit tests with code

### Integration Testing
1. **Test Integration**: Test integration between components
2. **Test APIs**: Test API endpoints
3. **Test Database**: Test database interactions
4. **Fix Issues**: Fix any integration issues

### End-to-End Testing
1. **Test User Flows**: Test complete user workflows
2. **Test Edge Cases**: Test edge cases and error conditions
3. **Test Performance**: Test performance under load
4. **Document Results**: Document test results

## Code Quality Process

### Code Standards
1. **Follow Conventions**: Follow established coding conventions
2. **Write Clean Code**: Write clean, readable code
3. **Add Comments**: Add appropriate comments
4. **Document APIs**: Document API endpoints

### Code Review Standards
1. **Review Thoroughly**: Review code thoroughly
2. **Check Standards**: Ensure code follows standards
3. **Test Coverage**: Ensure adequate test coverage
4. **Security**: Check for security issues

### Quality Gates
1. **Linting**: All code must pass linting
2. **Testing**: All tests must pass
3. **Security**: Security scans must pass
4. **Performance**: Performance tests must pass

## Documentation Process

### Document Creation
1. **Identify Need**: Determine if new documentation is needed
2. **Choose Template**: Use appropriate template
3. **Create Content**: Create initial content
4. **Review**: Review content for accuracy

### Document Updates
1. **Identify Changes**: Identify what needs updating
2. **Update Content**: Update relevant sections
3. **Review**: Review updated content
4. **Notify Team**: Notify team of changes

### Document Maintenance
1. **Regular Review**: Regularly review documentation
2. **Update Status**: Update document status
3. **Archive Old**: Archive outdated documentation
4. **Consolidate**: Consolidate duplicate content

## Communication Process

### Daily Communication
1. **Standup**: Daily standup meeting
2. **Progress Updates**: Regular progress updates
3. **Blocker Reporting**: Report any blockers
4. **Status Updates**: Update task status

### Weekly Communication
1. **Sprint Review**: Review sprint progress
2. **Planning**: Plan upcoming work
3. **Retrospective**: Review what went well and what could improve
4. **Documentation**: Update documentation

### Escalation Process
1. **Identify Issue**: Identify the issue or blocker
2. **Attempt Resolution**: Try to resolve the issue
3. **Escalate**: Escalate to PM if needed
4. **Follow Up**: Follow up on resolution

## Deployment Process

### Development Deployment
1. **Local Testing**: Test locally first
2. **Staging Deployment**: Deploy to staging environment
3. **Testing**: Test in staging environment
4. **Fix Issues**: Fix any issues found

### Production Deployment
1. **PM Approval**: Get PM approval for production deployment
2. **Final Testing**: Final testing before production
3. **Deploy**: Deploy to production
4. **Monitor**: Monitor production deployment

### Rollback Process
1. **Identify Issue**: Identify production issue
2. **Assess Impact**: Assess impact of issue
3. **Rollback Decision**: Decide on rollback
4. **Execute Rollback**: Execute rollback if needed

## Monitoring Process

### Application Monitoring
1. **Set Up Monitoring**: Set up application monitoring
2. **Configure Alerts**: Configure appropriate alerts
3. **Monitor Metrics**: Monitor key metrics
4. **Respond to Issues**: Respond to monitoring alerts

### Performance Monitoring
1. **Track Performance**: Track application performance
2. **Identify Bottlenecks**: Identify performance bottlenecks
3. **Optimize**: Optimize performance issues
4. **Document**: Document performance improvements

## Security Process

### Security Review
1. **Code Review**: Review code for security issues
2. **Dependency Check**: Check dependencies for vulnerabilities
3. **Configuration Review**: Review security configurations
4. **Testing**: Test security measures

### Security Updates
1. **Monitor Vulnerabilities**: Monitor for security vulnerabilities
2. **Update Dependencies**: Update vulnerable dependencies
3. **Apply Patches**: Apply security patches
4. **Test Updates**: Test security updates

## Backup and Recovery Process

### Backup Process
1. **Regular Backups**: Perform regular backups
2. **Test Backups**: Test backup integrity
3. **Store Securely**: Store backups securely
4. **Document**: Document backup procedures

### Recovery Process
1. **Identify Loss**: Identify what was lost
2. **Locate Backup**: Locate appropriate backup
3. **Restore**: Restore from backup
4. **Verify**: Verify restoration success

## Continuous Improvement Process

### Process Review
1. **Regular Review**: Regularly review processes
2. **Identify Issues**: Identify process issues
3. **Improve**: Improve processes
4. **Document**: Document improvements

### Team Feedback
1. **Gather Feedback**: Gather team feedback
2. **Analyze Feedback**: Analyze feedback
3. **Implement Changes**: Implement improvements
4. **Measure Impact**: Measure impact of changes
```
