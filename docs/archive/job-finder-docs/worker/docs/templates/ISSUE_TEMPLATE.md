# Issue Template - Detailed Standalone Format

> **Purpose**: This template ensures issues contain ALL necessary context for implementation without requiring access to other repositories or documentation.

---

## Issue Metadata

```yaml
Title: [TYPE-ID] — [Brief Description]
Labels: [priority-p0/p1/p2/p3, repository-[name], type-[type], status-todo]
Assignee: [Worker A / Worker B / PM]
Priority: [P0-Critical / P1-High / P2-Medium / P3-Low]
Estimated Effort: [hours/days]
Repository: [job-finder-worker / job-finder-FE / job-finder-BE / job-finder-shared-types]
```

**Examples of Issue IDs:**

- `FE-BUG-1` — Frontend bug fix
- `BE-SEC-1` — Backend security task
- `DATA-QA-1` — Data quality assurance
- `MIG-2` — Migration task
- `AUTH-UX-1` — Authentication UX improvement

---

## Summary

**One-paragraph description** of what needs to be done and why. Assume the reader has never seen this codebase before.

**Example:**

> The application currently loads all components synchronously, resulting in a 754kb main bundle that slows initial page load. We need to implement route-based code splitting and lazy loading to reduce the main bundle below 500kb, improving performance and user experience.

---

## Background & Context

### Project Overview

**Application Name**: Job Finder Application
**Technology Stack**: [React/TypeScript, Python, Firebase, etc.]
**Architecture**: [Brief architecture description relevant to this task]

### This Repository's Role

[Explain what this specific repository does and how it fits in the overall system]

**Example for job-finder-FE:**

> This repository contains the React/TypeScript frontend application that provides the user interface for the Job Finder platform. It communicates with Firebase Cloud Functions for backend operations and uses Firebase Authentication for user management.

### Current State

[Describe the current implementation or problem state]

**Example:**

> The application currently:
>
> - Loads all routes and components at initial page load
> - Has no code splitting configured
> - Produces a single 754kb main chunk
> - Takes 3-5 seconds for initial load on 3G connections

### Desired State

[Describe what should exist after this issue is complete]

**Example:**

> After completion:
>
> - Route components load on-demand via React.lazy()
> - Main bundle is under 500kb
> - Heavy libraries (Firebase, chart libraries) are code-split
> - Initial page load takes <2 seconds on 3G

---

## Technical Specifications

### Affected Files

List all files that will be created, modified, or deleted:

```
CREATE:
- [path/to/new/file.ts] - [purpose]

MODIFY:
- [path/to/existing/file.ts] - [what changes]

DELETE:
- [path/to/old/file.ts] - [why removing]
```

### Technology Requirements

**Languages**: [TypeScript, Python, etc.]
**Frameworks**: [React 18+, Firebase SDK 10+, etc.]
**Tools**: [Vite, ESLint, etc.]
**Dependencies**: [List any new dependencies needed]

### Code Standards

**Naming Conventions**: [Describe naming patterns]
**File Organization**: [Where files should go]
**Import Style**: [How to import modules]
**Type Safety**: [TypeScript requirements]

---

## Implementation Details

### Step-by-Step Tasks

1. **[Task Name]**
   - Description: [What to do]
   - Files: [Which files to modify]
   - Code example:
     ```typescript
     // Example of what the code should look like
     ```
   - Validation: [How to verify this step works]

2. **[Next Task]**
   - [Same structure...]

### Architecture Decisions

**Why this approach:**
[Explain the reasoning behind the technical approach]

**Alternatives considered:**

- [Alternative 1]: [Why not chosen]
- [Alternative 2]: [Why not chosen]

### Dependencies & Integration

**Internal Dependencies:**

- Depends on: [Other files/modules in this repo]
- Consumed by: [What uses this code]

**External Dependencies:**

- APIs: [External API endpoints used]
- Services: [Third-party services]
- Other Repos: [If this requires coordination with other repos]

---

## Testing Requirements

### Test Coverage Required

**Unit Tests:**

```typescript
// Example test structure
describe("[Feature/Component]", () => {
  it("should [behavior]", () => {
    // Test code example
  });
});
```

**Integration Tests:**

- [Scenario 1]: [What to test]
- [Scenario 2]: [What to test]

**E2E Tests (if applicable):**

- [User flow 1]: [Expected behavior]

### Manual Testing Checklist

**Use checkbox format for all testing items:**

- [ ] Test in local development environment
- [ ] Test in staging environment
- [ ] Test in production environment (if safe)
- [ ] Test on Chrome/Firefox/Safari
- [ ] Test on mobile viewport
- [ ] Test with slow network (DevTools throttling)
- [ ] Test error scenarios
- [ ] Test edge cases

### Test Data

**Sample inputs:**

```json
{
  "example": "data structure",
  "for": "testing"
}
```

**Expected outputs:**

```json
{
  "expected": "result"
}
```

---

## Acceptance Criteria

**IMPORTANT: Use checkbox format for all acceptance criteria to enable progress tracking**

Clear, testable criteria that define "done":

- [ ] **[Criteria 1]**: [Specific, measurable requirement]
- [ ] **[Criteria 2]**: [Another requirement]
- [ ] **All tests pass**: Unit, integration, and E2E tests all green
- [ ] **Code review approved**: PR has been reviewed and approved
- [ ] **Documentation updated**: README, comments, and relevant docs updated
- [ ] **No console errors**: Browser console shows no errors or warnings
- [ ] **Performance validated**: [Specific performance metrics met]

**Checkbox Format Guidelines:**

- **Always use `- [ ]` format** for acceptance criteria
- **Enables progress tracking** in GitHub issues
- **Workers can check off items** as they complete them
- **PM can see progress** at a glance

---

## Environment Setup

### Prerequisites

```bash
# Required tools and versions
Node.js: v18+
npm: v9+
Python: 3.11+
# etc.
```

### Repository Setup

```bash
# Clone and setup (if starting fresh)
git clone [repo-url]
cd [repo-name]

# Install dependencies
npm install
# or
pip install -r requirements.txt

# Environment variables needed
cp .env.example .env
# Edit .env with these required values:
VITE_FIREBASE_API_KEY=[value]
VITE_FIREBASE_PROJECT_ID=[value]
```

### Running Locally

```bash
# Start development server
npm run dev

# Run tests
npm test

# Run linter
npm run lint
```

---

## Code Examples & Patterns

### Example Implementation

**Before:**

```typescript
// Current problematic code
import { HeavyComponent } from './components/HeavyComponent';

function App() {
  return <HeavyComponent />;
}
```

**After:**

```typescript
// Improved code with lazy loading
import { lazy, Suspense } from 'react';

const HeavyComponent = lazy(() => import('./components/HeavyComponent'));

function App() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <HeavyComponent />
    </Suspense>
  );
}
```

### Patterns to Follow

**Pattern 1: [Name]**

```typescript
// Code example showing the pattern
```

Why use this: [Explanation]

**Pattern 2: [Name]**

```typescript
// Another pattern example
```

Why use this: [Explanation]

---

## Security & Performance Considerations

### Security

**Use checkbox format for all security items:**

- [ ] No hardcoded secrets or API keys
- [ ] Input validation for all user data
- [ ] SQL injection prevention (if database queries)
- [ ] XSS prevention (if rendering user content)
- [ ] Authentication/authorization checks
- [ ] CORS configuration (if API endpoints)

### Performance

**Use checkbox format for all performance items:**

- [ ] Bundle size impact: [Estimated change]
- [ ] Memory usage: [Considerations]
- [ ] Database query optimization (if applicable)
- [ ] Caching strategy (if applicable)
- [ ] Network request optimization

### Error Handling

```typescript
// Example error handling pattern
try {
  // Operation
} catch (error) {
  // Proper error handling with logging
  console.error("Context about what failed", error);
  // User-friendly error message
  throw new Error("User-facing error message");
}
```

---

## Documentation Requirements

### Code Documentation

**Use checkbox format for all documentation items:**

- [ ] All functions have JSDoc/docstring comments
- [ ] Complex logic has inline comments
- [ ] Type definitions are documented
- [ ] Public APIs are fully documented

### README Updates

**Use checkbox format for all README items:**

Update repository README.md with:

- [ ] New feature documentation (if applicable)
- [ ] Setup instructions (if changed)
- [ ] API documentation (if endpoints added)
- [ ] Configuration options (if added)

### Migration Guides

**Use checkbox format for all migration items:**

If this changes existing behavior:

- [ ] Document what changed
- [ ] Provide migration steps
- [ ] List breaking changes

---

## Commit Message Requirements

All commits for this issue must use **semantic commit structure**:

```
<type>(<scope>): <short description>

<detailed description>

Closes #<issue-number>
```

### Commit Types

- `feat:` - New feature
- `fix:` - Bug fix
- `refactor:` - Code refactoring (no behavior change)
- `perf:` - Performance improvement
- `test:` - Adding or updating tests
- `docs:` - Documentation changes
- `chore:` - Maintenance tasks
- `style:` - Code style changes (formatting)
- `ci:` - CI/CD changes
- `build:` - Build system changes

### Commit Scope Examples

- `(auth)` - Authentication related
- `(ui)` - User interface
- `(api)` - API changes
- `(db)` - Database changes
- `(config)` - Configuration changes

### Example Commits

**Good commits:**

```
feat(bundle): implement lazy loading for route components

Add React.lazy() and Suspense to all route components, reducing
main bundle from 754kb to 420kb. Includes loading fallbacks and
error boundaries.

Closes #123
```

```
fix(auth): resolve Firebase auth redirect loop

Fixed issue where auth state listener wasn't properly cleaning up,
causing infinite redirects on logout. Added proper cleanup in useEffect.

Closes #124
```

**Bad commits:**

```
update stuff
fixed bug
wip
```

---

## PR Checklist

**Use checkbox format for all PR checklist items:**

When submitting the PR for this issue:

- [ ] PR title matches issue title
- [ ] PR description references issue: `Closes #[issue-number]`
- [ ] All acceptance criteria met
- [ ] All tests pass locally
- [ ] No linter errors or warnings
- [ ] Code follows project style guide
- [ ] Self-review completed
- [ ] Screenshots attached (for UI changes)
- [ ] Performance metrics included (if applicable)
- [ ] Breaking changes documented
- [ ] Migration guide included (if breaking changes)

---

## Timeline & Milestones

**Estimated Effort**: [X hours/days]
**Target Completion**: [Date or relative timeframe]
**Dependencies**: [Must wait for...]
**Blocks**: [Other issues waiting for this]

**Milestones:**

1. [Milestone 1]: [What's complete] - [Target date]
2. [Milestone 2]: [What's complete] - [Target date]

---

## Resources & References

### Documentation Links

- [Relevant official docs]
- [Related Stack Overflow answers]
- [Design documents]
- [RFCs or proposals]

### Related Issues

- [Issue #X]: [How it relates]
- [Issue #Y]: [How it relates]

### Additional Context

- Original bug report: [Link]
- User feedback: [Link]
- Design mockups: [Link]
- Performance baseline: [Link]

---

## Success Metrics

How we'll measure success:

- **Performance**: Main bundle < 500kb (currently 754kb)
- **Load Time**: Initial load < 2s on 3G (currently 3-5s)
- **Test Coverage**: Maintain 80%+ coverage
- **Code Quality**: 0 new linter errors
- **User Impact**: [Metric to track]

---

## Rollback Plan

If this change causes issues:

1. **Immediate rollback**:

   ```bash
   git revert [commit-hash]
   git push origin [branch]
   ```

2. **Identify issue**:
   - Check error logs
   - Review monitoring dashboards
   - Gather user reports

3. **Fix forward or keep rolled back**:
   - Decision criteria: [When to fix vs. rollback]

---

## Questions & Clarifications

**If you need clarification during implementation:**

1. **Add a comment** to this issue with:
   - What's unclear
   - What you've tried
   - Proposed solution

2. **Tag the PM** for guidance: @[PM-username]

3. **Don't assume** - always ask if requirements are ambiguous

---

## Issue Lifecycle

```
TODO → IN PROGRESS → REVIEW → DONE
```

**Update this issue**:

- When starting work: Add `status-in-progress` label
- When PR is ready: Add `status-review` label and PR link
- When merged: Add `status-done` label and close issue

**PR must reference this issue**:

- Use `Closes #[issue-number]` in PR description
- Link to this issue in all commit messages

---

**Created**: [Date]
**Created By**: [PM]
**Priority Justification**: [Why this priority level]
**Last Updated**: [Date]
