# Workflow Update - October 19, 2025

## Summary of Changes

This document summarizes the major workflow and task tracking updates implemented on October 19, 2025.

---

## Key Changes

### 1. Detailed Issue Creation in All Affected Repositories

**Previous Workflow:**

- PM created issues in manager repository only
- Workers referenced tasks from central task list
- Limited context available in repository-specific work

**New Workflow:**

- **PM creates standalone issues in EVERY affected repository**
- Each repository issue contains complete, self-contained context
- Workers can complete tasks with access to only one repository
- Issues include all necessary code examples, file paths, and requirements

**Benefits:**

- **Worker Independence**: Workers can work in isolated environments
- **Complete Context**: All information needed is in the issue itself
- **Better Onboarding**: New developers can understand tasks without deep codebase knowledge
- **Improved Auditability**: Complete history of decisions within each issue

---

### 2. Mandatory Semantic Commit Structure

**Previous Workflow:**

- Commit messages were freeform
- Inconsistent format across commits
- Issue references were optional

**New Workflow:**

- **All commits MUST use semantic commit structure**
- Format: `<type>(<scope>): <short description>\n\n<detailed description>\n\nCloses #<issue-number>`
- Issue reference is mandatory in every commit
- Standardized commit types and scopes

**Commit Format:**

```
<type>(<scope>): <short description>

<detailed description>

Closes #<issue-number>
```

**Commit Types:**

- `feat:` - New feature
- `fix:` - Bug fix
- `refactor:` - Code refactoring
- `perf:` - Performance improvement
- `test:` - Adding/updating tests
- `docs:` - Documentation
- `chore:` - Maintenance
- `style:` - Code style (formatting)
- `ci:` - CI/CD changes
- `build:` - Build system changes

**Benefits:**

- **Consistent History**: Easy to scan git log for specific changes
- **Automated Tooling**: Enables changelog generation and versioning
- **Clear Intent**: Type and scope make purpose immediately clear
- **Issue Tracking**: Every commit linked to its issue

---

### 3. Issue Completion Workflow

**New Step-by-Step Process:**

1. **Find Issue**: Check task list for repository-specific issue link
2. **Read Complete Issue**: All context is in the issue file
3. **Start Work**: Comment on issue, navigate to worktree, sync with staging
4. **Implement with Semantic Commits**: Make regular commits following format
5. **Verify Acceptance Criteria**: Check all criteria before submitting PR
6. **Create Pull Request**: Reference issue with "Closes #[number]"
7. **Address Review Feedback**: Make changes, commit with semantic format
8. **After Merge**: Update task list, sync worker branch with staging

**Benefits:**

- **Clear Process**: Workers know exact steps to follow
- **Quality Gates**: Acceptance criteria verification before PR
- **Traceability**: Every commit and PR linked to its issue

---

## Updated Documentation

### New Documents Created

1. **`docs/templates/ISSUE_TEMPLATE.md`**
   - Comprehensive issue template for all repositories
   - 30+ sections covering every aspect of a task
   - Ensures complete, standalone context in each issue

2. **`docs/templates/ISSUE_EXAMPLE_FRONTEND_BUG.md`**
   - Real-world example demonstrating template usage
   - Shows how to populate each section
   - Reference for creating high-quality issues

3. **`docs/processes/PM_ISSUE_CREATION_WORKFLOW.md`**
   - Complete PM workflow for issue creation
   - Multi-repository issue coordination strategy
   - Examples and best practices

### Updated Documents

1. **`CLAUDE_WORKER_A.md`**
   - Added semantic commit requirements section
   - Added issue completion workflow section
   - Included commit examples and anti-patterns

2. **`CLAUDE_WORKER_B.md`**
   - Added semantic commit requirements section
   - Added issue completion workflow section
   - Included frontend-specific commit examples

3. **`CLAUDE_SHARED.md`**
   - Added semantic commit requirements for both workers
   - Updated GitHub automation requirements
   - Clarified issue reference mandates

---

## Issue Template Structure

### Template Sections

1. **Issue Metadata**: Title, labels, assignee, priority, effort
2. **Summary**: One-paragraph description
3. **Background & Context**: Project overview, current state, desired state
4. **Technical Specifications**: Files affected, technology requirements, code standards
5. **Implementation Details**: Step-by-step tasks, architecture decisions, dependencies
6. **Testing Requirements**: Unit, integration, E2E tests, manual testing checklist
7. **Acceptance Criteria**: Clear, testable requirements
8. **Environment Setup**: Prerequisites, repository setup, running locally
9. **Code Examples & Patterns**: Before/after examples, patterns to follow
10. **Security & Performance Considerations**: Checklists and guidelines
11. **Documentation Requirements**: Code docs, README updates, migration guides
12. **Commit Message Requirements**: Semantic structure with examples
13. **PR Checklist**: Complete checklist for PR submission
14. **Timeline & Milestones**: Effort estimate, dependencies, milestones
15. **Resources & References**: Links, related issues, additional context
16. **Success Metrics**: Measurable success criteria
17. **Rollback Plan**: Recovery procedures if issues arise
18. **Questions & Clarifications**: How to get help
19. **Issue Lifecycle**: State transitions

### Key Principles

- **Standalone Context**: Assume no access to other repositories
- **Complete Information**: Include all code examples, file paths, commands
- **Measurable Criteria**: Every acceptance criterion is testable
- **Real Code**: Use actual code snippets, not pseudocode
- **Environment Details**: Full setup instructions from scratch

---

## PM Workflow Changes

### Issue Creation Process

1. **Identify Affected Repositories**
   - Determine which repositories need changes
   - Each affected repository gets its own issue

2. **Create Master Issue in Manager Repo**
   - Coordination and cross-repository tracking
   - Links to all repository-specific issues

3. **Create Repository-Specific Issues**
   - Use detailed template for each repository
   - Complete, standalone context for each
   - No dependencies on other repositories

4. **Link Issues Together**
   - Manager issue links to repository issues
   - Repository issues reference manager issue for context

5. **Update Task Tracking Files**
   - Update `PROJECT_TASK_LIST.md`
   - Update appropriate worker file
   - Link to both manager and repository issues

### Multi-Repository Coordination

**Strategy:**

- Create **independent issues** that can be completed in any order
- Use **staging** as the integration point, not worker branches
- Phase work when true dependencies exist (e.g., shared-types first)

**Example Sequencing:**

1. **Phase 1**: Update shared-types (no dependencies)
2. **Phase 2**: Backend and Frontend in parallel (both use published types)
3. **Phase 3**: Integration testing after both merged to staging

---

## Worker Workflow Changes

### Daily Workflow Updates

**Previous:**

1. Check task list
2. Start work
3. Make commits
4. Submit PR

**New:**

1. Check task list for issue link
2. **Read complete repository issue** (all context included)
3. **Comment on issue** when starting
4. Work in worktree on worker branch
5. **Make commits with semantic structure**
6. **Reference issue in every commit**
7. **Verify acceptance criteria** before PR
8. Submit PR with "Closes #[issue-number]"
9. **Comment on issue** with PR link
10. Address feedback with semantic commits
11. **Update task list** after merge

### Commit Workflow

**Every Commit Must:**

- Use semantic type (feat, fix, refactor, etc.)
- Include descriptive scope
- Have short description (50 chars max)
- Include detailed description
- Reference issue: "Closes #[issue-number]"

**Example:**

```bash
git commit -m "feat(bundle): implement lazy loading for routes

Added React.lazy() and Suspense to all route components.
Reduced main bundle from 754kb to 420kb with route-based
code splitting. Includes loading fallbacks and error
boundaries for graceful failure handling.

Closes #42"
```

---

## Benefits of New Workflow

### For Workers

✅ **Complete Context**: Everything needed is in one issue
✅ **Independence**: Can work without accessing other repositories
✅ **Clear Expectations**: Detailed acceptance criteria and examples
✅ **Better Commits**: Structured format improves clarity
✅ **Traceability**: Every commit linked to its issue

### For PM

✅ **Quality Control**: Detailed issues ensure consistent quality
✅ **Better Tracking**: Semantic commits enable better project insights
✅ **Easier Reviews**: Clear commit messages speed up reviews
✅ **Documentation**: Issues serve as permanent documentation
✅ **Onboarding**: New developers can understand work from issues alone

### For Project

✅ **Better History**: Semantic commits create readable git log
✅ **Automated Tools**: Enables changelog generation, version bumping
✅ **Knowledge Preservation**: Complete context preserved in issues
✅ **Audit Trail**: Clear chain from task to issue to commit to PR
✅ **Scalability**: Process works as team grows

---

## Migration to New Workflow

### Immediate Actions

**PM:**

- ✅ Review updated documentation
- ✅ Use new issue template for all new tasks
- ✅ Create repository-specific issues going forward
- ✅ Reference new workflow in task assignments

**Workers:**

- ✅ Read updated worker context files
- ✅ Use semantic commit structure for all new commits
- ✅ Reference issues in all commits
- ✅ Follow issue completion workflow

### Existing Work

- **Existing PRs**: Can continue with old commit style
- **New Commits**: Must use semantic structure
- **New Issues**: All new issues use detailed template

---

## Examples and References

### Quick Reference Documents

**Issue Creation:**

- Template: `docs/templates/ISSUE_TEMPLATE.md`
- Example: `docs/templates/ISSUE_EXAMPLE_FRONTEND_BUG.md`
- Workflow: `docs/processes/PM_ISSUE_CREATION_WORKFLOW.md`

**Commit Messages:**

- See semantic commit section in worker context files
- Examples in shared context
- Anti-patterns clearly documented

**Worker Instructions:**

- Worker A: `CLAUDE_WORKER_A.md` (updated sections)
- Worker B: `CLAUDE_WORKER_B.md` (updated sections)
- Shared: `CLAUDE_SHARED.md` (updated sections)

### Example Semantic Commits

```bash
# Feature
feat(api): add job skills extraction endpoint

# Bug Fix
fix(bundle): resolve lazy loading race condition

# Refactor
refactor(db): extract Firestore queries to service layer

# Performance
perf(scraper): implement concurrent job scraping

# Tests
test(api): add integration tests for skills endpoint

# Documentation
docs(readme): update installation instructions

# Chore
chore(deps): upgrade Firebase SDK to v10.5.0
```

---

## Training and Support

### For New Workers

1. **Read Updated Context Files**
   - Start with your worker context file
   - Review shared context
   - Understand issue completion workflow

2. **Study Example Issue**
   - Review `ISSUE_EXAMPLE_FRONTEND_BUG.md`
   - See how template sections are populated
   - Understand level of detail required

3. **Practice Semantic Commits**
   - Use examples from context files
   - Ask for feedback on early commits
   - Review commit history for good examples

### For PM

1. **Master Issue Template**
   - Review template thoroughly
   - Understand each section's purpose
   - Practice with example issue

2. **Issue Creation Workflow**
   - Follow `PM_ISSUE_CREATION_WORKFLOW.md`
   - Start with single-repo issues to practice
   - Move to multi-repo coordination

3. **Quality Checklist**
   - Verify issues are truly standalone
   - Check all code examples are complete
   - Ensure acceptance criteria are measurable

---

## Success Metrics

### Workflow Adoption

Track these metrics to measure success:

- **Issue Quality**: % of issues that require no clarification questions
- **Commit Compliance**: % of commits following semantic structure
- **First-Time PR Success**: % of PRs approved without major revisions
- **Context Completeness**: Workers can complete tasks without asking questions

### Goals

- **Week 1**: 80% semantic commit compliance
- **Week 2**: 90% semantic commit compliance
- **Week 3**: 95%+ semantic commit compliance, standard practice
- **Month 1**: All new issues use detailed template
- **Month 2**: Issue quality metrics show minimal clarification needs

---

## Troubleshooting

### Common Issues

**Issue: Workers ask clarification questions**

- **Solution**: Review issue template completeness, add missing context

**Issue: Commits don't follow semantic structure**

- **Solution**: PR reviews enforce format, provide examples

**Issue: Issues too long/complex**

- **Solution**: Break into smaller tasks, each with own issue

**Issue: Multi-repo coordination confusion**

- **Solution**: Use manager issue to document sequencing clearly

---

## Feedback and Iteration

### Continuous Improvement

This workflow will evolve based on:

- Worker feedback on issue clarity
- PM experience creating detailed issues
- Success metrics tracking
- Pain points identified during work

### Providing Feedback

**Workers:**

- Comment on issues when context is unclear
- Suggest improvements to template sections
- Share examples of particularly helpful issues

**PM:**

- Document common clarification questions
- Update template based on patterns
- Refine examples and best practices

---

## Conclusion

This workflow update establishes a robust foundation for:

- **Better Communication**: Complete context in every issue
- **Higher Quality**: Semantic commits and detailed requirements
- **Faster Onboarding**: New team members can understand work independently
- **Improved Traceability**: Clear chain from task to completion
- **Scalable Process**: Works as team and project grow

The investment in detailed issues and structured commits pays dividends through reduced confusion, faster reviews, and better project documentation.

---

**Effective Date**: October 19, 2025
**Document Owner**: Project Manager
**Last Updated**: October 19, 2025
**Review Schedule**: Monthly for first quarter, quarterly thereafter
