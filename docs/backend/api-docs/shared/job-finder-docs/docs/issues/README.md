# Issues Directory

This directory contains detailed issue specifications for the Job Finder App Manager project.

## Issue Organization

Issues are organized by category and priority:

### Frontend Workflows (P0-P1)

- `fe-workflow-0-add-production-e2e.md` - **P0 CRITICAL**: Add E2E tests to production deployment (Worker B)
- `fe-workflow-1-eliminate-duplication.md` - P1: Eliminate 373 lines of workflow duplication (Worker B)
- `fe-workflow-2-fix-ci-efficiency.md` - P2: Fix CI running npm ci 6x per run (Worker B)
- `fe-workflow-3-remove-skip-tests.md` - P2: Remove dangerous skip-tests option (Worker B)

### Backend Workflows (P1-P2)

- `be-workflow-1-eliminate-duplication.md` - P1: Eliminate 346 lines of workflow duplication (Worker B)
- `be-workflow-2-optimize-ci.md` - P2: Optimize CI with caching and type-check (Worker B)
- `be-workflow-3-add-validation.md` - P2: Add post-deployment smoke tests (Worker B)

### Worker Workflows (P0-P2)

- `worker-workflow-1-add-test-requirements.md` - **P0 CRITICAL**: Add test requirements to deployments (Worker A/B)
- `worker-workflow-2-eliminate-duplication.md` - P1: Eliminate 147 lines of Docker workflow duplication (Worker A/B)
- `worker-workflow-3-add-validation.md` - P2: Add automated post-deployment validation (Worker A/B)

### Comprehensive Gap Analysis Issues

#### Testing Gaps (P0-P1)

- `gap-test-be-1-no-test-coverage.md` - **P0 CRITICAL**: Backend has no test coverage (Worker B, 3-4 days)
- `gap-test-fe-1-no-unit-tests.md` - P1: Frontend has no unit tests for components (Worker B, 2-3 days)
- `gap-test-worker-1-improve-test-coverage.md` - P1: Worker has low test coverage < 50% (Worker A, 2 days)

#### Security Gaps (P0)

- `gap-sec-auth-1-no-api-authentication.md` - **P0 CRITICAL**: No API authentication on Cloud Functions (Worker A, 2 days)

#### DevOps & Infrastructure Gaps (P1)

- `gap-devops-mon-1-no-monitoring-alerting.md` - P1: No centralized monitoring or alerting (Worker A, 3 days)
- `gap-infra-backup-1-no-firestore-backup.md` - P1: No automated Firestore backups (Worker A, 2 days)

#### Documentation Gaps (P1)

- `gap-doc-api-1-no-api-documentation.md` - P1: No API documentation for backend (Worker B, 2 days)

**Summary**: Comprehensive analysis identified 47 gaps across 8 categories. Created 7 high-priority issues (2 P0, 5 P1) addressing the most critical production-blocking gaps. See `COMPREHENSIVE_GAP_ANALYSIS.md` for complete findings.

**GitHub Issues Created for Critical Gaps**:

- **Issue #25**: FE-WORKFLOW-0 — Add E2E Tests to Production Deployment (P0 Critical)
- **Issue #26**: GAP-SEC-AUTH-1 — No API Authentication on Backend Cloud Functions (P0 Critical)
- **Issue #27**: GAP-TEST-BE-1 — No Test Coverage for Backend Cloud Functions (P0 Critical)
- **Issue #28**: WORKER-WORKFLOW-1 — Add Test Requirements to Deployments (P0 Critical)
- **Issue #29**: GAP-TEST-FE-1 — No Unit Tests for Frontend Components (P1 High)

### Dev Monitor Integration (P2)

- `test-startup-fe-dev-server.md` - Frontend dev server startup tests (Worker B)
- `test-startup-be-emulators.md` - Backend emulator startup tests (Worker B)
- `test-startup-worker-docker.md` - Python worker Docker startup tests (Worker A)

### Dev Monitor Project

⚠️ **Dev-monitor is a LOCAL DEVELOPMENT TOOL ONLY** (never deployed) - Infrastructure gaps are optional

**Feature Implementation (Complete - Documents Removed):**

- ~~`dev-monitor-1-project-setup.md`~~ - ✅ **Complete & Removed**: Project setup and architecture (GitHub issues #18-22 closed)
- ~~`dev-monitor-2-process-management-backend.md`~~ - ✅ **Complete & Removed**: Process management backend (GitHub issue #18 closed)
- ~~`dev-monitor-3-log-streaming-backend.md`~~ - ✅ **Complete & Removed**: Real-time log streaming (GitHub issue #19 closed)
- ~~`dev-monitor-4-service-panel-ui.md`~~ - ✅ **Complete & Removed**: Service panel UI components (GitHub issue #20 closed)
- ~~`dev-monitor-5-logs-ui.md`~~ - ✅ **Complete & Removed**: Logs viewer with filters (GitHub issue #21 closed)
- ~~`dev-monitor-6-cloud-logs-phase2.md`~~ - ✅ **Complete & Removed**: Cloud logs integration (GitHub issue #22 closed)

**Infrastructure Gaps (Optional - Skip Most):**

- `dev-monitor-gaps-analysis.md` - Gap analysis (updated for local-only context)
- `dev-monitor-fix-1-backend-eslint.md` - P2 OPTIONAL: Fix broken backend linting
- `dev-monitor-fix-6-workspace-scripts.md` - P2 OPTIONAL: Add root workspace scripts (superseded by CONSOLIDATE-1)
- ~~`dev-monitor-fix-2-ci-cd-workflow.md`~~ - P3 SKIP: Not needed for local tool
- ~~`dev-monitor-fix-3-git-hooks.md`~~ - P3 SKIP: Not needed for local tool
- ~~`dev-monitor-fix-4-prettier.md`~~ - P3 SKIP: Not needed for local tool
- ~~`dev-monitor-fix-5-testing.md`~~ - P3 SKIP: Not needed for local tool
- ~~`dev-monitor-setup-dev-infrastructure.md`~~ - Superseded by analysis

**Enhancements (P2):**

- `dev-monitor-consolidate-1-centralize-dev-scripts.md` - P2: Centralize all dev scripting in dev-monitor (Worker B, 2-3 days)
  - Audit all dev scripts across repos
  - Consolidate common operations (lint, format, test, build)
  - Add Scripts panel to dev-monitor UI
  - Eliminate duplication across repositories
  - Vision: dev-monitor as single interface for ALL local development

- `dev-monitor-ui-1-multi-panel-logs.md` - P2: Multi-panel log viewer with drag & resize (Worker B, 3-4 days)
  - **Phase 1 (2 days)**: Multiple fixed panels for simultaneous log viewing
    - Add/remove panels dynamically
    - Independent source selection per panel
    - Layout templates (horizontal, vertical, quad)
    - Persist panel configurations
  - **Phase 2 (1-2 days)**: Draggable, resizable panels
    - Drag-to-reorder panels
    - Resize panels with handles
    - Save/load custom layouts
    - Export/import layouts
  - **Vision**: Monitor FE + BE + Worker simultaneously during debugging

## Issue Lifecycle

1. **Created**: PM creates issue file with detailed specification
2. **Assigned**: PM assigns to Worker A or Worker B
3. **In Progress**: Worker implements according to spec
4. **Review**: PR submitted to staging for PM review
5. **Done**: Merged to staging, issue closed

## Issue Format

Each issue includes:

- **Status**: To Do, In Progress, Review, Done
- **Owner**: Worker A, Worker B, or PM
- **Priority**: P0 (Critical), P1 (High), P2 (Medium), P3 (Low)
- **Labels**: priority, repository, type, status
- **Estimated Effort**: Time estimate in hours
- **Dependencies**: Other issues that must complete first
- **What This Issue Covers**: Brief description
- **Context**: Background and rationale
- **Tasks**: Detailed checklist of work items
- **Acceptance Criteria**: Definition of done
- **Notes**: Additional guidance and considerations

## Creating New Issues

1. Create new `.md` file in this directory
2. Use existing issues as templates
3. Follow the standard format above
4. Add to `PROJECT_TASK_LIST.md` backlog
5. Assign to appropriate worker
6. Link from worker's task file when activated

## See Also

- `PROJECT_TASK_LIST.md` - Master task backlog
- `CLAUDE_WORKER_A.md` - Worker A's task queue
- `CLAUDE_WORKER_B.md` - Worker B's task queue
