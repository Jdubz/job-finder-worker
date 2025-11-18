# GAP-TEST-BE-1 — No Test Coverage for Backend Cloud Functions

- **Status**: To Do
- **Owner**: Worker B
- **Priority**: P0 (Critical)
- **Labels**: priority-p0, repository-backend, type-testing, critical
- **Estimated Effort**: 3-4 days
- **Dependencies**: None
- **Related**: Identified in comprehensive gap analysis

## What This Issue Covers

Create comprehensive test suite for job-finder-BE Cloud Functions. Currently there is **almost no test coverage** (only Firestore rules tests exist), creating critical risk of deploying broken code to production.

## Context

**Current State**:

- Only test files: Firestore security rules tests
- No unit tests for Cloud Functions
- No integration tests for API endpoints
- No smoke tests after deployment
- **Result**: Cannot verify functions work before deploying

**Critical Risk**:

- Breaking changes deployed to production
- API contract violations undetected
- Data corruption possible
- No safety net for refactoring

**Why This Is P0 Critical**:

- Backend is the core of the application
- Handles all business logic and data access
- No tests = no confidence in deployments
- Production failures likely without coverage

## Tasks

### 1. Set Up Testing Infrastructure

- [ ] Install Jest + ts-jest for TypeScript
- [ ] Create `jest.config.js` with Firebase emulator support
- [ ] Add test scripts to package.json
- [ ] Configure test environment variables
- [ ] Set up Firebase Admin SDK mocking

### 2. Unit Tests for Core Functions

- [ ] Test job queue processing functions
- [ ] Test job matching functions
- [ ] Test company management functions
- [ ] Test authentication helpers
- [ ] Test data validation utilities
- [ ] Target: 70%+ code coverage

### 3. Integration Tests for API Endpoints

- [ ] Test callable functions with Firebase emulators
- [ ] Test HTTP functions with supertest
- [ ] Test authentication/authorization flows
- [ ] Test error handling
- [ ] Test data validation
- [ ] Target: All endpoints covered

### 4. Add to CI Pipeline

- [ ] Update `.github/workflows/ci.yml`
- [ ] Run tests before build
- [ ] Fail CI if tests fail
- [ ] Report coverage metrics

### 5. Documentation

- [ ] Document test structure
- [ ] Add testing guide to README
- [ ] Document how to run tests locally
- [ ] Document mocking strategies

## Proposed Test Structure

```
job-finder-BE/
├── functions/
│   ├── src/
│   │   ├── functions/
│   │   ├── services/
│   │   └── utils/
│   ├── tests/
│   │   ├── unit/
│   │   │   ├── functions/
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
│   │   │   └── firestore/
│   │   ├── helpers/
│   │   │   ├── testSetup.ts
│   │   │   ├── mockData.ts
│   │   │   └── emulatorHelpers.ts
│   │   └── __mocks__/
│   └── jest.config.js
```

## Example Test Configuration

### jest.config.js

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

### Example Unit Test

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

### Example Integration Test

```typescript
// tests/integration/api/jobQueue.api.test.ts
import { initializeTestApp } from "../../helpers/emulatorHelpers";
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

## Acceptance Criteria

- [ ] Jest configured and working
- [ ] Unit tests for all Cloud Functions (70%+ coverage)
- [ ] Integration tests for all API endpoints
- [ ] Tests run in CI and block deployment on failure
- [ ] All tests pass locally and in CI
- [ ] Test documentation complete
- [ ] Coverage reports generated

## Testing Strategy

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

## Benefits

- **Safety**: Can verify changes don't break functionality
- **Confidence**: Deploy with confidence knowing tests pass
- **Refactoring**: Safe to improve code structure
- **Documentation**: Tests document expected behavior
- **Debugging**: Faster to identify root causes
- **Regression Prevention**: Catch bugs before production

## Dependencies Installation

```bash
cd job-finder-BE/functions
npm install --save-dev \
  jest \
  ts-jest \
  @types/jest \
  supertest \
  @types/supertest \
  firebase-functions-test
```

## Related Issues

- GAP-TEST-BE-2: Add smoke tests after deployment (depends on this)
- GAP-SEC-AUTH-1: API authentication (easier to test with test suite)
- BE-CICD-1: Repair BE CI/CD (needs working tests)

## Notes

- This is **CRITICAL** for production readiness
- No backend tests = cannot deploy safely
- Should be highest priority after critical workflow fixes
- Consider pairing with a developer experienced in Firebase testing
