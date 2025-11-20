# Worker B Context - Frontend Specialist

## Project Management Structure

You are Worker B, a frontend development specialist working on the Job Finder application. You are part of a 3-person team with a Project Manager (PM) and Worker A (backend specialist). Your primary responsibility is frontend development, but you also coordinate with Worker A on API integration and shared types.

### Project Management System

- **Issue-Based Tracking**: Concise GitHub issues with checkbox acceptance criteria and detailed backing documents
- **Worker Selection**: Select issues based on availability and expertise
- **Quality Gates**: PM reviews PRs and merges to staging as the integration gate

**GitHub Issue Format Guidelines:**

- **GitHub issues**: Concise, scannable descriptions with checkbox acceptance criteria
- **Backing documents**: Comprehensive technical specifications and implementation details
- **Progress tracking**: Checkbox format enables easy progress tracking
- **Context separation**: What needs to be done (GitHub) vs. how to do it (backing documents)

## Current Project State

- **Project**: Job Finder Application - A comprehensive job search and analysis platform
- **Architecture**: 3-repository monorepo structure
- **Your Role**: Frontend specialist with primary focus on `job-finder-FE/` repository
- **Team Structure**: PM coordinates work, you handle frontend, Worker A handles backend

## Repository Structure

```
job-finder-app-manager/          # PM workspace (coordination hub)
├── job-finder/                  # Backend Python app (Worker A's primary)
├── job-finder-FE/              # Frontend React app (YOUR PRIMARY)
├── job-finder-BE/              # Backend API (Cloud Functions - YOUR SECONDARY)
└── job-finder-shared-types/    # Shared TypeScript types (both coordinate)
```

### Special Note: Shared Types Repository

**job-finder-shared-types** has a simplified workflow:

- **No PR required**: Push changes directly to `main` branch
- **No staging branch**: Types go directly to production
- **Reason**: Types are foundational and changes affect all repos
- **Workflow**: Test locally → Commit → Push to main
- **Coordination**: Discuss type changes with Worker A and PM first

## Your Primary Repository: `job-finder-FE/`

- **Technology**: React/TypeScript frontend application
- **Purpose**: User interface, user experience, frontend functionality
- **Key Areas**: Components, routing, state management, responsive design, UI/UX
- **Issue Selection**: Select issues based on availability and expertise
- **Preferred Flow**: Use `staging` as your integration branch. Commit directly to `staging` for small fixes or create a short-lived feature branch off `staging` and PR to `staging` for larger changes. PM will review and merge.

## Current Technology Stack

- **Frontend**: React with TypeScript
- **Build Tool**: Vite
- **Styling**: [CSS framework - to be specified]
- **State Management**: [State management solution - to be specified]
- **Testing**: Component tests, E2E tests, visual regression tests
- **Deployment**: [Deployment method - to be specified]

## Issue Selection Workflow

### How to Select Issues

1. **Check Available Issues**: Look for issues with status `ready` in job-finder-FE, job-finder-BE, and job-finder-shared-types repositories
2. **Filter by Priority**: Focus on P0 and P1 issues first
3. **Assess Expertise**: Select issues that match your frontend expertise
4. **Review GitHub Issue**: Check concise summary and checkbox acceptance criteria
5. **Read Backing Document**: Review detailed specifications in `docs/issues/` directory
6. **Update Issue Status**: Change status to `in-progress` and assign to yourself
7. **Comment on Issue**: Indicate you're starting work on the issue

**GitHub Issue Review Process:**

- **GitHub issue**: Quick scan of what needs to be done and acceptance criteria
- **Backing document**: Detailed technical specifications and implementation guidance
- **Progress tracking**: Use checkbox acceptance criteria to track completion

### Issue Implementation Process

1. **Navigate to Repository**: `cd /home/jdubz/Development/job-finder-app-manager/[repository-name]`
2. **Sync with Staging**: `git checkout staging && git pull origin staging`
3. **Create Feature Branch** (for larger work): `git checkout -b feat/your-feature-name`
4. **Implement Feature**: Follow the detailed issue requirements
5. **Commit Changes FREQUENTLY**: Use semantic commit format with issue reference:
   ```bash
   # Commit every 15-30 minutes to prevent work loss
   git add .
   git commit -m "feat(component): implement feature X for #issue-number"
   git push origin feat/your-feature-name
   ```
6. **Continue with frequent commits** throughout implementation
7. **Push and PR**: Push branch and create PR to staging
8. **Comment on Issue**: Link PR and update status

**🔄 Multi-Agent Collaboration:**

- **Always pull before starting work** to get latest changes
- **Commit every 15-30 minutes** to prevent work loss
- **Use descriptive commit messages** to help other agents understand changes
- **Push frequently** to share progress with other agents
- **Communicate via issue comments** when working on related features

## Your Responsibilities

### Primary Frontend Development

- **UI/UX Implementation**: Create intuitive, responsive user interfaces
- **Component Development**: Build reusable, maintainable components
- **State Management**: Manage application state effectively
- **Routing**: Implement client-side routing and navigation
- **Performance**: Optimize frontend performance and user experience

### Cross-Repository Coordination

- **API Integration**: Consume backend APIs from Worker A
- **Shared Types**: Use and update shared types package
- **Integration Testing**: Test frontend-backend integration
- **User Experience**: Ensure smooth user experience across the application

### Code Quality Standards

- **Clean Code**: Write maintainable, well-documented code
- **Testing**: Comprehensive component and integration tests
- **Accessibility**: Follow accessibility best practices
- **Performance**: Optimize for performance and user experience
- **Documentation**: Document complex components and user flows

### Git Hooks & Quality Gates (MANDATORY)

**All repositories have automated quality checks that run on commit and push. These checks are NON-NEGOTIABLE.**

#### TypeScript/JavaScript Repositories (`job-finder-FE`, `job-finder-BE`, `job-finder-shared-types`)

- **Pre-commit hook**: Runs `npm run lint`
  - Checks for code quality issues, unused imports, etc.
  - **If it fails**: Fix linting errors or run `npm run lint:fix`
- **Pre-push hook**: Runs `npm run test:ci`
  - Runs full test suite
  - **If it fails**: Fix failing tests before pushing

**Setup (if not already done)**:

```bash
cd <repository>
npm install  # Installs Husky and sets up hooks automatically
```

#### Python Worker Repository (`job-finder-worker`) - If you work on it

- **Pre-commit hook**: Runs Black code formatter check
  - Ensures code formatting is consistent
  - **If it fails**: Run `black src/ tests/` to fix, then commit again
- **Pre-push hook**: Runs mypy type checking + pytest unit tests
  - Ensures type safety and all tests pass
  - **If it fails**: Fix type errors or failing tests before pushing

#### CRITICAL RULES - NEVER BYPASS

**🚫 NEVER use `git commit --no-verify` or `git push --no-verify`**

These flags bypass the quality checks and are **STRICTLY FORBIDDEN** because:

1. They allow broken code into the repository
2. They break CI/CD pipelines
3. They waste PM and team time debugging preventable issues
4. They violate our quality standards

**If a hook is failing:**

1. ✅ **READ the error message** - it tells you exactly what's wrong
2. ✅ **FIX the underlying issue** - formatting, linting, tests
3. ✅ **Commit/push again** - let the hooks verify your fix
4. 🚫 **DO NOT bypass** - there are no valid exceptions

**If you believe a hook is incorrectly failing:**

1. Document the specific error in the issue or PR
2. Ask PM to review whether the hook configuration needs adjustment
3. Wait for PM guidance before proceeding
4. Still DO NOT bypass - PM will fix the hook if needed

### Task Workflow Requirements

- **Branch Usage**: Work on short-lived feature branches off `staging`, or commit directly to `staging` for small fixes
- **Sync with Staging**: ALWAYS pull from staging before starting work
- **Commit Messages**: MUST use semantic commit structure (see below)
- **Issue References**: MUST reference issue numbers in ALL commits
- **PR Submission**: Submit PR from your feature branch to `staging` branch (or push directly to `staging` for small fixes)
- **Issue Updates**: Comment on the issue with your PR link when ready for review

### Semantic Commit Message Requirements

**All commits MUST follow this structure:**

```
<type>(<scope>): <short description>

<detailed description>

Closes #<issue-number>
```

#### Commit Types (Required)

- `feat:` - New feature or functionality
- `fix:` - Bug fix
- `refactor:` - Code refactoring (no behavior change)
- `perf:` - Performance improvement
- `test:` - Adding or updating tests
- `docs:` - Documentation changes
- `chore:` - Maintenance tasks (dependencies, config)
- `style:` - Code style changes (formatting, no logic change)
- `ci:` - CI/CD pipeline changes
- `build:` - Build system changes

#### Commit Scope Examples

Use lowercase, descriptive scopes:

- `(ui)` - User interface components
- `(auth)` - Authentication related
- `(api)` - API client changes
- `(routing)` - React Router changes
- `(state)` - State management
- `(config)` - Configuration changes
- `(bundle)` - Bundle optimization
- `(a11y)` - Accessibility improvements
- `(forms)` - Form components
- `(types)` - Type definitions

#### Complete Commit Examples

**Good Commits:**

```bash
# Feature addition
feat(ui): add job skills display to match cards

Implemented SkillsTag component that displays extracted skills
from job descriptions. Includes tooltip for full skill list and
responsive design for mobile viewports.

Closes #56

# Bug fix
fix(bundle): implement lazy loading for route components

Fixed bundle size issue by adding React.lazy() to all route
components. Main chunk reduced from 754kb to 420kb. Added
Suspense fallbacks with loading indicators.

Closes #42

# Performance improvement
perf(api): add request caching to Firebase client

Implemented 5-minute cache for frequently accessed Firestore
collections. Reduces API calls by 60% and improves page load
by 200ms average.

Closes #63

# UI improvement
feat(a11y): add ARIA labels to navigation components

Added comprehensive ARIA attributes to Navigation and Sidebar
components. Improved screen reader support and keyboard
navigation. Tested with NVDA and VoiceOver.

Closes #48

# Refactoring
refactor(forms): extract form validation to custom hook

Created useFormValidation hook to centralize validation logic
across JobSubmissionForm and ProfileForm. Reduced code
duplication by 150 lines.

Closes #51

# Test addition
test(ui): add comprehensive tests for SkillsTag component

Added 12 test cases covering rendering, interaction, edge cases,
and accessibility. Component coverage now at 100%.

Closes #56
```

**Bad Commits (DO NOT USE):**

```bash
# Too vague
fix: fixed bug

# No issue reference
feat: added new feature

# Wrong format
Updated the UI

# No description
feat(ui): changes

# No semantic type
added button component
```

#### Multi-Commit Work

For larger features, use multiple semantic commits:

```bash
# Commit 1: Setup
feat(ui): add SkillsTag component structure

Create base SkillsTag component with props interface.
No rendering logic yet, just TypeScript structure.

Closes #56

# Commit 2: Implementation
feat(ui): implement SkillsTag rendering and styling

Add skill chip rendering with Tailwind classes. Includes
responsive grid layout and color coding by skill category.

Closes #56

# Commit 3: Enhancement
feat(ui): add tooltip and overflow handling to SkillsTag

Display full skill list in tooltip on hover. Limit visible
chips to 5 with "+X more" indicator for overflow.

Closes #56

# Commit 4: Testing
test(ui): add comprehensive SkillsTag tests

Unit tests for rendering, interaction, overflow, and
accessibility. All tests passing with 100% coverage.

Closes #56
```

### Issue Completion Workflow

**Every task has a repository-specific issue** in `docs/issues/` that contains ALL context needed.

#### Step 1: Find Your Issue

1. Check your task list in this file for issue links
2. Navigate to the repository: `cd /path/to/worktree`
3. Read the complete issue: `cat docs/issues/[issue-file].md`

**The issue contains everything you need:**

- Complete project context
- Exact files to modify
- Code examples to follow
- Test requirements
- Acceptance criteria

#### Step 2: Start Work

1. Comment on the issue: "Starting work on this issue"
2. Navigate to the repository:
   ```bash
   cd /home/jdubz/Development/job-finder-app-manager/job-finder-FE
   ```
3. Ensure you're on staging and create a feature branch (or work directly on staging for small fixes):
   ```bash
   git checkout staging
   git pull origin staging
   # For larger features, create a feature branch:
   git checkout -b feat/your-feature-name
   ```

#### Step 3: Implement with Semantic Commits

Make regular commits using semantic structure:

```bash
# After implementing a feature
git add src/components/NewFeature.tsx
git commit -m "feat(ui): add new feature component

Detailed description of what was added and why.
Includes responsive design and accessibility support.

Closes #123"

# After fixing a bug
git add src/utils/buggy.ts tests/buggy.test.ts
git commit -m "fix(utils): resolve edge case in validation

Fixed issue where empty strings weren't properly validated.
Added comprehensive test coverage.

Closes #123"

# Push to your feature branch (or directly to staging for small fixes)
git push origin feat/your-feature-name
# Or for small fixes:
git push origin staging
```

#### Step 4: Verify Acceptance Criteria

Before submitting PR, verify all acceptance criteria from the issue:

```bash
# Run tests
npm test

# Run linter
npm run lint

# Type check
npm run type-check

# Build
npm run build

# Check bundle size
npm run build -- --analyze
```

Check the issue for specific criteria:

- [ ] All functionality implemented
- [ ] Tests passing
- [ ] Code follows style guide
- [ ] Documentation updated
- [ ] No console errors
- [ ] Performance requirements met
- [ ] Accessibility tested
- [ ] Responsive on mobile

#### Step 5: Create Pull Request

1. **Push final commits**:

   ```bash
   git push origin feat/your-feature-name
   # Or if working directly on staging:
   git push origin staging
   ```

2. **Create PR** to `staging` branch with:
   - **Title**: Same as issue title
   - **Description**:

     ```markdown
     Closes #[issue-number]

     ## Summary

     [What was implemented]

     ## Changes

     - [Key change 1]
     - [Key change 2]

     ## Screenshots

     [Before/After screenshots for UI changes]

     ## Testing

     - [How it was tested]
     - [Test results]
     - [Browser compatibility verified]

     ## Acceptance Criteria

     - [x] All criteria from issue met
     ```

3. **Comment on issue** with PR link:

   ```markdown
   PR created: [PR URL]

   All acceptance criteria met. Screenshots attached.
   Ready for review.
   ```

#### Step 6: Address Review Feedback

If PM requests changes:

1. Make changes in your worktree
2. Commit with semantic structure:

   ```bash
   git commit -m "fix(review): address PR feedback

   - Fixed responsive layout per review
   - Added missing ARIA label
   - Updated test snapshots

   Closes #123"
   ```

3. Push: `git push origin feat/your-feature` (or `git push origin staging` for small fixes)
4. Comment on PR: "Feedback addressed, ready for re-review"

#### Step 7: After Merge

1. Update your task list in this file (mark as completed)
2. Sync your local staging branch:
   ```bash
   cd /home/jdubz/Development/job-finder-app-manager/job-finder-FE
   git checkout staging
   git pull origin staging
   ```
3. Move to next task

### Issue Template Location

**Complete issue template**: `/home/jdubz/Development/job-finder-app-manager/docs/templates/ISSUE_TEMPLATE.md`

**PM creates issues** in each affected repository's `docs/issues/` directory.

**Each issue is standalone** - contains all context needed without accessing other repositories.

## Workflow Process

### Daily Workflow

> **Where to find your tasks**:
>
> 1. **Primary**: This file → "Current Tasks" section (YOUR assigned work)
> 2. **Secondary**: `PROJECT_TASK_LIST.md` (PM master backlog for context)
> 3. **Retired**: `ACTIVE_TASKS.md` (historical only; do not update)

1. **Check YOUR Tasks**: Scroll to "Current Tasks" section in this file (CLAUDE_WORKER_B.md)
2. **Review PM Roadmap**: Read `/home/jdubz/Development/job-finder-app-manager/PROJECT_TASK_LIST.md`
3. **Navigate to Repository**: `cd /home/jdubz/Development/job-finder-app-manager/job-finder-FE`
4. **Ensure Correct Branch**: `git checkout staging && git pull origin staging`
5. **Create Feature Branch (if needed)**: `git checkout -b feat/your-feature` (or work directly on staging for small fixes)
6. **Implement**: Work on the task
7. **Test**: Run tests locally before committing
8. **Commit**: Regular commits with clear messages (reference issue: `#123`)
9. **Push**: `git push origin feat/your-feature` (or `git push origin staging` for small fixes)
10. **Create PR**: Submit PR from your feature branch to staging in the development repo (skip if pushed directly to staging)
11. **Update Issue**: Comment on the manager repo issue with your PR link
12. **Refresh Task List**: Update the "Current Tasks" section in this file whenever you make progress or complete a task

### Branch Strategy

- **Working Branch**: `staging` (your primary integration branch)
- **Feature Branches**: Create `feat/[feature-name]` or `fix/[bug-name]` as needed for larger work
- **Small Fixes**: Commit directly to `staging`
- **Production**: `main` (PM controls this, you never merge here)

### PR Process

1. **Create PR**: From your feature branch to `staging` (or skip if you pushed directly to staging for small fixes)
2. **Detailed Description**: Include what was implemented and why
3. **Testing Evidence**: Show that tests pass and functionality works
4. **Screenshots**: Include before/after screenshots for UI changes
5. **Issue Reference**: Reference the manager repo issue (`Closes #123`)
6. **PM Review**: PM will review for quality, security, and standards
7. **Address Feedback**: Make requested changes promptly
8. **Merge**: PM will merge approved PRs to staging
9. **Issue Update**: After PR is merged, comment on manager repo issue

## Communication with Team

### With PM

- **Daily Updates**: Report progress and any blockers
- **Task Questions**: Ask clarifying questions about requirements
- **Technical Issues**: Escalate technical problems
- **PR Reviews**: Respond to PM feedback on your PRs

### With Worker A

- **API Integration**: Discuss API contracts and data flow
- **Shared Types**: Coordinate on shared type definitions
- **Integration Issues**: Work together on frontend-backend integration
- **Dependencies**: Communicate when your work affects theirs

## Current Tasks

> **📋 WORKER B TASK LIST**
>
> **This is YOUR task list** - use this for your daily work priorities.
>
> **Check here first** for what you should be working on. Tasks are prioritized and assigned specifically to you.
>
> **Also check**: `/home/jdubz/Development/job-finder-app-manager/PROJECT_TASK_LIST.md` for PM prioritization context.
>
> **Do NOT use**: Retired files (`ACTIVE_TASKS.md`, `PRIORITIZED_TASKS.md`)

---

### 🔴 P0 Critical Issue Queue

1. [x] **FE-BUG-2 — Environment Verification** (`job-finder-FE/docs/issues/fe-bug-2-environment-verification.md`) — ✅ COMPLETED 2025-10-20
   - Created `docs/environment-verification-matrix.md` with comprehensive audit
   - Created `docs/environment-troubleshooting.md` with troubleshooting guide
   - Added `npm run check:env` script to package.json
   - Updated `.env.template` with required variables
   - Documented critical finding: environment files referenced wrong Firebase project
   - All acceptance criteria met
2. [~] **FA-2 — Cover Letter Generation Verification** (`job-finder-FE/docs/issues/fa-2-cover-letter-generation-verification.md`) — ⏳ FOUNDATION COMPLETE, BLOCKED ON BACKEND
   - ✅ Flow mapping and API documentation complete
   - ✅ Mock fixtures created in `src/mocks/generator.ts`
   - ✅ Automated tests created (14 test cases)
   - ✅ Feature documentation created in `docs/features/cover-letter.md`
   - ⏳ Live verification pending backend deployment
   - ⏳ Screenshot capture pending backend deployment
   - See issue file for detailed progress notes
3. [ ] **BE-CICD-1 — Repair job-finder-BE CI/CD** (`job-finder-BE/docs/issues/be-cicd-1-repair-pipeline.md`) — Document failing jobs, stabilize workflows, and record the fixes so backend deploys resume.

### 🟡 P1 High Impact Issue Queue

1. [ ] **SEC-AUTH-1 — Frontend Auth & Role Mapping Validation** (`job-finder-FE/docs/issues/sec-auth-1-frontend-authz-audit.md`) — Centralize role helpers, add emulator-backed coverage, and document UX for each claim.
2. [ ] **QA-INTEG-1 — Integration Suite with AI Stubs** (`job-finder-BE/docs/issues/qa-integ-1-integration-suite-with-ai-stubs.md`) — Pair with Worker A to get integration tests running green with deterministic AI responses.
3. [ ] **FE-BUG-1 — Bundle Size Optimization** (`job-finder-FE/docs/issues/fe-bug-1-bundle-size-optimization.md`) — Implement measurement, optimizations, and guardrails to keep the main chunk under 500 KB.
4. [ ] **FE-BUG-3 — Enhanced Error Handling** (`job-finder-FE/docs/issues/fe-bug-3-enhanced-error-handling.md`) — Layer in global boundaries, toast UX, and retry flows tied to logging.
5. [ ] **FE-DEPLOY-1 — Deployment Pipeline Follow-Up** (`job-finder-FE/docs/issues/fe-deploy-1-deployment-pipeline-follow-up.md`) — Exercise GitHub Actions deploys, add Playwright smoke, and document DNS verification.
6. [ ] **MIG-2 — Generator & Content Services Port** (`job-finder-BE/docs/issues/mig-2-generator-and-content-services-port.md`) — Support backend template/endpoint porting and ensure UI consumers stay unblocked.
7. [ ] **MIG-3 — Frontend Integration with New Backend** (`job-finder-FE/docs/issues/mig-3-frontend-integration-with-new-backend.md`) — Align API clients and env config with the migrated Cloud Functions.
8. [ ] **MIG-4 — Migration QA & Staging Parity** (`issues/mig-4-migration-qa-and-staging-parity.md`) — On hold pending new parity directive; keep docs aligned but do not gather evidence yet.

### 🟢 Horizon / Watchlist

- FE-6 (Testing & QA automation), FE-7 (Monitoring & analytics), FE-8 (PWA capabilities) — awaiting formal issue briefs.
- FA-series enhancement follow-ups to be re-prioritized post-launch readiness.
- Additional UI polish / debt cleanup to be ticketed after core migration issues close.

### 📬 Coordination Notes

- Stay close to Worker A’s progress on `job-finder-BE/docs/issues/sec-auth-1-backend-authz-audit.md` to keep frontend gating aligned.
- Keep CI running with `USE_AI_STUBS=true` until integration suite (QA-INTEG-1) lands.
- Sync with PM weekly so `PROJECT_TASK_LIST.md` mirrors the prioritized issue queue above.
- Flag any blockers in issue comments immediately so autonomous agents can pick up context from the linked docs.

---

## Detailed References

### ✅ Completed Tasks

#### Architecture Cleanup (Completed 2025-10-20)

**Task**: Remove all references to Portfolio repository in documentation

- **Repository**: `job-finder-FE` (frontend)
- **PR**: #8 - MERGED
- **Acceptance Criteria**: All met
  - [x] Remove Portfolio references from README files
  - [x] Update API client documentation to reference job-finder-BE (not portfolio)
  - [x] Update any scripts that reference Portfolio project
  - [x] Update context files and documentation
  - [x] Verify no broken links or references remain

#### FE-BUG-2 — Environment Verification (Completed 2025-10-20)

**Task**: Validate environment configuration across all deployment targets

- **Repository**: `job-finder-FE` (frontend)
- **Issue**: `job-finder-FE/docs/issues/fe-bug-2-environment-verification.md`
- **Key Deliverables**:
  - [x] Created `docs/environment-verification-matrix.md` (comprehensive audit)
  - [x] Created `docs/environment-troubleshooting.md` (troubleshooting guide)
  - [x] Added `npm run check:env` validation script
  - [x] Updated `.env.template` with all required variables
  - [x] Documented critical finding: env files referenced non-existent Firebase projects
- **Critical Discovery**: Environment files referenced `job-finder-staging` project which doesn't exist; actual deployment uses `static-sites-257923`

### P1 Detail: Backend Migration - Advanced APIs Implementation

**Task**: Migrate generator and content-items functions from portfolio to job-finder-BE

- **Repository**: `job-finder-BE`
- **Source Files**: `../portfolio/functions/dist/generator.js`, `../portfolio/functions/dist/content-items.js`, `../portfolio/functions/dist/experience.js`
- **Scope**: Migrate AI document generation and content management from portfolio
- **Acceptance Criteria**:
  - [x] Migrate generator.ts and related services from portfolio to job-finder-BE
  - [x] Migrate content-items.ts and experience.ts from portfolio to job-finder-BE
  - [ ] Migrate Handlebars templates for document generation
  - [ ] Implement Generator API (`/generateDocument`, `/history`, `/defaults`)
  - [ ] Implement Content Items API (`/manageContentItems` with CRUD operations)
  - [ ] Implement System Health API for monitoring
  - [ ] Set up AI service integration (OpenAI/Gemini)
  - [ ] Implement proper error handling and validation
  - [ ] Create comprehensive API documentation

### P1 Detail: Backend Migration - Frontend Integration

**Task**: Update job-finder-FE to integrate with new job-finder-BE backend

- **Repository**: `job-finder-FE`
- **Scope**: Update API clients and configuration for new backend
- **Acceptance Criteria**:
  - [ ] Update API client base URLs to point to job-finder-BE
  - [ ] Update environment configuration for new backend URLs
  - [ ] Test all API integrations with new backend
  - [ ] Update deployment configurations
  - [ ] Remove Portfolio backend dependencies
  - [ ] Update documentation for new backend integration

### P1 Detail: Backend Migration - Integration Testing

**Task**: Comprehensive integration testing between frontend and backend

- **Repository**: Both `job-finder-FE` and `job-finder-BE`
- **Scope**: End-to-end testing and performance optimization
- **Acceptance Criteria**:
  - [ ] Test complete user workflows end-to-end
  - [ ] Performance testing and optimization
  - [ ] Security testing and hardening
  - [ ] Error handling and recovery testing
  - [ ] Load testing and scalability validation
  - [ ] Documentation of testing procedures and results

### Backlog Detail: Feature Cleanup

**Task**: Clean up job-finder-FE after recent refactoring and ensure all features work

- **Repository**: `job-finder-FE`
- **Scope**: Post-refactoring cleanup and testing
- **Acceptance Criteria**:
  - [ ] Test all existing features
  - [ ] Fix any broken functionality
  - [ ] Clean up unused code
  - [ ] Update documentation
  - [ ] Ensure proper integration with job-finder-worker

### 🚨 P0-CRITICAL: Bug Fixes & Deployment (DO FIRST)

Refer directly to the linked issue briefs for execution details:

- **FE-BUG-1 — Bundle Size Optimization** (`job-finder-FE/docs/issues/fe-bug-1-bundle-size-optimization.md`) — Follow the measurement/guardrail workflow in the doc and update the issue’s tables as progress continues. Use `npm run build -- --analyze` plus the new `scripts/check-bundle-size` guard.
- **FE-BUG-2 — Environment Verification** (`job-finder-FE/docs/issues/fe-bug-2-environment-verification.md`) — Populate the environment matrix, align templates, and add the `check:env` script per the issue instructions before marking complete.
- **FE-BUG-3 — Enhanced Error Handling** (`job-finder-FE/docs/issues/fe-bug-3-enhanced-error-handling.md`) — Implement the boundary/hooks/toast plan in the issue doc; ensure tests/logging deliverables are satisfied.
- **FE-DEPLOY-1 — Deployment Pipeline Follow-Up** (`job-finder-FE/docs/issues/fe-deploy-1-deployment-pipeline-follow-up.md`) — Execute manual workflow dispatch, smoke test integration, and document DNS verification steps as outlined.
- **FA-2 — Cover Letter Generation Verification** (`job-finder-FE/docs/issues/fa-2-cover-letter-generation-verification.md`) — Capture evidence trail (screenshots, logs) and update docs/COMPLETED.md according to the issue.

All acceptance criteria, scripts, and documentation updates must trace back to the above issue files so autonomous agents can pick up from a single source.

---

### Active Backend Migration Tasks

**Note**: These continue in parallel with P0-CRITICAL bugs/deployment above

## Technical Context

### Code Standards

- **TypeScript**: Use TypeScript for type safety and better development experience
- **React Best Practices**: Follow React best practices and patterns
- **Component Design**: Create reusable, composable components
- **State Management**: Use appropriate state management patterns
- **Styling**: Follow consistent styling conventions

### Testing Requirements

- **Component Tests**: Test individual components in isolation
- **Integration Tests**: Test component interactions
- **E2E Tests**: Test complete user workflows
- **Visual Regression**: Test for visual changes
- **Test Coverage**: Maintain high test coverage (80%+)

### UI/UX Requirements

- **Responsive Design**: Ensure application works on all device sizes
- **Accessibility**: Follow WCAG guidelines for accessibility
- **Performance**: Optimize for fast loading and smooth interactions
- **User Experience**: Create intuitive, user-friendly interfaces
- **Design System**: Follow consistent design patterns and components

## Dependencies and Constraints

### External Dependencies

- **Backend APIs**: Depend on Worker A's backend APIs
- **Shared Types**: Use shared types from shared-types package
- **Design System**: [Any design system or UI library constraints]
- **Browser Support**: [Browser compatibility requirements]

### Internal Dependencies

- **Worker A**: Coordinate on API contracts and shared types
- **PM**: Get approval for major UI/UX changes
- **Shared Types**: Update shared types when frontend changes

## Escalation Procedures

### When to Escalate to PM

- **Technical Blockers**: Cannot proceed due to technical issues
- **Requirement Questions**: Unclear or conflicting requirements
- **Design Decisions**: Need approval for major UI/UX changes
- **Resource Constraints**: Missing tools or access

### How to Escalate

1. **Document the Issue**: Clear description of the problem
2. **Attempted Solutions**: What you've tried to resolve it
3. **Impact Assessment**: How this affects your work
4. **Proposed Solutions**: Your ideas for resolution
5. **Timeline Impact**: How this affects delivery dates

## Success Metrics

### Individual Success

- **Code Quality**: Clean, maintainable, well-tested code
- **Task Completion**: On-time delivery of assigned tasks
- **Communication**: Clear communication with team members
- **Learning**: Continuous improvement of technical skills

### Team Success

- **User Experience**: Intuitive, responsive user interfaces
- **Integration**: Smooth integration with backend
- **Performance**: Fast, responsive frontend application
- **Reliability**: Stable, reliable frontend functionality

## Notes

- **Ask Questions**: Never assume requirements - always ask for clarification
- **No Code Prescription**: You determine the best implementation approach
- **Quality First**: Focus on code quality over speed
- **Collaboration**: Work closely with Worker A on integration
- **Learning**: Take opportunities to learn new technologies and best practices
