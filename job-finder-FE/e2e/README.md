# End-to-End (E2E) Tests

This directory contains Playwright-based E2E tests that validate critical user workflows across the entire Job Finder application.

## Running E2E Tests

### All E2E Tests

```bash
npm run test:e2e
```

### Run with UI (Interactive)

```bash
npm run test:e2e:ui
```

### Run in Headed Mode (See Browser)

```bash
npm run test:e2e:headed
```

### Debug Mode

```bash
npm run test:e2e:debug
```

### Specific Test File

```bash
npx playwright test auth.spec.ts
```

## Test Structure

```
e2e/
├── auth.spec.ts          # Authentication workflows
├── navigation.spec.ts    # Navigation and routing
└── README.md            # This file
```

## Test Categories

### 1. Authentication Tests (`auth.spec.ts`)

- Protected route access and redirects
- Authentication modal interaction
- Session persistence across page reloads
- Session persistence across tabs
- Editor role enforcement

### 2. Navigation Tests (`navigation.spec.ts`)

- Homepage loading
- Navigation links functionality
- 404 page handling
- Protected page access
- Responsive design across viewports

## Prerequisites

### 1. Development Server

Tests require the dev server to be running:

```bash
npm run dev
```

Server should be accessible at `http://localhost:5173` (default).

### 2. Environment Variables

Create `.env.test` with necessary configuration:

```env
# Test Base URL
PLAYWRIGHT_BASE_URL=http://localhost:5173

# Firebase Configuration
VITE_FIREBASE_PROJECT_ID=static-sites-257923
VITE_USE_EMULATORS=false

# Optional: Test User Credentials (if testing authenticated flows)
VITE_TEST_USER_EMAIL=your-test-user@example.com
VITE_TEST_USER_PASSWORD=your-test-password
```

## Test Results

After running tests, view the HTML report:

```bash
npx playwright show-report
```

## Writing New E2E Tests

### Basic Test Template

```typescript
import { test, expect } from '@playwright/test'

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to starting page
    await page.goto('/')
  })

  test('should do something', async ({ page }) => {
    // Interact with page
    await page.click('button[type="submit"]')

    // Assert expectations
    await expect(page).toHaveURL(/\/dashboard/)
  })
})
```

### Best Practices

1. **Test User Flows, Not Implementation**
   - Focus on what users do, not internal code
   - Test complete workflows, not individual functions

2. **Use Stable Selectors**
   - Prefer `getByRole`, `getByLabel`, `getByText`
   - Avoid CSS selectors that may change
   - Add `data-testid` attributes for complex selections

3. **Handle Authentication**
   - Most tests skip authentication (test redirects instead)
   - Tests requiring auth should use `test.skip` in CI
   - Consider using Playwright's authentication storage

4. **Wait Appropriately**
   - Use Playwright's auto-waiting features
   - Avoid `page.waitForTimeout()` - use specific waits
   - Wait for network requests to complete when needed

5. **Test Isolation**
   - Each test should be independent
   - Clean up any created data
   - Don't rely on test execution order

## Authentication in E2E Tests

Most E2E tests in this suite **do not require authentication**. Instead, they test:

- Redirect behavior for protected routes
- Authentication modal visibility
- Login page accessibility

### Why Not Test Full OAuth Flow?

- Google OAuth requires interactive browser interaction
- Automated OAuth testing is complex and fragile
- Integration tests (in `tests/integration/`) cover auth logic

### Testing Authenticated Flows

If you need to test authenticated user workflows:

1. **Option 1**: Manual authentication before running tests
2. **Option 2**: Use Playwright's storage state to persist auth
3. **Option 3**: Mock authentication (for UI testing only)

Example using storage state:

```typescript
// auth.setup.ts - Run once to authenticate
import { test as setup } from '@playwright/test'

setup('authenticate', async ({ page }) => {
  await page.goto('/login')
  // Perform login
  await page.context().storageState({ path: 'auth.json' })
})

// Your test file
import { test } from '@playwright/test'

test.use({ storageState: 'auth.json' })

test('authenticated test', async ({ page }) => {
  // Already authenticated
})
```

## Debugging Tests

### Debug Specific Test

```bash
npx playwright test --debug auth.spec.ts
```

### View Test Traces

```bash
npx playwright show-trace trace.zip
```

### Headed Mode for Debugging

```bash
npx playwright test --headed --workers=1
```

## CI/CD Integration

Tests can run in GitHub Actions:

```yaml
- name: Install dependencies
  run: npm ci

- name: Install Playwright Browsers
  run: npx playwright install --with-deps

- name: Run E2E tests
  run: npm run test:e2e
```

## Troubleshooting

### Tests Failing with "page.goto: net::ERR_CONNECTION_REFUSED"

**Problem**: Dev server is not running

**Solution**: Start dev server first:

```bash
npm run dev
```

Then in another terminal:

```bash
npm run test:e2e
```

### Tests Timing Out

**Problem**: Page takes too long to load

**Solution**:

1. Increase timeout in test:

```typescript
test('slow test', async ({ page }) => {
  test.setTimeout(60000) // 60 seconds
  // ...
})
```

2. Or configure globally in `playwright.config.ts`

### Authentication Tests Skipped

**Reason**: Tests requiring interactive OAuth are intentionally skipped in CI/automated runs.

**Solution**: These tests are informational - the integration tests cover authentication logic.

## Additional Resources

- [Playwright Documentation](https://playwright.dev/)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Playwright Debugging Guide](https://playwright.dev/docs/debug)

## Contributing

When adding new E2E tests:

1. Focus on critical user workflows
2. Keep tests fast and focused
3. Use descriptive test names
4. Add comments explaining complex interactions
5. Update this README with new test categories
