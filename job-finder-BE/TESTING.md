# Testing Guide

## Overview

The job-finder-BE backend uses a comprehensive testing strategy covering unit tests, integration tests, and end-to-end tests. This document provides guidance on writing, running, and maintaining tests.

## Test Infrastructure

### Technology Stack

- **Jest**: Primary testing framework
- **ts-jest**: TypeScript support for Jest
- **firebase-functions-test**: Firebase Functions testing utilities
- **Firebase Emulators**: For integration testing with real services

### Test Configuration

Tests are configured in `jest.config.js` with:
- TypeScript support via ts-jest
- ESM module handling
- Coverage collection and reporting
- Global setup file for test environment configuration

## Test Structure

```
functions/src/
├── __tests__/
│   ├── setup.ts                    # Global test configuration
│   ├── helpers/
│   │   └── test-utils.ts           # Shared test utilities and mocks
│   ├── services/                   # Service layer unit tests
│   │   ├── firestore.service.test.ts
│   │   └── job-queue.service.test.ts
│   ├── integration/                # Integration tests
│   │   ├── firestore.test.ts
│   │   └── auth.test.ts
│   └── e2e/                        # End-to-end tests
│       ├── job-submission.test.ts
│       └── document-generation.test.ts
├── config/__tests__/               # Config-specific tests
│   └── database.test.ts
└── utils/__tests__/                # Utility function tests
    ├── request-id.test.ts
    ├── date-format.test.ts
    └── generation-steps.test.ts
```

## Running Tests

### Basic Commands

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage

# Run specific test types
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests (requires emulators)
npm run test:e2e          # E2E tests

# CI mode (for GitHub Actions)
npm run test:ci
```

### Running Specific Tests

```bash
# Run a specific test file
npm test -- firestore.service.test.ts

# Run tests matching a pattern
npm test -- --testNamePattern="should submit job"

# Run tests with verbose output
npm test -- --verbose
```

## Writing Tests

### Unit Tests

Unit tests focus on testing individual functions or classes in isolation with mocked dependencies.

**Example Service Test:**

```typescript
import { JobQueueService } from "../../services/job-queue.service"
import { createMockLogger } from "../helpers/test-utils"

// Mock external dependencies
jest.mock("../../config/firestore", () => ({
  createFirestoreInstance: jest.fn(() => mockFirestore),
}))

describe("JobQueueService", () => {
  let service: JobQueueService
  let mockLogger: ReturnType<typeof createMockLogger>

  beforeEach(() => {
    jest.clearAllMocks()
    mockLogger = createMockLogger()
    service = new JobQueueService(mockLogger)
  })

  it("should submit a job successfully", async () => {
    // Arrange
    const jobData = {
      url: "https://example.com/job",
      companyName: "Test Company",
      userId: "user-123",
    }

    // Act
    const result = await service.submitJob(
      jobData.url,
      jobData.companyName,
      jobData.userId
    )

    // Assert
    expect(result.id).toBeDefined()
    expect(result.status).toBe("pending")
    expect(mockLogger.info).toHaveBeenCalled()
  })
})
```

### Integration Tests

Integration tests verify that components work correctly with real external services (via emulators).

**Example Firestore Integration Test:**

```typescript
describe("Firestore Integration", () => {
  beforeAll(() => {
    // Ensure emulator is configured
    process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080"
  })

  afterEach(async () => {
    // Clean up test data after each test
    const db = getFirestore()
    // Delete test documents...
  })

  it("should create and retrieve document", async () => {
    const testData = { name: "Test", status: "active" }
    const docId = await service.createDocument("test-collection", testData)
    
    const retrieved = await service.getDocument("test-collection", docId)
    expect(retrieved).toMatchObject(testData)
  })
})
```

### E2E Tests

End-to-end tests validate complete user workflows from start to finish.

**Example E2E Test:**

```typescript
describe("Job Submission Workflow", () => {
  it("should complete full job submission flow", async () => {
    // Step 1: Submit job
    const queueItem = await submitJob(jobData, context)
    expect(queueItem.status).toBe("pending")

    // Step 2: Check status
    const status = await getQueueStatus({ queueItemId: queueItem.id }, context)
    expect(status.id).toBe(queueItem.id)

    // Step 3: Verify in database
    const doc = await firestore.collection("job-queue").doc(queueItem.id).get()
    expect(doc.exists).toBe(true)
  })
})
```

## Test Utilities

The `test-utils.ts` file provides common utilities:

### Mock Factories

```typescript
// Create mock logger
const mockLogger = createMockLogger()

// Create mock Firestore instance
const mockFirestore = createMockFirestore()

// Create mock authenticated request
const mockRequest = createMockAuthRequest({ uid: "user-123" })

// Create mock response
const mockResponse = createMockResponse()
```

### Test Data Factories

```typescript
// Create test queue item
const queueItem = createTestQueueItem({ status: "pending" })

// Create test generation request
const request = createTestGenerationRequest({ generateType: "resume" })

// Create test content item
const contentItem = createTestContentItem({ type: "company" })
```

## Coverage

### Current Coverage

Run `npm run test:coverage` to see current coverage statistics:

```
Overall: 7.16%
- firestore.service.ts: 97.67% ✅
- job-queue.service.ts: 45.27%
- date-format.ts: 90.9% ✅
- generation-steps.ts: 75% ✅
```

### Coverage Targets

- **Overall**: Incrementally improving towards >80%
- **Services**: >80% for all service classes
- **Critical business logic**: >90%
- **Utilities**: >80%

### Viewing Coverage Reports

After running `npm run test:coverage`, view the HTML report:

```bash
# macOS
open coverage/lcov-report/index.html

# Linux
xdg-open coverage/lcov-report/index.html

# Windows
start coverage/lcov-report/index.html
```

## Best Practices

### Test Organization

1. **Group related tests** with `describe` blocks
2. **Use descriptive test names** following "should..." pattern
3. **One assertion focus per test** when possible
4. **Setup and teardown** with `beforeEach`/`afterEach`

### Mocking

1. **Mock external dependencies** at module level
2. **Use factory functions** for consistent mock data
3. **Reset mocks** between tests with `jest.clearAllMocks()`
4. **Mock only what you need** to keep tests simple

### Test Data

1. **Use factories** from `test-utils.ts` for consistency
2. **Make tests independent** - each test should work in isolation
3. **Clean up after tests** especially for integration tests
4. **Use realistic data** that represents actual use cases

### Performance

1. **Keep unit tests fast** - under 100ms per test
2. **Limit integration tests** - they're slower
3. **Use appropriate timeouts** for async operations
4. **Parallelize when possible** - Jest does this by default

## Continuous Integration

Tests run automatically on every pull request via GitHub Actions:

```yaml
# .github/workflows/test.yml
- name: Run tests
  run: npm run test:ci
```

The CI pipeline:
- Runs all tests in parallel
- Generates coverage reports
- Fails if coverage thresholds aren't met
- Uploads coverage to code coverage services (future)

## Troubleshooting

### Common Issues

**Tests hanging:**
- Check for missing `done()` callbacks or unresolved promises
- Increase timeout with `jest.setTimeout(10000)`

**Module resolution errors:**
- Ensure `jest.config.js` has proper TypeScript configuration
- Check that `tsconfig.json` includes test files

**Firestore emulator connection failures:**
- Ensure emulator is running: `firebase emulators:start`
- Check `FIRESTORE_EMULATOR_HOST` environment variable

**Coverage not updating:**
- Clear Jest cache: `jest --clearCache`
- Delete coverage folder and re-run

## Future Enhancements

- [ ] Add snapshot testing for API responses
- [ ] Implement visual regression testing for PDF generation
- [ ] Add performance benchmarks
- [ ] Set up mutation testing
- [ ] Integrate with code coverage services (Codecov/Coveralls)
- [ ] Add contract testing for external APIs

## Resources

- [Jest Documentation](https://jestjs.io/)
- [Firebase Functions Testing](https://firebase.google.com/docs/functions/unit-testing)
- [Firebase Emulators](https://firebase.google.com/docs/emulator-suite)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)

---

Last Updated: 2025-10-21
