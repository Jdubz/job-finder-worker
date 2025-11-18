# PM Issue Creation Workflow

> **Critical Rule**: Every task must have a standalone issue in EVERY affected repository with complete, self-contained context.
> **Documentation-First Approach**: Reference existing repository documentation to reduce redundancy and keep issues focused.

---

## Table of Contents

1. [Overview](#overview)
2. [Documentation-First Approach](#documentation-first-approach)
3. [When to Create Issues](#when-to-create-issues)
4. [Issue Creation Process](#issue-creation-process)
5. [Multi-Repository Issues](#multi-repository-issues)
6. [Issue Template Usage](#issue-template-usage)
7. [Tracking & Coordination](#tracking--coordination)
8. [Examples](#examples)

---

## Overview

### Core Principle

**Each repository issue must be completely standalone** - a developer with access ONLY to that repository should be able to complete the task without viewing any other repository, documentation, or external resources.

### Why This Matters

- **Worker Independence**: Workers often work in isolated worktrees
- **Context Preservation**: All context is preserved within the issue
- **Onboarding**: New developers can understand tasks without deep codebase knowledge
- **Auditability**: Complete history of decisions and requirements in one place

---

## Documentation-First Approach

### Philosophy

**DON'T repeat what's already documented. DO reference it.**

Instead of copying architecture information into every issue, we:

1. **Create/maintain repository documentation** that explains the system
2. **Create an ISSUE_CONTEXT.md** that consolidates common information
3. **Reference documentation in issues** rather than duplicating it
4. **Keep issues focused** on the specific task at hand

### Benefits

✅ **Reduces Redundancy**: Write documentation once, reference many times
✅ **Easier Maintenance**: Update docs in one place, not across many issues
✅ **Focused Issues**: Issues stay concise and task-oriented
✅ **Better Documentation**: Forces us to keep docs current and comprehensive
✅ **Faster Issue Creation**: No need to copy/paste large context blocks

### Process Overview

```
1. Identify Task
        ↓
2. Check Repository Documentation
        ↓
3. Create/Update Architecture Docs (if needed)
        ↓
4. Ensure ISSUE_CONTEXT.md exists and is current
        ↓
5. Create Streamlined Issue (references docs)
        ↓
6. Issue contains:
   - Reference to ISSUE_CONTEXT.md
   - Reference to relevant architecture docs
   - Task-specific details only
```

### Documentation Hierarchy

**Level 1: ISSUE_CONTEXT.md** (per repository)

- Project overview and purpose
- Repository structure
- Technology stack
- Development environment setup
- Common patterns and utilities
- Testing procedures
- Code standards

**Level 2: Architecture Documentation** (per repository)

- System architecture
- Data flow diagrams
- Component interactions
- API contracts
- Design decisions

**Level 3: Feature Documentation** (per repository)

- Specific feature implementations
- Integration guides
- Troubleshooting guides
- Deployment procedures

**Level 4: Issues** (task-specific)

- References to above docs
- Task-specific requirements only
- Implementation details for THIS task
- Acceptance criteria
- Testing approach

### When to Create Documentation vs. Issue Content

**Create Documentation When**:

- ✅ Information applies to multiple issues/features
- ✅ Describes system architecture or design
- ✅ Explains "how the system works"
- ✅ Provides common patterns or utilities
- ✅ Setup instructions for development environment

**Put in Issue When**:

- ✅ Specific to THIS task only
- ✅ Task-specific acceptance criteria
- ✅ Implementation steps for THIS change
- ✅ Task-specific test cases
- ✅ Temporary notes or context

### Required Documentation Structure

**For each repository, ensure these exist**:

```
repository/
├── CLAUDE.md                    # AI assistant context
├── README.md                    # Getting started
├── docs/
│   ├── architecture.md          # System architecture
│   ├── development.md           # Development guide
│   ├── deployment.md            # Deployment guide
│   └── issues/
│       ├── ISSUE_CONTEXT.md     # Common issue context
│       └── [task-id]-issue.md   # Individual issues
```

**ISSUE_CONTEXT.md Template**:

- Project Overview (what this repo does)
- Repository Structure (where things are)
- Technology Stack (what we use)
- Development Environment (how to set up)
- Testing (how to test)
- Code Standards (how to write code)
- Common Patterns (utility functions, patterns)
- Related Documentation (links to other docs)

---

## When to Create Issues

### Always Create Issues For

- ✅ New features or enhancements
- ✅ Bug fixes (P0-P3)
- ✅ Refactoring tasks
- ✅ Technical debt items
- ✅ Migration work
- ✅ Performance optimization
- ✅ Security improvements
- ✅ Documentation updates (if substantial)

### Never Create Issues For

- ❌ Routine PR reviews (use PR workflow)
- ❌ Small typo fixes (commit directly)
- ❌ Minor formatting changes (commit directly)
- ❌ Daily coordination tasks (use task files)

---

## Issue Creation Process

### Step 0: Documentation Audit (NEW - Do This First!)

**Before creating issues, ensure documentation exists:**

1. **Check for ISSUE_CONTEXT.md** in each affected repository:

   ```bash
   ls [repo]/docs/issues/ISSUE_CONTEXT.md
   ```

2. **If missing, create it** using the template structure above

3. **Check for relevant architecture docs**:
   - Does `docs/architecture.md` cover the system being modified?
   - Does `docs/[feature].md` explain the feature being changed?
   - Is there a design doc for the subsystem?

4. **Create/update architecture docs if needed**:
   - If modifying a major system, document it first
   - Update existing docs if they're outdated
   - Reference these docs in issues

5. **Verify CLAUDE.md is current**:
   - Does it accurately describe the repository?
   - Are the key features and workflows documented?

**Time Investment**:

- First time per repo: 1-2 hours (creating ISSUE_CONTEXT.md)
- Subsequent issues: 5-10 minutes (verify docs are current)

**Payoff**:

- Issues take 30% less time to write
- Workers spend less time asking clarification questions
- Documentation stays current and useful

### Step 1: Identify All Affected Repositories

Before creating any issues, determine which repositories will be impacted:

**Example Decision Matrix:**

| Task                | job-finder-worker | job-finder-FE | job-finder-BE | job-finder-shared-types |
| ------------------- | ----------------- | ------------- | ------------- | ----------------------- |
| Add new job field   | ✅ (scraper)      | ✅ (display)  | ✅ (API)      | ✅ (type def)           |
| Fix frontend bug    | ❌                | ✅            | ❌            | ❌                      |
| Update API endpoint | ❌                | ✅ (consumer) | ✅ (provider) | ✅ (types)              |
| Worker performance  | ✅                | ❌            | ❌            | ❌                      |

### Step 2: Create Master Issue in Manager Repo

**Location**: `/home/jdubz/Development/job-finder-app-manager/issues/`

**Filename**: `[task-id]-[brief-description].md`

**Purpose**: Cross-repository coordination and tracking

**Contents**:

```markdown
# [TASK-ID] — [Description]

**Status**: Todo
**Owner**: [Worker A / Worker B / PM]
**Priority**: [P0/P1/P2/P3]
**Affects**: [List of repositories]

## Repository Issues

- job-finder-worker: #[issue-number]
- job-finder-FE: #[issue-number]
- job-finder-BE: #[issue-number]
- job-finder-shared-types: #[issue-number]

## Coordination Notes

[How the work should be sequenced across repos]

## Acceptance Criteria (Cross-Repo)

- [ ] All repository-specific issues completed
- [ ] Integration tested across all affected repos
- [ ] Documentation updated in all repos
```

### Step 3: Create Repository-Specific Issues (STREAMLINED APPROACH)

For **EACH** affected repository, create a **streamlined issue that references documentation**.

#### Issue Creation Checklist

**For each repository:**

1. **Navigate to repository**:

   ```bash
   cd /home/jdubz/Development/job-finder-app-manager/[repo-name]
   ```

2. **Create issue in `docs/issues/` directory**:

   ```bash
   mkdir -p docs/issues
   # Create issue file
   ```

3. **Use the streamlined template**: `docs/templates/ISSUE_TEMPLATE_STREAMLINED.md`

4. **Reference documentation, don't duplicate**:
   - ✅ Start with reference to ISSUE_CONTEXT.md
   - ✅ Link to relevant architecture docs
   - ✅ Link to feature docs if applicable
   - ✅ Focus on task-specific requirements
   - ✅ Provide task-specific code examples only
   - ❌ DON'T copy project overview (it's in ISSUE_CONTEXT.md)
   - ❌ DON'T copy development setup (it's in ISSUE_CONTEXT.md)
   - ❌ DON'T copy architecture info (link to docs instead)

5. **Issue structure**:

   ```markdown
   # [TASK-ID] — [Description]

   > **Context**: See [ISSUE_CONTEXT.md](./ISSUE_CONTEXT.md)
   > **Architecture**: See [relevant-doc.md](../relevant-doc.md)

   ## Summary

   [Problem, Goal, Impact - task-specific]

   ## Architecture References

   [Links to docs to read first]

   ## Tasks

   [Step-by-step implementation]

   ## Technical Details

   [Task-specific code examples]

   ## Acceptance Criteria

   [Measurable outcomes]

   ## Testing

   [How to verify]
   ```

6. **Validate completeness**:
   - Does the issue reference ISSUE_CONTEXT.md?
   - Are relevant architecture docs linked?
   - Is the task-specific information complete?
   - Can someone follow the references + issue to complete the task?
   - Are acceptance criteria clear and measurable?

### Step 4: Link Issues Together

**In manager repo master issue**:

- Link to all repository-specific issues
- Document coordination requirements
- Specify sequencing if needed

**In repository issues**:

- Reference manager repo issue for context
- Link related issues in OTHER repos (but don't depend on them)

### Step 5: Update Task Tracking Files

**Update `PROJECT_TASK_LIST.md`**:

```markdown
- [ ] **[TASK-ID]: [Description]** (Owner: [Worker] · Repos: [list] · [Manager Issue Link])
  - Brief description and coordination notes
```

**Update appropriate worker file** (`CLAUDE_WORKER_A.md` or `CLAUDE_WORKER_B.md`):

```markdown
- [ ] **[TASK-ID]: [Description]** — [One-line summary] ([Repo Issue Link])
```

---

## Multi-Repository Issues

### Coordination Strategy

When a task spans multiple repositories, create **independent issues** that can be completed in **any order**.

#### ✅ Good: Independent Tasks

```
Repository: job-finder-shared-types
Task: Add JobMatch type with new 'skills' field
Dependencies: None
Completion: Push to main, version bump

Repository: job-finder-BE
Task: Update job-queue API to return skills field
Dependencies: Uses job-finder-shared-types@1.2.0+ (already published)
Completion: PR to staging

Repository: job-finder-FE
Task: Display skills field in job match cards
Dependencies: Uses job-finder-shared-types@1.2.0+ (already published)
Completion: PR to staging
```

#### ❌ Bad: Dependent Tasks

```
Repository: job-finder-BE
Task: Create new /getJobSkills endpoint
Dependencies: WAITING for Worker A to complete backend work
Status: BLOCKED - violates independence rule
```

### Sequencing Multi-Repo Work

**Use staging as the integration point:**

1. **Phase 1: Shared Types** (if needed)
   - Update types first
   - Push to main (no PR needed)
   - Publish new version

2. **Phase 2: Independent Implementation**
   - Worker A implements in their repo(s)
   - Worker B implements in their repo(s)
   - Both can work in parallel

3. **Phase 3: Integration**
   - Both merge to staging
   - PM validates integration
   - Promote to main when stable

### Handling True Dependencies

If work truly must be sequential:

1. **Create Phase 1 Issue**: Complete foundation work
2. **Create Phase 2 Issue**: Depends on Phase 1 being merged to **staging**
3. **Mark Phase 2 as blocked** until Phase 1 is in staging
4. **Document clearly**: "Requires [Issue] to be merged to staging first"

**Important**: Dependencies should be on **staging**, never on another worker's active branch.

---

## Issue Template Usage

### Template Sections - What to Include

#### 1. Summary

- **Audience**: Someone who's never seen this codebase
- **Content**: What, why, and expected outcome
- **Length**: 2-3 paragraphs maximum

#### 2. Background & Context

- **Project Overview**: Brief description of the overall application
- **This Repo's Role**: What this specific repository does
- **Current State**: What exists now
- **Desired State**: What should exist after completion

#### 3. Technical Specifications

- **Affected Files**: Every file that will be created/modified/deleted
- **Technology Requirements**: Specific versions and tools
- **Code Standards**: How code should be written
- **Dependencies**: What needs to be installed

#### 4. Implementation Details

- **Step-by-Step Tasks**: Numbered list of what to do
- **Code Examples**: Actual code snippets to follow
- **Architecture Decisions**: Why this approach
- **Integration Points**: How this connects to other parts

#### 5. Testing Requirements

- **Unit Tests**: What to test and how
- **Integration Tests**: E2E scenarios
- **Manual Testing**: Step-by-step checklist
- **Test Data**: Sample inputs and expected outputs

#### 6. Acceptance Criteria

- **Measurable**: Each criterion can be objectively verified
- **Complete**: Covers functionality, tests, docs, performance
- **Specific**: No ambiguous requirements

#### 7. Environment Setup

- **Prerequisites**: Tools and versions needed
- **Repository Setup**: Clone, install, configure
- **Running Locally**: How to start dev server and run tests

#### 8. Code Examples & Patterns

- **Before/After**: Show current vs. desired code
- **Patterns**: Reusable code patterns to follow
- **Anti-patterns**: What NOT to do

#### 9. Commit Message Requirements

- **Semantic Structure**: Required format
- **Examples**: Good and bad commits
- **Issue Linking**: How to reference this issue

### Customization Guidelines

**For Frontend Issues (job-finder-FE)**:

- Include component structure examples
- Show React patterns to follow
- Include UI/UX mockups if relevant
- Specify responsive design requirements
- Include accessibility requirements

**For Backend Issues (job-finder-BE)**:

- Include API contract examples
- Show Cloud Function structure
- Include Firebase configuration steps
- Specify security requirements
- Include rate limiting considerations

**For Worker Issues (job-finder-worker)**:

- Include queue processing examples
- Show scraping patterns
- Include data validation requirements
- Specify Firestore interaction patterns
- Include error handling for external APIs

**For Shared Types (job-finder-shared-types)**:

- Include complete type definitions
- Show usage examples in other repos
- Specify versioning strategy
- Include migration guide if breaking changes

---

## Tracking & Coordination

### Issue Lifecycle

```
[Created] → [Assigned] → [In Progress] → [PR Review] → [Merged] → [Closed]
```

#### State: Created

- Issue file committed to repository
- Listed in `PROJECT_TASK_LIST.md`
- Added to appropriate worker file

#### State: Assigned

- Worker acknowledges issue
- Worker updates their task file with start date
- Worker comments on issue: "Starting work on this"

#### State: In Progress

- Worker creates worktree (if not exists)
- Worker checks out their worker branch
- Worker makes commits with semantic structure
- Worker references issue in commits

#### State: PR Review

- Worker submits PR to staging
- PR description includes `Closes #[issue-number]`
- Worker comments on issue with PR link
- PM reviews within 24 hours

#### State: Merged

- PM merges PR to staging
- PM comments on issue: "Merged to staging"
- Worker updates their task file

#### State: Closed

- PM verifies functionality in staging
- PM updates `PROJECT_TASK_LIST.md`
- PM moves issue to `COMPLETED.md` if significant
- PM closes issue

### Cross-Repo Coordination

**Manager Issue Updates:**

PM maintains the manager repo issue with:

- Links to all repository issues
- Status of each repository's work
- Integration testing results
- Blockers or coordination needs

**Example Manager Issue Updates:**

```markdown
## Status Update - 2025-10-20

- ✅ job-finder-shared-types: Completed, v1.2.1 published
- 🔄 job-finder-BE: PR #45 in review
- 🔄 job-finder-FE: In progress, 60% complete
- ⏸️ job-finder-worker: Blocked until BE is in staging

## Integration Status

- Tested FE + BE together locally: ✅ Passing
- Remaining: Need worker integration test after BE merge
```

### PM Daily Workflow

**Morning (15 minutes)**:

1. Check all open issues for updates
2. Review worker task file updates
3. Identify any blockers
4. Update manager issues with status

**Throughout Day**:

1. Review PRs as they come in (<24h SLA)
2. Answer worker questions on issues
3. Coordinate cross-repo work if needed

**Evening (10 minutes)**:

1. Update `PROJECT_TASK_LIST.md`
2. Close completed issues
3. Plan next day's priorities

---

## Examples

### Example 1: Single-Repo Bug Fix

**Task**: Fix bundle size issue in frontend

**Repos Affected**: `job-finder-FE` only

**Process**:

1. Create manager issue: `issues/fe-bug-1-bundle-size-optimization.md`
2. Create repo issue: `job-finder-FE/docs/issues/fe-bug-1-bundle-size-optimization.md`
3. Populate repo issue with complete template
4. Update `PROJECT_TASK_LIST.md`
5. Update `CLAUDE_WORKER_B.md`
6. Assign to Worker B

**Manager Issue** (brief):

```markdown
# FE-BUG-1 — Bundle Size Optimization

**Status**: In Progress
**Owner**: Worker B
**Priority**: P1
**Affects**: job-finder-FE

## Repository Issues

- job-finder-FE: docs/issues/fe-bug-1-bundle-size-optimization.md

## Status

- 2025-10-20: Worker B started implementation
- Target: Main bundle < 500kb

## Acceptance

- [ ] Bundle size reduced to < 500kb
- [ ] No functionality regressions
```

**Repository Issue** (complete):

- Full template with all sections
- Complete code examples
- Exact file paths
- Step-by-step implementation
- Test requirements
- Acceptance criteria

### Example 2: Multi-Repo Feature

**Task**: Add skills field to job matches

**Repos Affected**:

- `job-finder-shared-types` (type definition)
- `job-finder-BE` (API endpoint)
- `job-finder-FE` (UI display)

**Process**:

1. **Create manager issue**: `issues/feat-skills-field.md`

   ```markdown
   # FEAT-1 — Add Skills Field to Job Matches

   **Affects**: shared-types, job-finder-BE, job-finder-FE

   ## Repository Issues

   - job-finder-shared-types: docs/issues/feat-1-skills-type.md
   - job-finder-BE: docs/issues/feat-1-skills-api.md
   - job-finder-FE: docs/issues/feat-1-skills-ui.md

   ## Sequencing

   1. Phase 1: shared-types (push to main, publish v1.3.0)
   2. Phase 2: BE and FE in parallel (both use v1.3.0+)

   ## Integration Test

   After both PRs merged to staging, verify skills display end-to-end
   ```

2. **Create shared-types issue** (complete standalone):
   - Full project context
   - Exact type definition to add
   - Version bump instructions
   - Publishing steps
   - How other repos will consume this

3. **Create BE issue** (complete standalone):
   - Full project context
   - Exact API changes needed
   - How to use shared-types v1.3.0+
   - Complete code examples
   - Test requirements
   - **Dependency**: "Requires @shared/types (monorepo root)"

4. **Create FE issue** (complete standalone):
   - Full project context
   - Exact UI components to modify
   - How to use shared-types v1.3.0+
   - Complete code examples
   - UI mockups
   - **Dependency**: "Requires @shared/types (monorepo root)"

5. **Update task files**:
   - `PROJECT_TASK_LIST.md`: Add all three items
   - `CLAUDE_WORKER_A.md`: Add BE issue if Worker A owns it
   - `CLAUDE_WORKER_B.md`: Add FE issue

### Example 3: Complex Migration

**Task**: Migrate generator functions from Portfolio to job-finder-BE

**Repos Affected**: `job-finder-BE`, `job-finder-FE`

**Process**:

1. **Create manager issue**: `issues/mig-2-generator-migration.md`

   ```markdown
   # MIG-2 — Generator & Content Services Port

   ## Repository Issues

   - job-finder-BE: docs/issues/mig-2-backend-generator.md
   - job-finder-FE: docs/issues/mig-2-frontend-generator-integration.md

   ## Sequencing

   1. Backend migration to staging (Worker B)
   2. Frontend integration PR (Worker B) - depends on step 1

   ## Coordination

   - Worker B owns both issues
   - Backend must be in staging before FE work starts
   ```

2. **Create BE issue** (complete):
   - Full migration instructions
   - Source file locations (include full code)
   - Destination file structure
   - How to adapt for job-finder context
   - All dependencies
   - Test requirements

3. **Create FE issue** (complete):
   - Full context on what generator does
   - How to update API client
   - Environment variable changes
   - How to test with local emulator
   - **Dependency**: "Requires MIG-2-BE merged to staging"
   - **Blocker**: Mark as blocked until dependency met

---

## Best Practices

### ✅ Do's

- **Do** write issues assuming zero prior knowledge
- **Do** include complete code examples
- **Do** specify exact file paths
- **Do** provide environment setup steps
- **Do** include test requirements
- **Do** make acceptance criteria measurable
- **Do** use semantic commit message format
- **Do** reference issues in all commits
- **Do** update issues with progress

### ❌ Don'ts

- **Don't** reference "the other repo" without providing full context
- **Don't** assume workers have access to multiple repos simultaneously
- **Don't** create issues that depend on another worker's active branch
- **Don't** use vague acceptance criteria ("make it better")
- **Don't** skip sections of the template
- **Don't** forget to link repository issues to manager issue
- **Don't** create issues without updating task tracking files

---

## Issue Template Location

**Template File**: `/home/jdubz/Development/job-finder-app-manager/docs/templates/ISSUE_TEMPLATE.md`

**Usage**:

```bash
# Copy template to create new issue
cp docs/templates/ISSUE_TEMPLATE.md [repo]/docs/issues/[task-id]-[description].md

# Edit with complete details
# Commit to repository
# Link in manager issue and task files
```

---

## Questions & Support

**If workers have questions about issues**:

1. Comment on the specific issue
2. Tag @PM for clarification
3. Don't proceed with assumptions

**If PM needs help writing issues**:

1. Review examples in this document
2. Check existing good issues in repos
3. Use the template as a checklist

---

**Last Updated**: 2025-10-19
**Owner**: Project Manager
**Status**: Active workflow
