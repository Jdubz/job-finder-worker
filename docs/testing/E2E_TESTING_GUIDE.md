# E2E Testing Guide

> Status: Active
> Owner: @jdubz
> Last Updated: 2025-12-09

## Overview

This project uses two complementary E2E testing approaches:

1. **Playwright**: Browser-based UI tests for frontend workflows
2. **Vitest**: API integration tests for backend + frontend client interactions

## Quick Start

### Run All E2E Tests

```bash
# From project root (runs both test suites in parallel)
npm run test:e2e:all

# Note: Output may be interleaved. For cleaner output, run sequentially:
npm run test:e2e:vitest && npm run test:e2e:playwright
```

### Run Playwright Tests Only

```bash
# From project root
npm run test:e2e:playwright

# From job-finder-FE directory
npm run test:e2e
```

### Run Vitest Integration Tests Only

```bash
# From project root
npm run test:e2e:vitest
```

## Playwright E2E Tests

### Test Location

All Playwright tests are in `job-finder-FE/e2e/*.spec.ts`

### Running Tests

```bash
# Run all tests headless
npm run test:e2e --workspace job-finder-FE

# Run critical tests only
npm run test:e2e:critical --workspace job-finder-FE

# Run with UI mode (interactive)
npm run test:e2e:ui --workspace job-finder-FE

# Run in headed mode (see browser)
npm run test:e2e:headed --workspace job-finder-FE

# Debug a specific test
npm run test:e2e:debug --workspace job-finder-FE
```

### What Playwright Tests Cover

- ✅ OAuth authentication flows
- ✅ Admin route protection
- ✅ Owner navigation and permissions
- ✅ Document builder workflows
- ✅ Content items CRUD operations
- ✅ Queue management UI
- ✅ Configuration and prompts management

### Writing Playwright Tests

```typescript
import { test, expect } from "@playwright/test"
import { applyAuthState, ownerAuthState } from "./fixtures/auth"
import { seedJobMatch } from "./fixtures/api-client"

test("user can create and view job match", async ({ page, request }) => {
  // Seed data via API
  const jobId = await seedJobMatch(request, {
    jobTitle: "Test Engineer",
    companyName: "Test Co",
    matchScore: 90,
  })

  // Apply authentication
  await applyAuthState(page, ownerAuthState())

  // Navigate and test UI
  await page.goto("/job-matches")
  await expect(page.getByText("Test Engineer")).toBeVisible()
})
```

### Test Fixtures

**Authentication**:
- `ownerAuthState()` - Admin user with full access
- `viewerAuthState({ email })` - Read-only user

**API Helpers**:
- `seedJobMatch(request, data)` - Create job match
- `seedQueueJob(request, data)` - Create queue item

### Test Infrastructure

Playwright tests run against:
- **API Server**: In-memory SQLite database (port 5080)
- **Frontend**: Vite dev server (port 5173)
- **Auth**: Bypass mode with mock tokens

Both servers are automatically started by Playwright's `webServer` config.

## Vitest Integration Tests

### Test Location

Integration tests are in `tests/e2e/job-pipeline.e2e.test.ts`

### Running Tests

```bash
# From project root
npm run test:e2e

# With coverage
npm run test:e2e -- --coverage
```

### What Vitest Tests Cover

- ✅ Full job pipeline (submit → process → match)
- ✅ Frontend API clients (QueueClient, JobMatchesClient, etc.)
- ✅ Queue administration flows
- ✅ Content items management via API
- ✅ Configuration updates
- ✅ Prompts and generator documents

### Writing Vitest Integration Tests

```typescript
import { describe, it, expect } from "vitest"

describe("Job pipeline integration", () => {
  it("queues a job, runs worker, and exposes matches", async () => {
    // Submit job via API
    const queueRes = await authorizedRequest("/queue/jobs", {
      method: "POST",
      body: JSON.stringify({
        url: "https://example.com/jobs/test",
        companyName: "Test Co",
        metadata: { title: "Test Engineer" },
      }),
    })

    // Run mock worker to process
    const processedIds = await runMockWorker(server.apiBase, server.authToken)

    // Verify match was created
    const matchesRes = await authorizedRequest("/job-matches")
    expect(matchesRes.body.data.matches.length).toBeGreaterThan(0)
  })
})
```

## CI Integration

### When E2E Tests Run

E2E tests run on every pull request targeting `main`:
- ✅ Playwright E2E Tests
- ✅ Vitest Integration Tests

Both must pass for PR to be merged.

### CI Configuration

See `.github/workflows/pr-checks.yml`:
- `playwright-e2e` job - Runs Playwright tests
- `vitest-e2e` job - Runs Vitest integration tests

### Test Artifacts

On failure, CI uploads:
- 📊 Playwright HTML report (30 day retention)
- 🎥 Videos of failed tests (7 day retention)
- 📸 Screenshots of failures (7 day retention)
- 📋 JUnit XML results

### Viewing CI Artifacts

1. Go to the failed workflow run
2. Scroll to bottom → "Artifacts" section
3. Download `playwright-report` or `playwright-results`

## Debugging Failed Tests

### Local Debugging

```bash
# Run in debug mode (opens Playwright Inspector)
npm run test:e2e:debug --workspace job-finder-FE

# Run in headed mode (see browser actions)
npm run test:e2e:headed --workspace job-finder-FE

# Run with UI mode (interactive test explorer)
npm run test:e2e:ui --workspace job-finder-FE
```

### CI Debugging

1. Download test artifacts from failed run
2. Extract `playwright-report.zip`
3. Open `index.html` in browser
4. Click on failed test to see:
   - Screenshots at failure point
   - Video replay
   - Console logs
   - Network requests

### Common Issues

**Flaky Tests**:
- CI automatically retries failed tests up to 2 times
- If test passes on retry, it's marked as "flaky"
- Review flaky tests and add proper waits

**Timeouts**:
- Default action timeout: 5 seconds
- Default navigation timeout: 10 seconds
- Increase if needed: `test.setTimeout(60000)`

**Database State**:
- Each test suite gets a fresh in-memory database
- Tests should be independent and not rely on order

## Best Practices

### ✅ Do

- Use semantic selectors: `getByRole`, `getByLabel`, `getByText`
- Tag critical tests with `@critical`
- Seed data via API, test via UI
- Wait for elements explicitly with `expect().toBeVisible()`
- Use Page Object Model for complex workflows

### ❌ Don't

- Don't use CSS/XPath selectors unless necessary
- Don't hardcode waits with `page.waitForTimeout()`
- Don't test implementation details
- Don't share state between tests
- Don't skip tests without a tracking issue

## Test Organization

```
job-finder-FE/e2e/
├── fixtures/
│   ├── auth.ts              # Authentication helpers
│   └── api-client.ts        # API seeding utilities
├── admin-route-protection.spec.ts
├── authenticated-viewer.spec.ts
├── content-items-admin.spec.ts
├── document-builder.spec.ts
├── oauth-authentication.spec.ts
├── owner-config-and-prompts.spec.ts
├── owner-content-and-queue.spec.ts
├── owner-navigation.spec.ts
├── queue-events.spec.ts
└── unauthenticated-user.spec.ts

tests/e2e/
├── helpers/
│   ├── test-server.ts       # Test server setup
│   └── mock-worker.ts       # Mock worker logic
└── job-pipeline.e2e.test.ts # Integration tests
```

## Performance

### Test Execution Times

- Playwright tests: ~3-5 minutes (parallel)
- Vitest integration: ~30-60 seconds
- Total e2e suite: ~5-6 minutes

### Optimization Tips

1. **Run tests in parallel**: Playwright runs 2-4 workers
2. **Use fixtures**: Reuse authentication state
3. **Seed via API**: Faster than clicking through UI
4. **Tag critical tests**: Run important tests first
5. **Skip unnecessary waits**: Use auto-waiting features

## Troubleshooting

### Playwright Browsers Not Installed

```bash
npx playwright install --with-deps chromium
```

### Port Already in Use

```bash
# Kill process on port 5080 (API)
lsof -ti:5080 | xargs kill -9

# Kill process on port 5173 (Frontend)
lsof -ti:5173 | xargs kill -9
```

### Database Locked

In-memory databases are isolated per test run. If you see lock errors:
- Ensure only one test suite runs at a time
- Check for lingering processes

### Cannot Connect to API

```bash
# Check if API server is running
curl http://127.0.0.1:5080/healthz

# Check logs
cd job-finder-BE/server
npm run dev
```

## References

- [Playwright Documentation](https://playwright.dev/)
- [Vitest Documentation](https://vitest.dev/)
- [Testing Best Practices](https://playwright.dev/docs/best-practices)
- [CI/CD Configuration](../../.github/workflows/pr-checks.yml)
- [E2E Improvements Plan](./E2E_TEST_IMPROVEMENTS.md)
