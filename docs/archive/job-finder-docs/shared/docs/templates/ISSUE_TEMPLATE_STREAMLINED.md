# [TASK-ID] — [Brief Description]

> **Context**: See repository-specific `ISSUE_CONTEXT.md` for project overview, tech stack, development environment, and common patterns.
> **Architecture**: See relevant architecture documentation referenced below.

---

## Issue Metadata

```yaml
Title: [TASK-ID] — [Brief Description]
Labels: [priority-p0/p1/p2/p3, repository-[name], type-[type], status-todo]
Assignee: [Worker A / Worker B]
Priority: [P0-Critical / P1-High / P2-Medium / P3-Low]
Estimated Effort: [hours/days]
Repository: [job-finder-worker / job-finder-FE / job-finder-BE / job-finder-shared-types]
```

---

## Summary

**Problem**: [One paragraph describing what needs to be fixed or built]

**Goal**: [One sentence describing the desired outcome]

**Impact**: [Who/what is affected and why this matters]

---

## Architecture References

> **📚 Read these docs first for context:**

- **[ISSUE_CONTEXT.md](./ISSUE_CONTEXT.md)** - Project overview, tech stack, development setup
- **[relevant-architecture-doc.md](../relevant-architecture-doc.md)** - Specific system being modified
- **[CLAUDE.md](../../CLAUDE.md)** - Repository overview for AI assistants

**Key concepts to understand**:

- [Concept 1]: [Where to read about it]
- [Concept 2]: [Where to read about it]

---

## Tasks

### Phase 1: [Phase Name]

1. **[Task Name]**
   - What: [Brief description]
   - Where: `path/to/file.py:line` or `path/to/new/file.py` (create)
   - Why: [Rationale]
   - Test: [How to verify]

2. **[Next Task]**
   - [Same structure...]

### Phase 2: [Phase Name]

3. **[Task Name]**
   - [Structure...]

---

## Technical Details

### Files to Modify/Create

```
MODIFY:
- path/to/existing/file.py:line-range - [What changes]

CREATE:
- path/to/new/file.py - [Purpose]
- path/to/new/test.py - [Test coverage]

REFERENCE:
- path/to/related/file.py - [Why relevant]
```

### Key Implementation Notes

**[Subsystem/Component Name]**:

```python
# Code example or pseudocode showing approach
def example_function(param: str) -> Result:
    # Implementation guidance
    pass
```

**Integration Points**:

- [System A]: [How this change affects it]
- [System B]: [How this change affects it]

---

## Acceptance Criteria

- [ ] **[Criterion 1]**: [Specific, testable requirement]
- [ ] **[Criterion 2]**: [Another requirement]
- [ ] **All tests pass**: Run `pytest` or `npm test`
- [ ] **Code follows standards**: Formatting and linting pass
- [ ] **Documentation updated**: Relevant docs reflect changes

---

## Testing

### Test Commands

```bash
# Unit tests
[test command for specific files]

# Integration tests
[integration test command]

# Full suite
[full test suite command]
```

### Manual Testing

```bash
# Step 1: [Action]
[command or steps]

# Step 2: [Verification]
[what to check]

# Step 3: [Validation]
[expected outcome]
```

---

## Commit Message Template

```
[type]([scope]): [short description]

[Detailed description of changes made]

Key changes:
- [Change 1]
- [Change 2]

Testing:
- [How it was tested]

Closes #[issue-number]
```

**Example**:

```
fix(queue): implement URL normalization for duplicate detection

Added url_normalizer module with comprehensive normalization logic
including tracking param removal, case normalization, and www handling.
Updated scraper_intake to check for duplicates using normalized URLs
before submitting to queue.

Key changes:
- Created src/job_finder/utils/url_normalizer.py
- Updated src/job_finder/queue/scraper_intake.py
- Added comprehensive unit tests

Testing:
- pytest tests/utils/test_url_normalizer.py (15 test cases)
- pytest tests/queue/test_scraper_intake.py
- Verified duplicate detection in staging

Closes #42
```

---

## Related Issues

- **Depends on**: [Issue #X] - [Why dependency exists]
- **Blocks**: [Issue #Y] - [What's waiting for this]
- **Related**: [Issue #Z] - [How it's connected]

---

## Resources

### Documentation

- **Architecture**: [Link to specific architecture doc]
- **API Reference**: [Link to API documentation]
- **Related Feature**: [Link to related feature docs]

### External References

- [Relevant external documentation]
- [Stack Overflow / GitHub issues if applicable]

---

## Success Metrics

**How we'll measure success**:

- [Metric 1]: [Current state] → [Target state]
- [Metric 2]: [How to measure]

---

## Notes

**Questions? Need clarification?**

- Comment on this issue with specific questions
- Tag @PM for guidance
- Reference related documentation

**Implementation Tips**:

- [Tip 1 about approach]
- [Tip 2 about gotchas]

---

**Created**: [Date]
**Created By**: [PM]
**Last Updated**: [Date]
**Status**: [Todo / In Progress / Review / Done]
