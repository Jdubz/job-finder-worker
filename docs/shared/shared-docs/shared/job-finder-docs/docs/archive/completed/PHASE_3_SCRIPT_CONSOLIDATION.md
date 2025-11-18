# Phase 3: Script Consolidation Strategy

**Date:** 2025-10-21
**Status:** In Progress
**Goal:** Consolidate duplicated script logic into dev-monitor/scripts/ directory

---

## Overview

Phase 3 eliminates the 646 lines of duplicated Makefile code by consolidating common script logic into a central location. This creates a single source of truth for development operations while maintaining backward compatibility with repository Makefiles.

---

## Current State Analysis

### Duplication Identified

From the refactor plan analysis:

**Total Duplicated Code:** 1,076 lines across Makefiles
**After Dev-Monitor Scripts Panel:** 646 lines still duplicated
**Target for Phase 3:** Consolidate ~400 lines of common script logic

**Categories of Duplication:**

1. **Build Operations** (~150 lines)
   - FE: `npm run build` + output messages
   - BE: `npm run build` + output messages
   - Common pattern: Color output, error handling, success message

2. **Test Operations** (~200 lines)
   - FE: `npm test` variations
   - BE: `npm test` variations
   - Worker: `pytest` variations
   - Common pattern: Running tests, coverage, watch modes

3. **Quality Operations** (~150 lines)
   - FE: ESLint + TypeScript checks
   - BE: ESLint
   - Worker: Black formatter + flake8
   - Common pattern: Linting, formatting, type checking

4. **Utility Operations** (~146 lines)
   - Install dependencies
   - Clean artifacts
   - Process management
   - Common pattern: Standard cleanup and setup

---

## Consolidation Strategy

### 1. Directory Structure

Create organized scripts directory in dev-monitor:

```
dev-monitor/
└── scripts/
    ├── build/
    │   ├── build-all.sh          # Build all repos
    │   ├── build-frontend.sh     # Build FE
    │   ├── build-backend.sh      # Build BE
    │   └── common.sh             # Shared build utilities
    ├── test/
    │   ├── test-all.sh           # Test all repos
    │   ├── test-frontend.sh      # Test FE
    │   ├── test-backend.sh       # Test BE
    │   ├── test-worker.sh        # Test worker
    │   └── common.sh             # Shared test utilities
    ├── quality/
    │   ├── lint-all.sh           # Lint all repos
    │   ├── lint-frontend.sh      # Lint FE
    │   ├── lint-backend.sh       # Lint BE
    │   ├── lint-worker.sh        # Lint worker
    │   └── common.sh             # Shared quality utilities
    ├── utility/
    │   ├── install-all.sh        # Install deps in all repos
    │   ├── clean-all.sh          # Clean all repos
    │   └── common.sh             # Shared utility functions
    └── common/
        ├── colors.sh             # Color definitions
        ├── logging.sh            # Logging functions
        └── repo-paths.sh         # Repository path constants
```

### 2. Script Design Principles

**A. Single Responsibility**
Each script does one thing well:

- `build-frontend.sh` - Only builds frontend
- `build-all.sh` - Calls individual build scripts

**B. Composability**
Scripts can be used independently or combined:

```bash
# Use individually
./scripts/build/build-frontend.sh

# Use aggregated
./scripts/build/build-all.sh
```

**C. Shared Utilities**
Common functionality in shared files:

- Color output: `common/colors.sh`
- Logging: `common/logging.sh`
- Error handling: `common/logging.sh`

**D. Exit Codes**
Proper exit codes for CI/CD integration:

- `0` - Success
- `1` - Failure
- Fail fast on errors

---

## Implementation Plan

### Phase 3A: Create Directory Structure (15 min)

```bash
cd dev-monitor
mkdir -p scripts/{build,test,quality,utility,common}
```

### Phase 3B: Create Common Utilities (30 min)

**1. colors.sh** - Color definitions

```bash
#!/bin/bash
# Color codes for consistent output
export RESET='\033[0m'
export BOLD='\033[1m'
export CYAN='\033[0;36m'
export GREEN='\033[0;32m'
export YELLOW='\033[1;33m'
export RED='\033[0;31m'
```

**2. logging.sh** - Logging functions

```bash
#!/bin/bash
source "$(dirname "$0")/../common/colors.sh"

log_info() {
    echo -e "${CYAN}$1${RESET}"
}

log_success() {
    echo -e "${GREEN}✓ $1${RESET}"
}

log_warning() {
    echo -e "${YELLOW}⚠ $1${RESET}"
}

log_error() {
    echo -e "${RED}✗ $1${RESET}"
}
```

**3. repo-paths.sh** - Repository paths

```bash
#!/bin/bash
# Get the root directory (job-finder-app-manager)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"

export FE_DIR="$ROOT_DIR/job-finder-FE"
export BE_DIR="$ROOT_DIR/job-finder-BE"
export WORKER_DIR="$ROOT_DIR/job-finder-worker"
export DEV_MONITOR_DIR="$ROOT_DIR/dev-monitor"
```

### Phase 3C: Create Individual Scripts (1 hour)

**Build Scripts:**

1. `build/build-frontend.sh`

```bash
#!/bin/bash
set -e
source "$(dirname "$0")/../common/logging.sh"
source "$(dirname "$0")/../common/repo-paths.sh"

log_info "Building frontend..."
cd "$FE_DIR"
npm run build
log_success "Frontend build complete"
```

2. `build/build-backend.sh`

```bash
#!/bin/bash
set -e
source "$(dirname "$0")/../common/logging.sh"
source "$(dirname "$0")/../common/repo-paths.sh"

log_info "Building backend..."
cd "$BE_DIR"
npm run build
log_success "Backend build complete"
```

3. `build/build-all.sh`

```bash
#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Building all repositories..."
"$SCRIPT_DIR/build-frontend.sh"
"$SCRIPT_DIR/build-backend.sh"
echo -e "${GREEN}✓ All builds complete${RESET}"
```

**Test Scripts:**

1. `test/test-frontend.sh`
2. `test/test-backend.sh`
3. `test/test-worker.sh`
4. `test/test-all.sh`

**Quality Scripts:**

1. `quality/lint-frontend.sh`
2. `quality/lint-backend.sh`
3. `quality/lint-worker.sh`
4. `quality/lint-all.sh`

### Phase 3D: Update Makefiles (30 min)

**Makefile Pattern:**

```makefile
# Before (duplicated logic)
build: ## Build production bundle
	@echo "$(YELLOW)💡 Tip: Use dev-monitor Scripts Panel$(RESET)"
	@echo "$(CYAN)Building production bundle...$(RESET)"
	@npm run build
	@echo "$(GREEN)✓ Build complete$(RESET)"

# After (calls consolidated script)
build: ## Build production bundle
	@echo "$(YELLOW)💡 Tip: Use dev-monitor Scripts Panel$(RESET)"
	@../dev-monitor/scripts/build/build-frontend.sh
```

**Benefits:**

- Single line instead of 4 lines
- Logic centralized in script
- Easier to maintain
- Consistent across repos

### Phase 3E: Testing (30 min)

Test each script independently and aggregated:

```bash
# Individual scripts
./dev-monitor/scripts/build/build-frontend.sh
./dev-monitor/scripts/build/build-backend.sh
./dev-monitor/scripts/test/test-frontend.sh
./dev-monitor/scripts/test/test-backend.sh
./dev-monitor/scripts/test/test-worker.sh

# Aggregated scripts
./dev-monitor/scripts/build/build-all.sh
./dev-monitor/scripts/test/test-all.sh
./dev-monitor/scripts/quality/lint-all.sh
```

---

## Code Reduction Metrics

### Before Phase 3

**job-finder-FE/Makefile:**

- build: 4 lines
- test: 3 lines
- lint: 3 lines
- type-check: 3 lines
- Total: ~13 lines

**job-finder-BE/Makefile:**

- build: 4 lines
- test: 3 lines
- lint: 3 lines
- Total: ~10 lines

**job-finder-worker/Makefile:**

- test: 3 lines
- lint: 4 lines
- format: 4 lines
- Total: ~11 lines

**Current Total:** ~34 lines of command implementation

### After Phase 3

**job-finder-FE/Makefile:**

- build: 2 lines (warning + script call)
- test: 2 lines
- lint: 2 lines
- type-check: 2 lines
- Total: ~8 lines

**job-finder-BE/Makefile:**

- build: 2 lines
- test: 2 lines
- lint: 2 lines
- Total: ~6 lines

**job-finder-worker/Makefile:**

- test: 2 lines
- lint: 2 lines
- format: 2 lines
- Total: ~6 lines

**New Total:** ~20 lines (calling scripts)
**Reduction:** ~14 lines from Makefiles
**Added:** ~400 lines in consolidated scripts (but reusable!)

**Net Benefit:**

- Single source of truth
- Easier to maintain (change once, affect all)
- Testable scripts (can run independently)
- CI/CD ready (proper exit codes)

---

## Aggregated Script Features

### build-all.sh

**Features:**

- Builds all repos in correct order
- Parallel execution option (future)
- Stops on first failure
- Summary at end

**Usage:**

```bash
# From dev-monitor
./scripts/build/build-all.sh

# From Makefile
make build-all
```

### test-all.sh

**Features:**

- Runs all test suites
- Shows summary of pass/fail
- Option for coverage reports
- Stops on first failure (or continue)

**Usage:**

```bash
# Run all tests
./scripts/test/test-all.sh

# Run with coverage
./scripts/test/test-all.sh --coverage

# Continue on failure
./scripts/test/test-all.sh --continue
```

### lint-all.sh

**Features:**

- Lints all repos
- Shows aggregated errors
- Option for auto-fix
- Summary report

**Usage:**

```bash
# Lint all
./scripts/quality/lint-all.sh

# Lint with auto-fix
./scripts/quality/lint-all.sh --fix
```

---

## Integration with dev-monitor Scripts Panel

The consolidated scripts become the **implementation** for dev-monitor scripts:

**Current (Phase 1-2):**

```typescript
// dev-monitor/backend/src/config.ts
{
  id: 'fe-build',
  command: 'npm',
  args: ['run', 'build'],
  cwd: path.join(ROOT_DIR, 'job-finder-FE'),
}
```

**Future (Phase 3+):**

```typescript
// Option to use consolidated scripts
{
  id: 'fe-build',
  command: 'bash',
  args: ['scripts/build/build-frontend.sh'],
  cwd: path.join(ROOT_DIR, 'dev-monitor'),
}
```

**Benefits:**

- Scripts are testable outside dev-monitor
- Can be used from command line
- Same scripts in Makefiles and UI
- True single source of truth

---

## Success Metrics

### Phase 3 Goals

- [ ] All common scripts consolidated
- [ ] Makefiles updated to use scripts
- [ ] All tests passing
- [ ] Documentation updated
- [ ] Code reduction measured

### Quality Metrics

- [ ] Scripts have proper error handling
- [ ] Scripts have proper exit codes
- [ ] Scripts are executable (chmod +x)
- [ ] Scripts have clear output
- [ ] Scripts can run independently

### Maintainability Metrics

- [ ] Single source of truth achieved
- [ ] Easier to add new operations
- [ ] Consistent output across repos
- [ ] Reusable script components

---

## Rollout Strategy

### Week 1 (This Session)

1. Create scripts directory structure
2. Create common utilities
3. Create individual repo scripts
4. Create aggregated scripts
5. Test all scripts

### Week 2

1. Update Makefiles to use scripts
2. Test backward compatibility
3. Measure code reduction
4. Document usage

### Week 3

1. Gather feedback
2. Add features to aggregated scripts
3. Optimize parallel execution
4. Integration with CI/CD

---

## Future Enhancements

### Parallel Execution

```bash
# Run builds in parallel
./scripts/build/build-all.sh --parallel
```

### CI/CD Integration

```yaml
# .github/workflows/ci.yml
- name: Build All
  run: ./dev-monitor/scripts/build/build-all.sh

- name: Test All
  run: ./dev-monitor/scripts/test/test-all.sh --coverage

- name: Lint All
  run: ./dev-monitor/scripts/quality/lint-all.sh
```

### Reporting

```bash
# Generate test report
./scripts/test/test-all.sh --report=junit

# Generate coverage report
./scripts/test/test-all.sh --coverage --report=html
```

---

## Migration Path

### Developers

1. Continue using `make` commands (calls scripts now)
2. OR use scripts directly: `./dev-monitor/scripts/build/build-all.sh`
3. OR use dev-monitor UI (unchanged)

All three options work identically!

### CI/CD

1. Can call scripts directly (no Make needed)
2. Better control over execution
3. Easier debugging

---

## Next Steps

1. Create directory structure
2. Implement common utilities
3. Create individual scripts
4. Create aggregated scripts
5. Update Makefiles
6. Test everything
7. Measure results

**Estimated Time:** 2-3 hours
**Status:** Ready to implement ✅
