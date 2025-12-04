# Frontend End-to-End Tests

Playwright tests live in this folder and exercise the real frontend against the in-memory Express + SQLite backend. Every spec boots its own auth-bypassed owner session and seeds data through the public REST API.

## How It Works

- `npm run test:e2e --workspace job-finder-FE` starts two servers in parallel:
  - `scripts/dev/start-api-e2e.mjs` launches the Node API with `file:...mode=memory` SQLite and a fake Firebase service account. Auth/AppCheck are bypassed with the shared `JF_E2E_AUTH_TOKEN`.
  - `npm run dev --workspace job-finder-FE` runs Vite with `VITE_AUTH_BYPASS=true`, so the app trusts the localStorage auth state injected by each test.
- Tests seed queue items, content items, and job matches via helper functions in `fixtures/api-client.ts`.
- Browsers always run headless; screenshots, traces, and HTML reports are emitted on failure.

## Test Suite Layout

```
e2e/
├── document-builder.spec.ts          # Job match hydration + document builder inputs
├── owner-config-and-prompts.spec.ts  # Stop list, queue + AI settings, and AI prompts flows
├── owner-content-and-queue.spec.ts   # Content CRUD + queue management rendering
├── owner-navigation.spec.ts          # Drawer navigation + owner/guest permissions
└── fixtures/
    ├── api-client.ts                 # REST helpers for seeding data
    └── auth.ts                       # LocalStorage auth bypass utilities
```

## Running the Suite

```bash
# From repo root
npm run test:e2e --workspace job-finder-FE

# Headed / UI / debug options are still available
npm run test:e2e:headed   --workspace job-finder-FE
npm run test:e2e:ui       --workspace job-finder-FE
npm run test:e2e:debug    --workspace job-finder-FE
```

Playwright automatically installs browsers via `npx playwright install` (run once after cloning).

## Writing New Tests

1. **Authenticate up front**
   ```ts
   await applyAuthState(page, ownerAuthState())
   await page.goto("/queue-management")
   ```
2. **Seed state via REST** instead of reaching into the DB. Import helpers from `fixtures/api-client`.
3. **Use accessible selectors** (`getByRole`, `getByLabel`). If selectors are awkward, add a focused `data-testid` to the component rather than brittle CSS.
4. **Keep tests independent.** Each spec assumes a clean, in-memory database; do not depend on execution order.

## CI Expectations

- `PR Checks` run these Playwright specs in parallel with unit, integration, worker, and API e2e tests.
- The deploy workflow skips tests entirely (it only builds + deploys) because merges to `main` must already have a green PR.

## Troubleshooting

- **Port collisions:** `playwright.config.ts` sets `JF_E2E_API_PORT=5080` by default. Override via env if 5080 is busy.
- **Auth bypass issues:** Ensure `localStorage` contains `__JF_E2E_AUTH_STATE__` and `__JF_E2E_AUTH_TOKEN__`. Helpers in `fixtures/auth.ts` handle this automatically.
- **Stuck dev server:** `npm run dev` uses a port guard. If it reuses an old server, stop it (`pkill -f vite`) before rerunning tests.
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
