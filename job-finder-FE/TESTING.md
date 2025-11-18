# Testing Guide

This document describes the testing infrastructure for the Job Finder Frontend application.

## Table of Contents

- [Overview](#overview)
- [Test Types](#test-types)
- [Running Tests](#running-tests)
- [Pre-Push Hook](#pre-push-hook)
- [Writing Tests](#writing-tests)
- [Test Coverage](#test-coverage)
- [Existing Tests](#existing-tests)

## Overview

The Job Finder Frontend uses **Vitest** as the test runner, providing a fast, modern testing experience that's optimized for Vite projects.

### Key Features

- **Automated Testing**: Tests run automatically on pre-push via Husky hooks
- **Comprehensive Coverage**: Unit tests, integration tests, and structural tests
- **Fast Execution**: Parallel test execution with Vitest
- **Type Safety**: Full TypeScript support in tests

## Test Types

### Unit Tests (`src/**/__tests__/`)

Unit tests verify individual components, utilities, and modules in isolation.

**Location**: Collocated with source files in `__tests__` directories

**Examples**:

- `src/utils/__tests__/dateFormat.test.ts` - Date formatting utilities
- `src/api/__tests__/job-matches-client.test.ts` - API client functionality
- `src/types/__tests__/routes.test.ts` - Route configuration validation

### Integration Tests (`tests/integration/`)

Integration tests verify that multiple components work together correctly, including Firebase interactions.

**Examples**:

- `authentication.test.ts` - Auth flow testing
- `contentItems.test.ts` - Content item CRUD operations
- `jobMatches.test.ts` - Job matching functionality
- `jobQueue.test.ts` - Job queue management

### End-to-End Tests

E2E tests use Playwright to test complete user flows in a real browser.

**Location**: `tests/e2e/` (configured but not yet implemented)

## Running Tests

### All Tests

```bash
npm test                  # Watch mode (interactive)
npm run test:ci          # Run once and exit (CI mode)
```

### Specific Test Types

```bash
npm run test:unit        # Run only unit tests (src/)
npm run test:integration # Run only integration tests (tests/integration/)
npm run test:e2e         # Run Playwright tests (when available)
```

### Watch Mode and UI

```bash
npm run test:watch       # Watch mode with hot reload
npm run test:ui          # Launch Vitest UI in browser
```

### Coverage

```bash
npm run test:coverage    # Generate coverage report
```

Coverage reports are generated using `@vitest/coverage-v8` and show:

- Line coverage
- Branch coverage
- Function coverage
- Statement coverage

## Pre-Push Hook

### Automatic Test Execution

Tests run automatically before every `git push` via Husky hooks.

**Pre-Push Sequence**:

1. Type checking (`npm run type-check`)
2. Test suite (`npm run test:ci`)
3. If either fails, the push is blocked

### Why This Matters

The pre-push hook ensures:

- All code pushed to the repository passes tests
- Type errors are caught before code review
- Test failures don't make it to CI/CD
- Team members can trust that staging branch is always stable

### Handling Failed Pushes

If your push is blocked:

```bash
# Fix the failing tests
npm test

# Or check specific failures
npm run type-check
npm run test:ci

# Once fixed, commit and push again
git add .
git commit -m "fix: resolve test failures"
git push
```

### Bypassing the Hook (Not Recommended)

In rare cases where you need to push without running tests:

```bash
git push --no-verify
```

**WARNING**: Only use `--no-verify` in emergencies. The PM requires all code to pass tests before merging.

## Writing Tests

### Test File Naming

- Unit tests: `*.test.ts` or `*.test.tsx`
- Integration tests: `*.test.ts`
- Place unit tests in `__tests__/` directories near source files
- Place integration tests in `tests/integration/`

### Basic Test Structure

```typescript
import { describe, it, expect } from "vitest"

describe("Component/Function Name", () => {
  it("should do something specific", () => {
    // Arrange
    const input = "test"

    // Act
    const result = functionToTest(input)

    // Assert
    expect(result).toBe("expected output")
  })
})
```

### Testing React Components

```typescript
import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { MyComponent } from "../MyComponent"

describe("MyComponent", () => {
  it("should render with props", () => {
    render(<MyComponent title="Test" />)

    expect(screen.getByText("Test")).toBeInTheDocument()
  })
})
```

### Mocking Firebase

Integration tests use Firebase test utilities:

```typescript
import { setupTestEnvironment } from "@/test-utils/setup"

describe("Firebase Integration", () => {
  beforeEach(async () => {
    await setupTestEnvironment()
  })

  it("should interact with Firestore", async () => {
    // Test Firestore operations
  })
})
```

## Test Coverage

### Current Coverage

Run `npm run test:coverage` to see detailed coverage metrics.

**Coverage Goals**:

- Critical utilities: 80%+ coverage
- API clients: 70%+ coverage
- UI components: 60%+ coverage

### Viewing Coverage Reports

After running `npm run test:coverage`:

1. Console shows summary
2. Detailed HTML report in `coverage/index.html`
3. Open in browser: `open coverage/index.html`

## Existing Tests

### Unit Tests (30 tests)

#### `dateFormat.test.ts` (11 tests)

- ✓ Format YYYY-MM to "MMM YYYY"
- ✓ Handle null/undefined → "Present"
- ✓ Handle invalid dates → "Present"
- ✓ All 12 months format correctly
- ✓ getCurrentMonthYear() validation
- ✓ isValidMonthYear() validation

#### `job-matches-client.test.ts` (8 tests)

- ✓ Query construction with userId filtering
- ✓ Match data structure validation
- ✓ Subscription callback handling
- ✓ Error callback handling

#### `routes.test.ts` (11 tests)

- ✓ All route paths defined
- ✓ No duplicate paths
- ✓ All paths start with "/"
- ✓ No trailing slashes (except HOME)
- ✓ Required routes present

### Integration Tests (191 tests)

#### `authentication.test.ts` (24 tests)

- Firebase Auth integration
- User sign-in/sign-out flows
- Role-based access control

#### `contentItems.test.ts` (32 tests)

- Content item CRUD operations
- Nested item hierarchies
- Real-time updates

#### `generator.test.ts` (18 tests)

- Document generation API
- Template processing
- Error handling

#### `jobMatches.test.ts` (36 tests)

- Job match queries
- Filtering and sorting
- Real-time subscriptions

#### `jobQueue.test.ts` (30 tests)

- Queue operations
- Status transitions
- Job processing

#### `errorHandling.test.ts` (35 tests)

- API error responses
- Network failures
- Validation errors

#### `App.test.tsx` (2 tests)

- App renders without crashing
- Router component loads

#### `generator-client.test.ts` (14 tests)

- Generator API client
- Request/response validation

## Best Practices

### 1. Write Tests First (TDD)

When adding new features:

1. Write failing test
2. Implement feature
3. Verify test passes

### 2. Test Behavior, Not Implementation

```typescript
// ❌ Bad: Testing implementation details
expect(component.state.count).toBe(1)

// ✅ Good: Testing user-facing behavior
expect(screen.getByText("Count: 1")).toBeInTheDocument()
```

### 3. Keep Tests Isolated

Each test should:

- Set up its own data
- Not depend on other tests
- Clean up after itself

### 4. Use Descriptive Test Names

```typescript
// ❌ Bad
it("works", () => { ... })

// ✅ Good
it("should display error message when API request fails", () => { ... })
```

### 5. Follow AAA Pattern

```typescript
it("should do something", () => {
  // Arrange: Set up test data
  const input = createTestData()

  // Act: Perform the action
  const result = functionUnderTest(input)

  // Assert: Verify the outcome
  expect(result).toMatchExpectedValue()
})
```

## Troubleshooting

### Tests Failing Locally

```bash
# Clear cache and restart
npm run test:ci -- --clearCache

# Run tests in sequence (not parallel)
npm run test:ci -- --no-threads
```

### Firebase Emulator Issues

```bash
# Ensure emulators are running
firebase emulators:start

# Check emulator status
curl http://localhost:9099  # Auth emulator
curl http://localhost:8080  # Firestore emulator
```

### Type Errors in Tests

Make sure test files import from the correct paths:

```typescript
import { MyComponent } from "@/components/MyComponent" // ✅ Use @/ alias
import { MyComponent } from "../../../components/MyComponent" // ❌ Avoid relative paths
```

## CI/CD Integration

### GitHub Actions

The test suite runs automatically on:

- Pull requests to `staging` and `main`
- Pushes to `staging` and `main`

### Required Checks

All PRs must pass:

- ✅ Type checking
- ✅ Linting
- ✅ Unit tests
- ✅ Integration tests

## Additional Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library](https://testing-library.com/)
- [Firebase Test SDK](https://firebase.google.com/docs/rules/unit-tests)
- [Playwright Documentation](https://playwright.dev/)

## Getting Help

If you encounter issues:

1. Check this documentation
2. Review existing test files for examples
3. Ask in team chat or create a GitHub issue
