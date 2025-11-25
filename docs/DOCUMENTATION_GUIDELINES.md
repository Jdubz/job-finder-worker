> Status: Active
> Owner: @jdubz
> Last Updated: 2025-11-25

# Documentation Guidelines

Documentation exists to increase development velocity. Every document must provide future value to developers working on this codebase. Documents that describe past work, completed tasks, or analysis without actionable outcomes are prohibited.

## Core Principle

**Before creating any document, ask: "Will this help a developer ship code faster in the future?"**

If the answer is no, do not create the document.

## Allowed Documentation Types

### 1. Architecture Documentation
Documents that explain system design decisions and how components interact.

**Includes:**
- System architecture diagrams and explanations
- Data flow documentation
- Component interaction patterns
- API contracts between services
- Database schema documentation

**Example filenames:** `ARCHITECTURE.md`, `DATA_MODEL.md`, `API_CONTRACTS.md`

### 2. Technical Designs and Planning Documents
Documents that describe how to implement a feature or solve a problem.

**Includes:**
- RFC-style design documents for new features
- Migration plans with step-by-step procedures
- Integration guides for external services
- Performance optimization strategies

**Requirements:**
- Must describe future work, not completed work
- Must include specific implementation steps
- Must be updated or archived when work completes

**Example filenames:** `RFC_*.md`, `DESIGN_*.md`, `MIGRATION_PLAN_*.md`

### 3. Analysis with Actionable Tasks
Investigative documents that result in specific work items.

**Includes:**
- Root cause analysis with remediation tasks
- Performance analysis with optimization tasks
- Security audits with remediation items
- Technical debt analysis with prioritized backlog

**Requirements:**
- Must conclude with explicit, actionable tasks
- Tasks must be tracked (GitHub issues, project board)
- Document should be archived once tasks are complete

**Example filenames:** `ANALYSIS_*.md`, `AUDIT_*.md`

### 4. Troubleshooting Guides and Playbooks
Operational documents that help diagnose and resolve issues.

**Includes:**
- Runbooks for common operational tasks
- Troubleshooting decision trees
- Incident response procedures
- Deployment rollback procedures
- Monitoring and alerting guides

**Requirements:**
- Must be kept current with actual system behavior
- Must include specific commands and steps
- Must be tested periodically

**Example filenames:** `RUNBOOK_*.md`, `TROUBLESHOOTING_*.md`, `PLAYBOOK_*.md`

### 5. Developer Onboarding and Setup
Documents that help new developers become productive.

**Includes:**
- Local development setup guides
- Environment configuration
- Testing procedures
- Code style and conventions

**Example filenames:** `SETUP.md`, `CONTRIBUTING.md`, `TESTING.md`

## Prohibited Documentation Types

The following document types are **not allowed** in this repository:

### Work Summaries
- "What we did" documents
- Session logs or activity reports
- Changelogs that duplicate git history
- Status updates or progress reports

### Completed Task Lists
- Done/completed checklists
- Historical task tracking
- Sprint retrospectives

### Analysis Without Action Items
- Exploratory analysis without conclusions
- Research notes without recommendations
- Investigation reports that don't specify next steps

### Ephemeral Content
- Meeting notes (use project management tools)
- Temporary debugging notes
- Draft documents that are never finalized

## Document Lifecycle

### Creation
1. Verify the document type is allowed
2. Include metadata header (Status, Owner, Last Updated)
3. Place in appropriate `docs/` subdirectory

### Maintenance
- Update `Last Updated` when modifying content
- Review documents quarterly for relevance
- Archive or delete when no longer providing value

### Archival
When a document is no longer needed:
1. **Design docs after implementation:** Delete or convert to architecture docs
2. **Analysis after tasks complete:** Delete entirely
3. **Outdated playbooks:** Update or delete

Do not create an "archive" folder. Documents either provide value or they don't exist.

## Metadata Header

All documents must include:

```markdown
> Status: [Draft | Active | Deprecated]
> Owner: @username
> Last Updated: YYYY-MM-DD
```

- **Draft:** Work in progress, not yet actionable
- **Active:** Current and accurate
- **Deprecated:** Scheduled for removal, do not rely on

## Directory Structure

Documentation is organized by service, with shared cross-cutting concerns at the root level:

```
docs/
├── DOCUMENTATION_GUIDELINES.md
├── frontend/          # Frontend (Next.js) service docs
│   ├── architecture/
│   ├── playbooks/
│   └── setup/
├── backend/           # Backend API service docs
│   ├── architecture/
│   ├── playbooks/
│   └── setup/
├── worker/            # Worker service docs
│   ├── architecture/
│   ├── playbooks/
│   └── setup/
├── infrastructure/    # Infra, deployment, GCP docs
│   ├── architecture/
│   ├── playbooks/
│   └── setup/
└── shared/            # Cross-service documentation
    ├── architecture/  # System-wide architecture
    ├── designs/       # RFCs affecting multiple services
    └── playbooks/     # Cross-service operations
```

### Subdirectory Purposes

Within each service directory:

- **architecture/** - How the service is built, data models, component interactions
- **playbooks/** - Operational runbooks, troubleshooting, incident response
- **setup/** - Development environment, testing, local configuration
- **designs/** - (shared only) RFCs and technical designs spanning services

## Review Checklist

Before committing documentation, verify:

- [ ] Document type is explicitly allowed above
- [ ] Content will help future developers ship faster
- [ ] Metadata header is present and accurate
- [ ] No work summaries or "what we did" content
- [ ] Analysis includes explicit action items
- [ ] Placed in correct subdirectory
