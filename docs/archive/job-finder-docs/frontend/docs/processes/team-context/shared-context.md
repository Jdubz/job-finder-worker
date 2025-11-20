# Shared Context - Both Workers

## Project Management Structure

This is the shared context file for both Worker A (backend) and Worker B (frontend) working on the Job Finder application. This file contains information that both workers need to understand the project, their roles, and how to work together effectively.

### Project Management System

- **Manager Repository**: `job-finder-app-manager` - PM's coordination hub
- **Issue-Based Tracking**: Concise GitHub issues with checkbox acceptance criteria and detailed backing documents
- **Worker Selection**: Workers select issues based on availability and expertise
- **Quality Gates**: PM reviews all PRs before merging to staging
- **Branch Strategy**: Workers use feature branches and PRs to `staging`; PM integrates from `staging` into `main`

**GitHub Issue Format Guidelines:**

- **GitHub issues**: Concise, scannable descriptions with checkbox acceptance criteria
- **Backing documents**: Comprehensive technical specifications and implementation details
- **Progress tracking**: Checkbox format enables easy progress tracking
- **Context separation**: What needs to be done (GitHub) vs. how to do it (backing documents)

**⚠️ CRITICAL: Multi-Agent Workspace**
This workspace is used by multiple agents (PM, Worker A, Worker B) simultaneously. **Commit frequently** to prevent collisions and work loss.

## Project Structure

```
job-finder-app-manager/          # PM workspace (coordination hub)
├── job-finder/                  # Queue Worker (Python) - Worker A primary
├── job-finder-FE/              # Frontend + Cloud Functions (React/TypeScript) - Worker B primary
├── job-finder-shared-types/    # Shared TypeScript types (both coordinate)
└── (No local worktrees)        # Worktrees have been deprecated; workers use branches and the normal repo working copy
```

## Corrected Architecture Understanding

- **job-finder**: Queue worker that reads from Firestore and executes scraping tasks
- **job-finder-FE**: Frontend React app + Firebase Cloud Functions (backend)
- **job-finder-shared-types**: TypeScript definitions for Firestore data structures
- **Portfolio**: No longer used - migrated to job-finder-FE

## Team Roles

### Project Manager (PM)

- **Primary Role**: Quality gatekeeper and work coordinator
- **Working Branch**: `main` (manager repo), `staging` (development repos)
- **Responsibilities**:
  - Create concise GitHub issues with checkbox acceptance criteria
  - Create comprehensive backing issue documents with detailed specifications
  - Review and approve all PRs to staging in development repos
  - Ensure code quality and security standards
  - Prevent bad code from reaching production
  - Provide guidance on issue selection for workers
  - Manage production releases
  - Maintain documentation and context in manager repo
  - Monitor issue status and provide guidance as needed

**GitHub Issue Creation Guidelines:**

- **Keep GitHub issue body under 500 words** - focus on what needs to be done
- **Use checkbox format for all acceptance criteria** (`- [ ]` for progress tracking)
- **Include brief summary and current issue context**
- **Reference detailed backing document** for comprehensive specifications
- **Detailed technical specs go in backing documents** - not in GitHub issue body

### Worker A (Queue Worker Specialist)

- **Primary Repository**: `job-finder-worker/` (Python queue worker)
- **Working Branch**: Use short-lived feature branches and submit PRs directly to `staging`
- **Responsibilities**: Queue processing, scraping logic, E2E testing, data processing
- **Issue Selection**: Select issues based on availability and expertise

### Worker B (Frontend + Cloud Functions Specialist)

- **Primary Repository**: `job-finder-FE/` (React frontend + Firebase Cloud Functions)
- **Working Branch**: Use short-lived feature branches and submit PRs directly to `staging`
- **Responsibilities**: UI/UX, components, Firebase Cloud Functions, user experience
- **Issue Selection**: Select issues based on availability and expertise

## Shared Responsibilities

### Cross-Repository Coordination

- **API Contracts**: Worker A creates APIs, Worker B consumes them
- **Shared Types**: Both workers coordinate on `job-finder-shared-types/`
- **Integration Testing**: Test frontend-backend integration together
- **Data Flow**: Ensure proper data flow between frontend and backend

### Communication

- **Daily Standups**: Report progress and blockers
- **PR Reviews**: Review each other's PRs when requested
- **Technical Discussions**: Discuss integration and shared concerns
- **Dependency Management**: Coordinate when work affects each other

## Code Quality & Git Hooks (MANDATORY FOR BOTH WORKERS)

**All repositories have automated quality checks that run on commit and push. These checks are NON-NEGOTIABLE and apply to BOTH workers.**

### Git Hooks Setup

#### TypeScript/JavaScript Repositories (`job-finder-FE`, `job-finder-BE`, `job-finder-shared-types`, `job-finder-app-manager`)

- **Pre-commit hook**: Runs `npm run lint`
- **Pre-push hook**: Runs `npm run test:ci` or `npm run test`

**Setup**: `npm install` (Husky sets up hooks automatically)

#### Python Worker Repository (`job-finder-worker`)

- **Pre-commit hook**: Runs Black code formatter check
- **Pre-push hook**: Runs mypy type checking + pytest unit tests

**Setup**:

```bash
cd job-finder-worker
pip install pre-commit
pre-commit install
pre-commit install --hook-type pre-push
```

### CRITICAL RULES - NEVER BYPASS

**🚫 STRICTLY FORBIDDEN: `git commit --no-verify` or `git push --no-verify`**

**Why these flags are banned:**

1. They allow broken code into the repository
2. They break CI/CD pipelines
3. They waste PM and team time debugging preventable issues
4. They violate our quality standards and team agreements

**If a hook is failing:**

1. ✅ **READ the error message** - it tells you exactly what's wrong
2. ✅ **FIX the underlying issue** - formatting, linting, or failing tests
3. ✅ **Commit/push again** - let the hooks verify your fix
4. 🚫 **DO NOT bypass** - there are no exceptions to this rule

**If you believe a hook is incorrectly failing:**

1. Document the specific error in the issue or PR
2. Ask PM to review whether the hook configuration needs adjustment
3. Wait for PM guidance before proceeding
4. Still DO NOT bypass the check - PM will fix the hook configuration if needed

**Consequences of bypassing:**

- PR will be rejected by PM
- Issue will be sent back for rework
- Time wasted for everyone on the team

## Workflow Process

### Branch Strategy

- **Production (`main`)**: Protected, only PM can merge from staging
- **Staging**: Integration branch where all development work is merged
- **Feature Branches**: Created as needed from `staging` for larger features
- **Small Fixes**: Commit directly to `staging`

### PR Process

1. **Create Feature Branch** (optional): From `staging` for larger work
2. **Implement Feature**: Write code, tests, documentation
3. **Self-Review**: Review your own code before submitting
4. **Submit PR**: To staging branch with detailed description
5. **GitHub Project Integration**: Ensure PR includes proper labels and issue references
6. **Automation Compliance**: Verify commit messages trigger project automation rules
7. **PM Review**: PM reviews for quality, security, standards
8. **Address Feedback**: Make requested changes
9. **Merge**: PM merges approved PRs to staging

**🔄 Multi-Agent Collaboration Guidelines:**

- **Commit every 15-30 minutes** to prevent work loss
- **Pull before starting work** to get latest changes from other agents
- **Use descriptive commit messages** to help other agents understand changes
- **Push frequently** to share progress with other agents
- **Communicate via issue comments** when working on related features
- **Coordinate on shared files** to avoid merge conflicts

### GitHub Issue Management

- **Issue Selection**: Workers select issues based on availability and expertise
- **Issue Status**: Update issue status to `in-progress` when starting work
- **Issue References**: Reference GitHub issues in PR description using `#issue-number`
- **Commit Format**: Use conventional commit format (feat:, fix:, docs:, etc.)
- **Issue Comments**: Use issue comments for status updates, questions, and PR links
- **Progress Tracking**: Use checkbox acceptance criteria to track completion status
- **Context Reference**: Always reference backing documents for detailed specifications

### Quality Standards

- **Code Quality**: Clean, maintainable, well-tested code
- **Testing**: Comprehensive tests (unit, integration, E2E)
- **Documentation**: Document complex logic and APIs
- **Security**: No secrets, validate inputs, follow security best practices
- **Performance**: Optimize for performance and scalability

### Semantic Commit Requirements (MANDATORY)

**All commits MUST use semantic commit structure:**

```
<type>(<scope>): <short description>

<detailed description>

Closes #<issue-number>
```

#### Commit Types

- `feat:` - New feature or functionality
- `fix:` - Bug fix
- `refactor:` - Code refactoring (no behavior change)
- `perf:` - Performance improvement
- `test:` - Adding or updating tests
- `docs:` - Documentation changes
- `chore:` - Maintenance (dependencies, config)
- `style:` - Code style (formatting only)
- `ci:` - CI/CD changes
- `build:` - Build system changes

#### Commit Scopes

Lowercase, descriptive scopes relevant to the change:

- Backend: `(api)`, `(db)`, `(queue)`, `(scraper)`, `(auth)`
- Frontend: `(ui)`, `(routing)`, `(state)`, `(bundle)`, `(forms)`
- Shared: `(types)`, `(config)`, `(docs)`

#### Issue References

- **MUST** include `Closes #[issue-number]` in commit body
- Issue must exist in the repository where commit is made
- Each task has standalone issues in affected repositories

### GitHub Issue Requirements

- **Issue Labels**: Use appropriate labels (priority-p0, priority-p1, priority-p2, priority-p3, task, bug, enhancement, documentation, ready, in-progress, blocked, review-needed)
- **Issue Status**: Update issue status appropriately (ready → in-progress → review-needed → closed)
- **Issue Comments**: Use issue comments for status updates, questions, and PR links
- **Issue Selection**: Workers select issues based on availability and expertise
- **Issue Documentation**: Each issue has a backing document in the repository's `docs/issues/` directory

## Communication Protocols

### Daily Standup Format

```
**Worker A:**
- Completed: [Backend tasks completed]
- Today: [Backend tasks planned]
- Blockers: [Any technical or dependency blockers]

**Worker B:**
- Completed: [Frontend tasks completed]
- Today: [Frontend tasks planned]
- Blockers: [Any technical or dependency blockers]

**PM:**
- Reviews: [PRs pending review]
- Coordination: [Cross-repo coordination needed]
- Blockers: [Process or technical blockers to resolve]
```

### Escalation Path

1. **Worker → Worker**: Peer discussion for technical issues
2. **Worker → PM**: Technical guidance and process issues
3. **PM → Stakeholders**: Business decisions and resource allocation

## Shared Types Coordination

### `job-finder-shared-types/` Package

- **Purpose**: Shared TypeScript interfaces and types
- **Usage**: Both workers use and update this package
- **Coordination**: Discuss changes that affect both workers
- **Versioning**: Keep types in sync with backend and frontend

### Type Management

- **API Types**: Define API request/response types
- **Data Models**: Define shared data structures
- **Validation**: Ensure type safety across repositories
- **Documentation**: Document type definitions and usage

## Integration Points

### API Integration

- **Backend APIs**: Worker A creates, Worker B consumes
- **Data Flow**: Ensure proper data flow between frontend and backend
- **Error Handling**: Consistent error handling across the stack
- **Authentication**: Coordinate authentication between frontend and backend

### Testing Integration

- **Unit Tests**: Each worker tests their own code
- **Integration Tests**: Test frontend-backend integration
- **E2E Tests**: Test complete user workflows
- **Shared Test Data**: Use consistent test data across repositories

## Common Issues and Solutions

### Dependency Management

- **API Changes**: Coordinate when backend APIs change
- **Type Updates**: Update shared types when data structures change
- **Integration Issues**: Work together to resolve integration problems
- **Version Conflicts**: Resolve dependency version conflicts

### Communication Issues

- **Unclear Requirements**: Ask PM for clarification
- **Technical Disagreements**: Discuss and reach consensus
- **Blockers**: Escalate to PM when blocked
- **Dependencies**: Communicate when work affects each other

## Best Practices

### Code Quality

- **Consistent Standards**: Follow established coding standards
- **Code Reviews**: Review each other's code when requested
- **Documentation**: Document complex logic and APIs
- **Testing**: Write comprehensive tests for all code

### Collaboration

- **Communication**: Clear, timely communication
- **Coordination**: Coordinate on shared concerns
- **Knowledge Sharing**: Share learnings and best practices
- **Problem Solving**: Work together to solve problems

### Learning and Growth

- **Skill Development**: Continuously improve technical skills
- **Best Practices**: Stay updated with industry best practices
- **Code Standards**: Follow established coding standards
- **Tool Proficiency**: Master development tools and workflows

## Success Metrics

### Individual Success

- **Code Quality**: Clean, maintainable, well-tested code
- **Task Completion**: On-time delivery of assigned tasks
- **Communication**: Clear communication with team members
- **Learning**: Continuous improvement of technical skills

### Team Success

- **Integration**: Smooth integration between frontend and backend
- **Quality**: High code quality and test coverage
- **Collaboration**: Effective communication and coordination
- **Delivery**: Consistent delivery of sprint goals

## Notes

- **Ask Questions**: Never assume requirements - always ask for clarification
- **No Code Prescription**: Determine the best implementation approach
- **Quality First**: Focus on code quality over speed
- **Collaboration**: Work together effectively on shared concerns
- **Learning**: Take opportunities to learn from each other
