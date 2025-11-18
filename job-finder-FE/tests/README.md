# Integration Tests

This directory contains comprehensive integration tests for the Job Finder Frontend application, focusing on API integrations with the job-finder-BE backend.

## Test Structure

```
tests/
├── integration/          # Integration tests for API endpoints
│   ├── authentication.test.ts    # Auth flows and token management
│   ├── contentItems.test.ts      # Content items CRUD operations
│   ├── generator.test.ts         # Document generation API
│   ├── jobQueue.test.ts          # Job queue submission and management
│   ├── jobMatches.test.ts        # Job match retrieval and updates
│   └── errorHandling.test.ts     # Error scenarios and edge cases
├── fixtures/             # Mock data for testing
│   └── mockData.ts              # Test data fixtures
├── utils/                # Test utilities
│   └── testHelpers.ts           # Helper functions for tests
├── setup.ts              # Integration test setup
└── README.md             # This file
```

## Running Tests

### All Integration Tests

```bash
npm run test:integration
```

### Specific Test File

```bash
npm run test:integration -- authentication.test.ts
```

### Watch Mode

```bash
npm run test:watch
```

### With Coverage

```bash
npm run test:coverage
```

## Test Categories

### 1. API Client Tests

- **Generator API**: Document generation (resumes, cover letters)
- **Content Items API**: CRUD operations for experience, projects, skills
- **Job Queue API**: Job submission and queue management
- **Job Matches API**: Job match retrieval and filtering
- **Authentication**: User sign-in, sign-out, token management

### 2. Error Handling Tests

- Network failures and timeouts
- Authentication errors (401, 403)
- Validation errors (400)
- Server errors (500)
- Rate limiting (429)

### 3. Data Validation Tests

- Request/response structure validation
- Type safety and data integrity
- Timestamp and relationship consistency
- Array field validation

## Test Configuration

### Environment Variables

Tests use environment variables from `.env.test`:

```env
# Firebase Configuration
VITE_FIREBASE_API_KEY=test-api-key
VITE_FIREBASE_PROJECT_ID=demo-test-project
VITE_USE_EMULATORS=true

# Test User Credentials
VITE_TEST_USER_EMAIL=test@example.com
VITE_TEST_USER_PASSWORD=testpassword123
VITE_TEST_EDITOR_EMAIL=editor@example.com
VITE_TEST_EDITOR_PASSWORD=editorpassword123
```

### Firebase Emulator Setup

For full integration testing with Firebase:

1. Install Firebase CLI:

   ```bash
   npm install -g firebase-tools
   ```

2. Start Firebase emulators:

   ```bash
   firebase emulators:start
   ```

3. Run tests:
   ```bash
   npm run test:integration
   ```

## Test Results

### Current Status (Without Backend)

- **Total Tests**: 178
- **Passing**: 36 (structure validation, configuration tests)
- **Skipped**: 119 (conditional tests requiring backend)
- **Failing**: 23 (network calls requiring backend)

### With Firebase Emulator

All tests should pass when Firebase emulator is running, as they can:

- Authenticate test users
- Make actual API calls
- Test real-time data synchronization
- Validate end-to-end workflows

## Writing New Tests

### Basic Integration Test Template

```typescript
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest"
import { yourClient } from "@/api/your-client"
import { signInTestUser, cleanupTestAuth } from "../utils/testHelpers"
import { auth } from "@/config/firebase"

// Skip if Firebase is mocked
const isFirebaseMocked = typeof vi !== "undefined" && vi.isMockFunction(auth.currentUser as never)
const describeIntegration = isFirebaseMocked ? describe.skip : describe

describeIntegration("Your API Integration", () => {
  beforeAll(async () => {
    await signInTestUser("regular")
  })

  beforeEach(async () => {
    await cleanupTestAuth()
    await signInTestUser("regular")
  })

  describe("Your Test Suite", () => {
    it("should test something", async () => {
      // Your test code
      expect(true).toBe(true)
    })
  })
})
```

### Using Test Helpers

```typescript
import {
  signInTestUser, // Sign in test user
  cleanupTestAuth, // Sign out and cleanup
  getTestAuthToken, // Get auth token
  makeAuthenticatedRequest, // Make authenticated API call
  makeUnauthenticatedRequest, // Make unauthenticated API call
  generateTestId, // Generate unique test ID
  waitFor, // Wait for async condition
  delay, // Delay execution
} from "../utils/testHelpers"
```

### Using Mock Data

```typescript
import {
  mockJobMatch,
  mockQueueItem,
  mockExperienceItem,
  mockProjectItem,
  mockSkillItem,
  mockQueueStats,
  mockErrorResponses,
} from "../fixtures/mockData"
```

## Best Practices

### 1. Test Isolation

- Clean up authentication between tests
- Don't rely on test execution order
- Use unique IDs for test data

### 2. Assertions

- Test both success and failure cases
- Validate data structure and content
- Check edge cases and boundaries

### 3. Error Handling

- Test all error scenarios (4xx, 5xx)
- Validate error messages and codes
- Test retry and recovery behavior

### 4. Performance

- Use appropriate timeouts
- Mock expensive operations when possible
- Run tests in parallel when safe

## Troubleshooting

### Tests Failing with Network Errors

**Problem**: Tests fail with `auth/network-request-failed`

**Solution**: These tests require Firebase emulator or real backend:

```bash
firebase emulators:start
npm run test:integration
```

### Tests Skipped

**Problem**: Tests are skipped with `describe.skip`

**Reason**: Firebase is mocked (unit test mode). These tests are designed for integration testing with real Firebase connections.

### Authentication Errors

**Problem**: Tests fail with auth errors

**Solution**:

1. Check `.env.test` has correct credentials
2. Ensure Firebase emulator is running
3. Verify test users exist in emulator

### Timeout Errors

**Problem**: Tests timeout waiting for responses

**Solution**:

1. Increase test timeout in test file
2. Check backend is responsive
3. Verify network connectivity

## CI/CD Integration

### GitHub Actions

Tests can be run in CI/CD with Firebase emulators:

```yaml
- name: Setup Firebase Emulators
  run: npm install -g firebase-tools

- name: Start Firebase Emulators
  run: firebase emulators:start --only auth,firestore &

- name: Run Integration Tests
  run: npm run test:integration
```

## Additional Resources

- [Vitest Documentation](https://vitest.dev/)
- [Firebase Testing Guide](https://firebase.google.com/docs/rules/unit-tests)
- [Testing Best Practices](https://kentcdodds.com/blog/write-tests)

## Contributing

When adding new tests:

1. Follow existing test structure and naming conventions
2. Add tests for both success and error cases
3. Include data validation tests
4. Update this README if adding new test categories
5. Ensure tests can run both with and without backend

## Support

For questions or issues with tests:

- Check existing test files for examples
- Review test helpers and mock data
- Consult the main [CLAUDE.md](../CLAUDE.md) for project context
