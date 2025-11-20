# Project Management Structure

## Overview

This repository serves as the central project management hub for a multi-repository development workflow. The project manager (PM) coordinates work between Worker A and Worker B across 3 separate repositories, ensuring quality control and proper staging-to-production flow.

## Repository Structure

- **Main Repository**: `/home/jdubz/Development/job-finder-app-manager/` (PM workspace)
- **Managed Repositories**: 3 separate repos (gitignored, managed independently)
  - `job-finder/` - Backend Python application
  - `job-finder-FE/` - Frontend React/TypeScript application
  - `job-finder-shared-types/` - Shared TypeScript types package
- **Branch Strategy**: Each worker has dedicated branches, PM manages staging, production protection

## Team Responsibilities

### Project Manager (PM) - Primary Responsibilities

1. **Quality Gatekeeper**
   - Review and approve all PRs to staging branches
   - Ensure code quality, security, and architectural standards
   - Prevent bad code from reaching production
   - Maintain staging branch integrity

2. **Work Coordination**
   - Assign tasks to Worker A and Worker B
   - **Critical**: Worker A and Worker B tasks must be INDEPENDENT - we cannot control which worker completes first
   - **Rule**: A tasks must NEVER depend on B tasks, and B tasks must NEVER depend on A tasks
   - Tasks can depend on staging (shared completed work) but not on other worker's in-progress work
   - Coordinate dependencies between workers through staging branch merges
   - Manage sprint planning and task prioritization
   - Resolve conflicts between worker implementations

3. **Release Management**
   - Control staging-to-production deployments
   - Manage release schedules and versioning
   - Coordinate production deployments
   - Maintain production stability

4. **Code Review & Standards**
   - Enforce coding standards and best practices
   - Review architecture decisions
   - Ensure security compliance
   - Maintain documentation standards

5. **Branch Management**
   - Manage staging branch (primary working branch)
   - Coordinate merge strategies
   - Handle conflict resolution
   - Maintain branch hygiene

### Worker A - Development Responsibilities

1. **Feature Development**
   - Implement assigned features and user stories
   - Write clean, maintainable code
   - Follow established coding standards
   - Create comprehensive unit tests

2. **Branch Management**
   - Work on `staging` branch or short-lived feature branches off `staging`
   - Create feature branches for larger work
   - Commit directly to staging for small fixes
   - Submit PRs to staging branch for larger features
   - Keep local staging up-to-date

3. **Code Quality**
   - Self-review code before submitting PRs
   - Write meaningful commit messages
   - Ensure all tests pass
   - Document complex logic and APIs

4. **Collaboration**
   - Communicate blockers and dependencies
   - Participate in code reviews
   - Coordinate with Worker B when needed
   - Update task status regularly

### Worker B - Development Responsibilities

1. **Feature Development**
   - Implement assigned features and user stories
   - Write clean, maintainable code
   - Follow established coding standards
   - Create comprehensive unit tests

2. **Branch Management**
   - Work on `staging` branch or short-lived feature branches off `staging`
   - Create feature branches for larger work
   - Commit directly to staging for small fixes
   - Submit PRs to staging branch for larger features
   - Keep local staging up-to-date

3. **Code Quality**
   - Self-review code before submitting PRs
   - Write meaningful commit messages
   - Ensure all tests pass
   - Document complex logic and APIs

4. **Collaboration**
   - Communicate blockers and dependencies
   - Participate in code reviews
   - Coordinate with Worker A when needed
   - Update task status regularly

## Workflow Process

### Development Flow

1. **Task Assignment**: PM assigns tasks to appropriate worker
2. **Branch Creation**: Worker creates feature branch from their dedicated branch
3. **Development**: Worker implements feature with proper testing
4. **Self-Review**: Worker reviews own code and runs tests
5. **PR Creation**: Worker submits PR to staging branch
6. **PM Review**: PM reviews PR for quality, security, and standards
7. **Merge**: PM merges approved PRs to staging
8. **Production**: PM controls staging-to-production flow

### Branch Strategy

- **Production (`main`)**: Protected, only PM can merge from staging
- **Staging**: Integration branch where all development work merges
- **Feature branches**: Short-lived branches for larger features, created from `staging`
- **Small fixes**: Committed directly to `staging`

### Quality Gates

1. **Code Review**: All PRs must be reviewed by PM
2. **Testing**: All tests must pass
3. **Security**: Security scan must pass
4. **Standards**: Code must follow established standards
5. **Documentation**: Complex features must be documented

## Communication Protocol

- **Daily Standups**: Progress updates and blocker identification
- **PR Reviews**: Detailed feedback and approval process
- **Escalation**: Blockers and conflicts escalated to PM
- **Documentation**: All decisions and changes documented

## Success Metrics

- **Code Quality**: Zero critical bugs in production
- **Delivery**: On-time feature delivery
- **Collaboration**: Effective communication and coordination
- **Standards**: Consistent code quality and practices
