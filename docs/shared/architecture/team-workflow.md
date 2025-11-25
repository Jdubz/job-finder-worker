# Team Workflow and Collaboration

> Status: Active
> Owner: @jdubz
> Last Updated: 2025-11-25

## Overview

This document defines the team workflow, collaboration patterns, and best practices for the job-finder-bot project. It covers issue management, code quality standards, and communication protocols.

## Project Structure

```
job-finder-bot/
├── src/              # Core application code
├── tests/            # Test suite
├── docs/             # Documentation
├── scripts/          # Automation scripts
└── .github/          # GitHub configuration
```

## Team Roles

### Developer

- **Primary Branch:** `bot`
- **Responsibilities:**
  - Select and implement issues
  - Write tests for all code
  - Document complex logic
  - Review code changes
  - Maintain code quality standards

## Workflow Process

### Issue-Based Development

All work is tracked through GitHub issues:

- **Issue Creation:** Use issue templates for bugs, features, and tasks
- **Issue Selection:** Select issues based on priority and expertise
- **Issue Status:** Update labels to reflect current status
- **Issue References:** Link commits and PRs to issues

### Issue Status Lifecycle

```
To Do → In Progress → Review → Done
```

**Status labels:**

- `status-todo` - Issue ready to start
- `status-in-progress` - Active development
- `status-review` - Code review in progress
- `status-done` - Completed and merged

### Development Workflow

1. **Select Issue** from To Do column
2. **Update Status** to In Progress
3. **Create Branch** (optional, for larger features)
4. **Implement Changes** with tests and documentation
5. **Self-Review** code before committing
6. **Commit Changes** using semantic commit format
7. **Push to Repository** regularly
8. **Create Pull Request** when ready for review
9. **Address Feedback** from code review
10. **Merge to Main** after approval

## Commit Standards

### Semantic Commit Format

Required format for all commits:

```
<type>(<scope>): <short description>

<detailed description>

Closes #<issue-number>
```

### Commit Types

- `feat:` - New feature
- `fix:` - Bug fix
- `refactor:` - Code refactoring
- `perf:` - Performance improvement
- `test:` - Test updates
- `docs:` - Documentation
- `chore:` - Maintenance
- `ci:` - CI/CD changes

### Commit Scopes

- `(scraper)` - Web scraping functionality
- `(parser)` - Content parsing
- `(storage)` - Data storage
- `(config)` - Configuration
- `(cli)` - Command-line interface
- `(tests)` - Testing infrastructure

### Examples

```bash
feat(scraper): add LinkedIn job scraper

Implement LinkedIn job scraper with rate limiting
and error handling. Supports basic job search queries.

Closes #42

---

fix(parser): handle missing job description field

Add null check for job description to prevent crashes
when parsing incomplete job postings.

Closes #56

---

docs(readme): update installation instructions

Add Python version requirements and virtual environment
setup steps to README.

Closes #23
```

## Code Quality Standards

### Automated Quality Checks

All code must pass automated checks before merge:

- **Linting:** Code style and formatting (flake8, black)
- **Type Checking:** Static type analysis (mypy)
- **Tests:** Unit and integration tests (pytest)
- **Coverage:** Minimum test coverage requirements

### Git Hooks

Pre-commit and pre-push hooks enforce quality:

```bash
# Setup git hooks
pip install pre-commit
pre-commit install
pre-commit install --hook-type pre-push
```

### Critical Rules

**NEVER bypass git hooks:**

- `git commit --no-verify` is FORBIDDEN
- `git push --no-verify` is FORBIDDEN

**Why:**

- Prevents broken code from entering repository
- Maintains consistent code quality
- Reduces review time and rework
- Catches errors before CI/CD

**If a hook fails:**

1. Read the error message carefully
2. Fix the underlying issue
3. Commit/push again with fixes
4. Do NOT bypass the check

## Pull Request Process

### Creating Pull Requests

1. **Title:** Clear, descriptive title
2. **Description:** Use PR template
3. **Link Issues:** Reference related issues
4. **Labels:** Apply appropriate labels
5. **Reviewers:** Request review if needed
6. **Tests:** Ensure all tests pass
7. **Documentation:** Update docs as needed

### PR Template Checklist

- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated
- [ ] Tests added/updated
- [ ] All tests passing
- [ ] No new warnings

### Code Review

**Reviewer responsibilities:**

- Review within 24 hours
- Provide constructive feedback
- Check for logic errors
- Verify test coverage
- Ensure documentation updated
- Approve when ready

**Author responsibilities:**

- Respond to feedback promptly
- Address all comments
- Re-request review after changes
- Resolve merge conflicts

## Issue Management

### Issue Templates

Use appropriate template:

- **Bug Report:** For defects and errors
- **Feature Request:** For new functionality
- **Task:** For general work items

### Issue Labels

Apply labels for organization:

- **Priority:** `priority-p0` through `priority-p3`
- **Type:** `bug`, `enhancement`, `task`, `documentation`
- **Status:** `status-todo`, `status-in-progress`, `status-review`, `status-done`
- **Component:** `scraper`, `parser`, `storage`, `config`, `tests`

### Acceptance Criteria

Use checkbox format in issues:

```markdown
## Acceptance Criteria
- [ ] Criterion 1 completed
- [ ] Criterion 2 completed
- [ ] Tests written
- [ ] Documentation updated
```

## Communication Protocols

### Issue Comments

Use issue comments for:

- Status updates
- Questions and clarifications
- Technical discussions
- Linking related issues/PRs

### Commit Messages

Commit messages should:

- Explain what changed and why
- Reference issue numbers
- Follow semantic commit format
- Be clear and concise

### PR Descriptions

PR descriptions should:

- Summarize changes
- Link to related issues
- Describe testing performed
- Highlight breaking changes
- Include screenshots if UI changes

## Best Practices

### Code Quality

- **Clean Code:** Readable, maintainable, well-structured
- **DRY Principle:** Don't repeat yourself
- **SOLID Principles:** Follow object-oriented design principles
- **Test Coverage:** Aim for high test coverage
- **Documentation:** Document complex logic and APIs

### Version Control

- **Commit Frequently:** Small, atomic commits
- **Pull Before Push:** Stay synchronized with remote
- **Meaningful Messages:** Clear commit messages
- **Reference Issues:** Link commits to issues
- **Clean History:** Avoid unnecessary merge commits

### Testing

- **Unit Tests:** Test individual functions and methods
- **Integration Tests:** Test component interactions
- **Test Coverage:** Maintain high code coverage
- **Test Documentation:** Document test purposes
- **Continuous Testing:** Run tests locally before pushing

### Documentation

- **Code Comments:** Explain complex logic
- **Docstrings:** Document functions and classes
- **README:** Keep README current
- **Changelog:** Document changes
- **Architecture Docs:** Maintain system documentation

## Collaboration Patterns

### Multi-Agent Workflow

When working with automation or multiple contributors:

- **Commit frequently** (every 15-30 minutes)
- **Pull before starting work** to get latest changes
- **Use descriptive commit messages** for clarity
- **Push regularly** to share progress
- **Coordinate via issues** for related work
- **Communicate changes** that affect others

### Conflict Resolution

If merge conflicts occur:

1. Pull latest changes
2. Identify conflicting sections
3. Resolve conflicts manually
4. Test thoroughly after resolution
5. Commit resolved changes
6. Push to remote

### Knowledge Sharing

- Document learnings in issues
- Share insights in PR descriptions
- Update documentation with discoveries
- Create guides for complex processes

## Quality Gates

### Pre-Commit

- Code formatting (black)
- Linting (flake8)
- Import sorting (isort)

### Pre-Push

- Type checking (mypy)
- Unit tests (pytest)
- Test coverage checks

### Pre-Merge

- All tests passing
- Code review approved
- Documentation updated
- No merge conflicts
- Semantic commits verified

## Success Metrics

### Code Quality

- All tests passing
- High test coverage (>80%)
- No critical linting issues
- Type checking passes
- Documentation complete

### Workflow Efficiency

- Issues updated regularly
- PRs reviewed within 24 hours
- Quick turnaround on feedback
- Minimal merge conflicts
- Clean git history

### Collaboration

- Clear communication
- Timely responses
- Constructive feedback
- Knowledge sharing
- Process improvements

## Summary

Effective team workflow requires:

- **Issue-based development** - All work tracked in issues
- **Quality standards** - Automated checks enforced
- **Clear communication** - Issues, commits, PRs documented
- **Regular commits** - Frequent, atomic commits
- **Code review** - Peer review before merge
- **Continuous improvement** - Regular process refinement

Following these patterns ensures consistent, high-quality development and smooth collaboration.
