# Backend Testing Guide

> Status: Active
> Owner: @jdubz
> Last Updated: 2026-01-27

## Overview

This guide covers comprehensive testing for job-finder backend services. **SQLite is the sole datastore** - Firestore was fully migrated away from in late 2025. Currently there is minimal test coverage, creating critical risk of deploying broken code to production.

**Note:** Firebase Authentication is still used for user authentication, but Firestore (database) is completely removed.

## Context

**Current State**:

- Sparse unit/integration coverage
- No smoke tests after deployment
- **Result**: Cannot verify functions work before deploying

**Critical Risk**:

- Breaking changes deployed to production
- API contract violations undetected
- Data corruption possible
- No safety net for refactoring

## Test Structure

```
job-finder-BE/
├── server/
│   ├── src/
│   │   ├── routes/
│   │   ├── services/
│   │   └── utils/
│   ├── tests/
│   │   ├── unit/
│   │   │   ├── routes/
│   │   │   │   ├── jobQueue.test.ts
│   │   │   │   ├── jobMatching.test.ts
│   │   │   │   └── companies.test.ts
│   │   │   ├── services/
│   │   │   └── utils/
│   │   ├── integration/
│   │   │   ├── api/
│   │   │   │   ├── jobQueue.api.test.ts
│   │   │   │   ├── jobMatching.api.test.ts
│   │   │   │   └── companies.api.test.ts
│   │   │   └── (SQLite test database helpers)
│   │   ├── helpers/
│   │   │   ├── testSetup.ts
│   │   │   ├── mockData.ts
│   │   │   └── testHelpers.ts
│   │   └── __mocks__/
│   └── jest.config.js
```

## Setup Procedures

### 1. Install Testing Dependencies

```bash
cd job-finder-BE/server
npm install --save-dev \
  jest \
  ts-jest \
  @types/jest \
  supertest \
  @types/supertest
```

### 2. Configure Jest

Create `jest.config.js`:

```javascript
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src", "<rootDir>/tests"],
  testMatch: ["**/__tests__/**/*.ts", "**/?(*.)+(spec|test).ts"],
  transform: {
    "^.+\\.ts$": "ts-jest",
  },
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.d.ts", "!src/index.ts"],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  setupFilesAfterEnv: ["<rootDir>/tests/helpers/testSetup.ts"],
};
```

### 3. Set Up Test Environment

Configure test environment variables. Note: Firebase Admin SDK mocking is only needed if testing Firebase Authentication flows, not for data storage (which uses SQLite).

### 4. Create Test Helpers

Set up common test fixtures, mock data, and SQLite database helpers in the `tests/helpers/` directory.

## Unit Tests

### Example: Job Queue Function Test

```typescript
// tests/unit/functions/jobQueue.test.ts
import { processJobQueue } from "../../../src/functions/jobQueue";
import { mockJobData } from "../../helpers/mockData";

describe("processJobQueue", () => {
  it("should process valid job queue item", async () => {
    const result = await processJobQueue(mockJobData);

    expect(result.status).toBe("success");
    expect(result.jobId).toBeDefined();
  });

  it("should reject invalid job data", async () => {
    const invalidData = { ...mockJobData, url: "" };

    await expect(processJobQueue(invalidData)).rejects.toThrow(
      "Invalid job URL",
    );
  });
});
```

### Coverage Targets

- Unit tests for all Cloud Functions
- Test job queue processing functions
- Test job matching functions
- Test company management functions
- Test authentication helpers
- Test data validation utilities
- **Target: 70%+ code coverage**

## Integration Tests

### Example: API Endpoint Test

```typescript
// tests/integration/api/jobQueue.api.test.ts
import { initializeTestApp } from "../../helpers/testHelpers";
import { mockJobData } from "../../helpers/mockData";

describe("Job Queue API", () => {
  let testEnv;

  beforeAll(async () => {
    testEnv = await initializeTestApp();
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it("should accept job submission", async () => {
    const result = await testEnv.functions.submitJob(mockJobData);

    expect(result.success).toBe(true);
    expect(result.jobId).toBeDefined();
  });
});
```

### Coverage Targets

- Test callable functions with Firebase emulators
- Test HTTP functions with supertest
- Test authentication/authorization flows
- Test error handling
- Test data validation
- **Target: All endpoints covered**

## Implementation Strategy

### Phase 1: Infrastructure (1 day)

- Set up Jest and Firebase emulators
- Create test helpers and mocks
- Configure CI integration

### Phase 2: Unit Tests (2 days)

- Test core business logic
- Test data validation
- Test utilities and helpers
- Aim for 70%+ coverage

### Phase 3: Integration Tests (1 day)

- Test API endpoints end-to-end
- Test authentication flows
- Test error handling

### Phase 4: Documentation (0.5 days)

- Write testing guide
- Document test patterns
- Add examples

## CI Integration

Update `.github/workflows/ci.yml`:

- Run tests before build
- Fail CI if tests fail
- Report coverage metrics

## Benefits

- **Safety**: Can verify changes don't break functionality
- **Confidence**: Deploy with confidence knowing tests pass
- **Refactoring**: Safe to improve code structure
- **Documentation**: Tests document expected behavior
- **Debugging**: Faster to identify root causes
- **Regression Prevention**: Catch bugs before production

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- jobQueue.test.ts
```

## Best Practices

- Write tests alongside new features
- Test edge cases and error conditions
- Keep tests isolated and independent
- Use descriptive test names
- Mock external dependencies
- Maintain test data fixtures
- Review test quality in code reviews
