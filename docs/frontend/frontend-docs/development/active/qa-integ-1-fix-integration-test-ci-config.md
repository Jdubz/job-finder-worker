# QA-INTEG-1 — Fix Integration Test CI Configuration

> **Context**: PR #19 added comprehensive integration tests but they fail in CI due to missing Firebase emulator configuration
> **Related PR**: https://github.com/Jdubz/job-finder-FE/pull/19

---

## Issue Metadata

```yaml
Title: QA-INTEG-1 — Fix Integration Test CI Configuration
Labels: priority-p1, repository-frontend, type-testing, status-todo
Assignee: Worker B
Priority: P1-High
Estimated Effort: 3-4 hours
Repository: job-finder-FE
Related PR: #19 (DRAFT)
```

---

## Summary

PR #19 introduced a comprehensive integration testing framework with 178 tests covering all API endpoints, authentication flows, and error handling. However, 23 tests fail in CI because they require Firebase Authentication but CI uses an invalid test API key. The tests are well-written but need proper CI configuration to run successfully without requiring a real Firebase backend.

**Current State**:
- ✅ 36 tests pass (structure/configuration validation)
- ❌ 23 tests fail (authentication tests requiring Firebase)
- ⏭️ 119 tests skipped (intentionally, require backend)
- Total: 178 tests

**Desired State**:
- ✅ All tests pass in CI without Firebase emulators
- ✅ Tests properly skip when backend unavailable
- ✅ CI workflow runs clean and green
- ✅ PR #19 ready to merge to staging

---

## Background & Context

### Project Overview
**Application**: Job Finder Frontend (React/TypeScript)
**Testing Stack**: Vitest, Firebase SDK, integration test utilities
**CI/CD**: GitHub Actions

### Current Problem

The integration tests in PR #19 attempt to authenticate with Firebase using `test-api-key` configured in CI environment variables. Firebase rejects this invalid key, causing authentication tests to fail:

```
FirebaseError: Firebase: Error (auth/api-key-not-valid.-please-pass-a-valid-api-key.)
```

**Failing Test Categories**:
1. Authentication flow tests (sign in, sign out, token management)
2. Tests that depend on authenticated API clients
3. Tests requiring Firebase Auth tokens

**Passing Test Categories**:
1. Data structure validation (mock data)
2. API client configuration checks
3. Request/response type safety
4. Helper function utilities

### Root Cause

The tests were designed for two modes:
1. **CI Mode**: Validate structure without backend (should skip auth tests)
2. **Local Mode**: Full integration with Firebase emulator (all tests run)

However, the skip logic doesn't properly detect CI environment, causing auth tests to run and fail.

---

## Technical Specifications

### Affected Files

```
MODIFY:
- tests/integration/authentication.test.ts - Add proper skip conditions
- tests/integration/contentItems.test.ts - Add skip guards for auth-dependent tests
- tests/integration/errorHandling.test.ts - Add skip guards for auth-dependent tests
- tests/integration/generator.test.ts - Add skip guards for auth-dependent tests
- tests/integration/jobQueue.test.ts - Add skip guards for auth-dependent tests
- tests/integration/jobMatches.test.ts - Add skip guards for auth-dependent tests
- tests/utils/testHelpers.ts - Improve environment detection
- .github/workflows/ci.yml - Update integration test configuration (optional)

CREATE:
- tests/integration/README.md - Document test modes and CI behavior (if doesn't exist)
```

### Technology Requirements
- **Language**: TypeScript
- **Framework**: Vitest
- **Firebase SDK**: Auth module
- **Environment**: GitHub Actions CI

---

## Implementation Details

### Step 1: Improve Environment Detection

**File**: `tests/utils/testHelpers.ts`

Add better detection for when Firebase is actually available:

```typescript
// Add to testHelpers.ts
export function isFirebaseAvailable(): boolean {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const useEmulators = import.meta.env.VITE_USE_EMULATORS === 'true';

  // Valid API key format: AIza[23 chars]
  const hasValidApiKey = apiKey && apiKey.startsWith('AIza') && apiKey.length === 39;

  return hasValidApiKey || useEmulators;
}

export function skipIfNoFirebase(testName: string) {
  if (!isFirebaseAvailable()) {
    return it.skip(testName, () => {});
  }
  return it;
}
```

### Step 2: Update Authentication Tests

**File**: `tests/integration/authentication.test.ts`

Wrap Firebase-dependent tests with skip condition:

```typescript
import { isFirebaseAvailable, skipIfNoFirebase } from '../utils/testHelpers';

describe('Authentication API Integration', () => {
  // Structure tests (always run)
  it('should validate auth configuration structure', () => {
    // These tests don't require Firebase
  });

  // Firebase-dependent tests (skip in CI)
  describe('Firebase Auth Integration', () => {
    beforeAll(() => {
      if (!isFirebaseAvailable()) {
        console.log('⏭️  Skipping Firebase auth tests (backend not available)');
      }
    });

    skipIfNoFirebase('should sign in test user', async () => {
      await signInTestUser('regular');
      // ... test code
    });

    skipIfNoFirebase('should get auth token', async () => {
      const token = await getTestAuthToken();
      // ... test code
    });
  });
});
```

### Step 3: Update CI Workflow (Optional)

**File**: `.github/workflows/ci.yml`

Make it explicit that integration tests run in "structure-only" mode:

```yaml
- name: Run integration tests
  run: npm run test:integration
  env:
    VITE_FIREBASE_PROJECT_ID: demo-test-project
    VITE_FIREBASE_API_KEY: test-api-key
    VITE_USE_EMULATORS: false
    CI: true
  continue-on-error: false  # Should pass now with skips
```

### Step 4: Add Test Mode Documentation

**File**: `tests/integration/README.md` (create if doesn't exist)

```markdown
# Integration Tests

## Test Modes

### CI Mode (Structure Validation Only)
- Runs automatically in GitHub Actions
- Validates data structures, types, and configuration
- Skips tests requiring Firebase backend
- Expected: ~36 tests pass, ~142 skipped

### Local Mode (Full Integration)
- Requires Firebase emulator running
- Runs all 178 tests
- Tests actual API integration

## Running Tests

### CI Mode (No Backend Required)
```bash
npm run test:integration
```

### Local Mode (With Firebase Emulator)
```bash
# Terminal 1: Start emulators
firebase emulators:start

# Terminal 2: Run tests
npm run test:integration
```
```

---

## Testing Requirements

### Acceptance Criteria

- [ ] Integration test suite passes in CI (0 failures)
- [ ] Structure tests continue to pass (36 tests)
- [ ] Auth-dependent tests properly skip when Firebase unavailable
- [ ] Console output clearly indicates why tests are skipped
- [ ] Local mode with emulators still runs all 178 tests
- [ ] PR #19 CI checks turn green
- [ ] Documentation added explaining test modes

### Validation Commands

```bash
# Run in CI mode (should pass)
VITE_FIREBASE_API_KEY=test-api-key npm run test:integration

# Run with emulator (should run all tests)
VITE_USE_EMULATORS=true npm run test:integration

# Check test count
npm run test:integration 2>&1 | grep "Tests"
# Should show: "Tests  36 passed | 142 skipped (178)"
```

### Test Output Expected

```
✓ tests/integration/authentication.test.ts (12 tests | 3 passed | 9 skipped)
✓ tests/integration/contentItems.test.ts (47 tests | 15 passed | 32 skipped)
✓ tests/integration/errorHandling.test.ts (59 tests | 10 passed | 49 skipped)
✓ tests/integration/generator.test.ts (26 tests | 5 passed | 21 skipped)
✓ tests/integration/jobMatches.test.ts (60 tests | 3 passed | 57 skipped)
✓ tests/integration/jobQueue.test.ts (59 tests | 0 passed | 59 skipped)

Test Files  6 passed (6)
     Tests  36 passed | 142 skipped (178 total)
  Duration  3-5 seconds
```

---

## Success Metrics

1. **PR #19 Status**: All CI checks passing ✅
2. **Test Reliability**: 0% flakiness in CI
3. **Test Coverage**: 178 tests total, proper skip/run distribution
4. **Developer Experience**: Clear console output explaining test modes
5. **Documentation**: Future developers understand test modes

---

## Dependencies

**Blocking**:
- None - can be implemented immediately

**Blocked By**:
- None

**Enables**:
- Merging PR #19 to staging
- QA-INTEG-2 (future work on full emulator integration in CI)
- Establishing pattern for other integration test suites

---

## Notes

- PR #19 is currently in DRAFT status and was created by copilot-swe-agent
- The test code itself is well-written and comprehensive
- This issue focuses solely on making tests CI-compatible
- Future work could add Firebase emulator to CI for full integration testing
- For now, structure validation in CI is sufficient

---

## Commit Template

```
fix(tests): add proper skip conditions for integration tests requiring Firebase

The integration test suite in PR #19 failed in CI because authentication
tests attempted to use an invalid test API key. This commit adds proper
environment detection and skip conditions so tests run successfully in CI.

Changes:
- Add isFirebaseAvailable() helper to detect valid Firebase config
- Add skipIfNoFirebase() helper for conditional test execution
- Update auth tests to skip when Firebase unavailable
- Update other integration tests to skip auth-dependent tests
- Add documentation explaining test modes (CI vs Local)

Test results:
- CI mode: 36 passed, 142 skipped (0 failures) ✅
- Local mode with emulator: 178 passed ✅

Fixes PR #19 CI failures and enables merge to staging.

Closes #[issue-number]
```

---

**Created**: 2025-10-20
**Last Updated**: 2025-10-20
**Status**: Ready for Implementation
