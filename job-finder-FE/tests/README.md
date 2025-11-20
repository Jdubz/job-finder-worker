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
# Auth Configuration
VITE_GOOGLE_OAUTH_CLIENT_ID=demo-test-client-id.apps.googleusercontent.com
VITE_AUTH_BYPASS=false

# Test User Credentials
VITE_TEST_USER_EMAIL=test@example.com
VITE_TEST_USER_PASSWORD=testpassword123
VITE_TEST_EDITOR_EMAIL=editor@example.com
VITE_TEST_EDITOR_PASSWORD=editorpassword123
```

### Authentication Helpers

Integration tests now rely on Google Identity Services (GIS). When running locally, provide a test client ID via `.env.test` and allow the mocked GIS helpers (see `src/test/setup.ts`) to simulate login flows—no Firebase CLI, emulators, or service accounts are required.

## Test Results

### Current Status (Without Backend)

- **Total Tests**: 178
- **Passing**: 36 (structure validation, configuration tests)
- **Skipped**: 119 (conditional tests requiring backend)
- **Failing**: 23 (network calls requiring backend)

### With GIS Token Helpers

All tests should pass once the GIS helpers are configured in `src/test/setup.ts`, because they can:

- Authenticate mock users via test credentials
- Make actual API calls against the Node API (or mocked fetch responses)
- Validate end-to-end workflows without spinning up external emulators

## Writing New Tests

### Basic Integration Test Template

```typescript
import { describe, it, expect } from "vitest"
import { yourClient } from "@/api/your-client"
import { signInTestUser } from "../utils/testHelpers"
import { useAuth } from "@/contexts/AuthContext"

describe("Your API Integration", () => {
  const { authenticateWithGoogle } = useAuth()

  beforeAll(async () => {
    await signInTestUser("regular", authenticateWithGoogle)
  })

  it("should test something", async () => {
    const result = await yourClient.getSomething()
    expect(result).toBeDefined()
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

**Problem**: Tests fail with network/auth errors

**Solution**: These tests require the Node API (or mocked fetch responses):

```bash
npm run dev --workspace job-finder-BE/server
npm run test:integration --workspace job-finder-FE
```

### Tests Skipped

**Problem**: Tests are skipped with `describe.skip`

**Reason**: GIS/auth helpers are mocked (unit test mode). Integration tests are designed for real API calls rather than the mocked context.

### Authentication Errors

**Problem**: Tests fail with auth errors

**Solution**:

1. Check `.env.test` has correct GIS client ID and bypass settings
2. Ensure the backend server is running
3. Verify test users exist in the local SQLite database

### Timeout Errors

**Problem**: Tests timeout waiting for responses

**Solution**:

1. Increase test timeout in test file
2. Check backend is responsive
3. Verify network connectivity

## CI/CD Integration

### GitHub Actions

Tests can run in CI/CD without any emulators—just export the expected `.env` values and invoke the integration suite:

```yaml
- name: Install dependencies
  run: npm install

- name: Run integration tests
  env:
    VITE_GOOGLE_OAUTH_CLIENT_ID: ${{ secrets.VITE_GOOGLE_OAUTH_CLIENT_ID }}
    VITE_API_BASE_URL: ${{ secrets.VITE_API_BASE_URL }}
  run: npm run test:integration --workspace job-finder-FE
```

## Additional Resources

- [Vitest Documentation](https://vitest.dev/)
- [Google Identity Services Docs](https://developers.google.com/identity/gsi/web)
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
