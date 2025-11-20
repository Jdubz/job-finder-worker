import { test, expect } from '@playwright/test'
import { ROUTES } from '../src/types/routes'
import adminConfig from '../src/config/admins.json' with { type: 'json' }

const TEST_AUTH_STATE_KEY = '__JF_E2E_AUTH_STATE__'
const TEST_AUTH_TOKEN_KEY = '__JF_E2E_AUTH_TOKEN__'

test.describe('Google OAuth Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Start with clean state
    await page.context().clearCookies()
    // No init script needed - we want empty localStorage for these tests
  })

  // Skip this test - Google OAuth doesn't work in test environment without real client ID
  test.skip('sign in modal appears when clicking sign in button', async ({ page }) => {
    await page.goto(ROUTES.HOME, { waitUntil: 'domcontentloaded' })

    // Find and click the sign in button
    const signInButton = page.getByRole('button', { name: /sign in|log in/i }).first()
    await expect(signInButton).toBeVisible({ timeout: 10000 })
    await signInButton.click()

    // Modal should appear
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 })

    // Google Sign In button should be present
    await expect(page.getByText(/continue with google|sign in with google/i).first()).toBeVisible({ timeout: 10000 })
  })

  // Skip this test - requires OAuth modal which won't work in test environment
  test.skip('sign in modal can be closed', async ({ page }) => {
    await page.goto(ROUTES.HOME)

    const signInButton = page.getByRole('button', { name: /sign in|log in/i }).first()
    if (await signInButton.isVisible()) {
      await signInButton.click()

      const modal = page.getByRole('dialog')
      await expect(modal).toBeVisible({ timeout: 5000 })

      // Close modal (look for X button or close button)
      const closeButton = page.getByRole('button', { name: /close/i }).first()
      if (await closeButton.isVisible()) {
        await closeButton.click()
        await expect(modal).not.toBeVisible()
      } else {
        // Try ESC key
        await page.keyboard.press('Escape')
        await expect(modal).not.toBeVisible()
      }
    }
  })

  // Skip this test - requires OAuth modal which won't work in test environment
  test.skip('sign in modal appears when trying to access admin page while unauthenticated', async ({ page }) => {
    await page.goto(ROUTES.AI_PROMPTS, { waitUntil: 'domcontentloaded' })

    // Should be on unauthorized page
    await expect(page).toHaveURL(ROUTES.UNAUTHORIZED, { timeout: 10000 })

    // Should have a sign in button/link
    const signInButton = page.getByRole('button', { name: /sign in|log in/i }).first()
    if (await signInButton.isVisible({ timeout: 10000 }).catch(() => false)) {
      await signInButton.click()

      // Modal should appear
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 })
      await expect(page.getByText(/continue with google|sign in with google/i).first()).toBeVisible({ timeout: 10000 })
    }
  })

  test('successful authentication with viewer email redirects correctly', async ({ context }) => {
    // Create new page with auth state
    const page = await context.newPage()
    await page.addInitScript(({ stateKey, tokenKey }) => {
      const viewerAuthState = {
        uid: 'test-viewer-123',
        email: 'viewer@example.com',
        displayName: 'Test Viewer User',
        isOwner: false,
        emailVerified: true,
        token: 'mock-google-token-viewer'
      }

      window.localStorage.setItem(stateKey, JSON.stringify(viewerAuthState))
      window.localStorage.setItem(tokenKey, 'mock-google-token-viewer')
    }, { stateKey: TEST_AUTH_STATE_KEY, tokenKey: TEST_AUTH_TOKEN_KEY })

    await page.goto(ROUTES.HOME, { waitUntil: 'domcontentloaded' })

    // Should show user as signed in (check for email in the page)
    await expect(page.getByText(/viewer@example.com|Test Viewer/i).first()).toBeVisible({ timeout: 15000 })

    // Should be able to access public pages
    await page.goto(ROUTES.JOB_APPLICATIONS, { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(ROUTES.JOB_APPLICATIONS)

    // Should NOT be able to access admin pages
    await page.goto(ROUTES.AI_PROMPTS, { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(ROUTES.UNAUTHORIZED, { timeout: 10000 })

    await page.close()
  })

  test('successful authentication with admin email grants admin access', async ({ context }) => {
    const adminEmail = adminConfig.adminEmails[0] ?? 'contact@joshwentworth.com'

    // Create new page with admin auth state
    const page = await context.newPage()
    await page.addInitScript(({ stateKey, tokenKey, email }) => {
      const adminAuthState = {
        uid: 'test-admin-123',
        email,
        displayName: 'Test Admin User',
        isOwner: true,
        emailVerified: true,
        token: 'mock-google-token-admin'
      }

      window.localStorage.setItem(stateKey, JSON.stringify(adminAuthState))
      window.localStorage.setItem(tokenKey, 'mock-google-token-admin')
    }, { stateKey: TEST_AUTH_STATE_KEY, tokenKey: TEST_AUTH_TOKEN_KEY, email: adminEmail })

    await page.goto(ROUTES.HOME, { waitUntil: 'domcontentloaded' })

    // Should show user as signed in
    await expect(page.getByText(new RegExp(adminEmail, 'i')).first()).toBeVisible({ timeout: 15000 })

    // Should be able to access admin pages
    await page.goto(ROUTES.AI_PROMPTS, { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(ROUTES.AI_PROMPTS)

    await page.goto(ROUTES.QUEUE_MANAGEMENT, { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(ROUTES.QUEUE_MANAGEMENT)

    await page.goto(ROUTES.JOB_FINDER_CONFIG, { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(ROUTES.JOB_FINDER_CONFIG)

    await page.goto(ROUTES.SETTINGS, { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(ROUTES.SETTINGS)

    await page.close()
  })

  test('sign out clears authentication state', async ({ context }) => {
    // Set up authenticated state
    const page = await context.newPage()
    await page.addInitScript(({ stateKey, tokenKey }) => {
      const authState = {
        uid: 'test-user-signout',
        email: 'signout@example.com',
        displayName: 'Sign Out Test',
        isOwner: false,
        emailVerified: true,
        token: 'mock-token-signout'
      }

      window.localStorage.setItem(stateKey, JSON.stringify(authState))
      window.localStorage.setItem(tokenKey, 'mock-token-signout')
    }, { stateKey: TEST_AUTH_STATE_KEY, tokenKey: TEST_AUTH_TOKEN_KEY })

    await page.goto(ROUTES.HOME, { waitUntil: 'domcontentloaded' })

    // Verify signed in
    await expect(page.getByText(/signout@example.com/i).first()).toBeVisible({ timeout: 15000 })

    // Click user menu
    const userButton = page.getByRole('button', { name: /signout@example.com|Sign Out Test|profile/i }).first()
    await userButton.click({ timeout: 10000 })

    // Click sign out
    const signOutButton = page.getByRole('button', { name: /sign out|log out/i }).first()
    await signOutButton.click({ timeout: 10000 })

    // Verify auth cleared
    const authCleared = await page.evaluate(({ stateKey, tokenKey }) => {
      return !localStorage.getItem(stateKey) && !localStorage.getItem(tokenKey)
    }, { stateKey: TEST_AUTH_STATE_KEY, tokenKey: TEST_AUTH_TOKEN_KEY })
    expect(authCleared).toBe(true)

    // Should now see sign in button instead of user menu
    await expect(page.getByRole('button', { name: /sign in|log in/i }).first()).toBeVisible({ timeout: 10000 })

    await page.close()
  })

  test('authentication state persists across page reloads', async ({ context }) => {
    // Set up authenticated state
    const page = await context.newPage()
    await page.addInitScript(({ stateKey, tokenKey }) => {
      const authState = {
        uid: 'test-persist-123',
        email: 'persist@example.com',
        displayName: 'Persist Test',
        isOwner: false,
        emailVerified: true,
        token: 'mock-token-persist'
      }

      window.localStorage.setItem(stateKey, JSON.stringify(authState))
      window.localStorage.setItem(tokenKey, 'mock-token-persist')
    }, { stateKey: TEST_AUTH_STATE_KEY, tokenKey: TEST_AUTH_TOKEN_KEY })

    await page.goto(ROUTES.HOME, { waitUntil: 'domcontentloaded' })

    // Verify signed in
    await expect(page.getByText(/persist@example.com/i).first()).toBeVisible({ timeout: 15000 })

    // Reload page
    await page.reload({ waitUntil: 'domcontentloaded' })

    // Should still be signed in
    await expect(page.getByText(/persist@example.com/i).first()).toBeVisible({ timeout: 15000 })

    // Navigate to another page
    await page.goto(ROUTES.JOB_APPLICATIONS, { waitUntil: 'domcontentloaded' })

    // Should still be signed in
    await expect(page.getByText(/persist@example.com/i).first()).toBeVisible({ timeout: 15000 })

    await page.close()
  })

  test('authentication state persists across navigation', async ({ context }) => {
    // Set up authenticated state
    const page = await context.newPage()
    await page.addInitScript(({ stateKey, tokenKey }) => {
      const authState = {
        uid: 'test-nav-123',
        email: 'nav@example.com',
        displayName: 'Nav Test',
        isOwner: false,
        emailVerified: true,
        token: 'mock-token-nav'
      }

      window.localStorage.setItem(stateKey, JSON.stringify(authState))
      window.localStorage.setItem(tokenKey, 'mock-token-nav')
    }, { stateKey: TEST_AUTH_STATE_KEY, tokenKey: TEST_AUTH_TOKEN_KEY })

    await page.goto(ROUTES.HOME, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/nav@example.com/i).first()).toBeVisible({ timeout: 15000 })

    await page.goto(ROUTES.CONTENT_ITEMS, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/nav@example.com/i).first()).toBeVisible({ timeout: 15000 })

    await page.goto(ROUTES.DOCUMENT_BUILDER, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/nav@example.com/i).first()).toBeVisible({ timeout: 15000 })

    await page.goto(ROUTES.JOB_FINDER, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/nav@example.com/i).first()).toBeVisible({ timeout: 15000 })

    await page.close()
  })

  test('invalid authentication token shows sign in prompt', async ({ context }) => {
    // Set up invalid auth state
    const page = await context.newPage()
    await page.addInitScript((tokenKey) => {
      window.localStorage.setItem(tokenKey, 'invalid-token-format')
    }, TEST_AUTH_TOKEN_KEY)

    await page.goto(ROUTES.HOME, { waitUntil: 'domcontentloaded' })

    // Should see sign in button (not authenticated)
    await expect(page.getByRole('button', { name: /sign in|log in/i }).first()).toBeVisible({ timeout: 15000 })

    await page.close()
  })

  test('missing email in token prevents authentication', async ({ context }) => {
    // Set up auth state without email
    const page = await context.newPage()
    await page.addInitScript(({ stateKey, tokenKey }) => {
      const invalidAuthState = {
        uid: 'test-no-email',
        displayName: 'No Email User',
        isOwner: false,
        emailVerified: true,
        token: 'mock-token-no-email'
        // email is missing
      }

      window.localStorage.setItem(stateKey, JSON.stringify(invalidAuthState))
      window.localStorage.setItem(tokenKey, 'mock-token-no-email')
    }, { stateKey: TEST_AUTH_STATE_KEY, tokenKey: TEST_AUTH_TOKEN_KEY })

    await page.goto(ROUTES.HOME, { waitUntil: 'domcontentloaded' })

    // Should not be authenticated (no email = invalid)
    await expect(page.getByRole('button', { name: /sign in|log in/i }).first()).toBeVisible({ timeout: 15000 })

    await page.close()
  })

  // Skip this test - requires Google OAuth button which won't work in test environment
  test.skip('Google Sign In button uses correct branding', async ({ page }) => {
    await page.goto(ROUTES.HOME)

    const signInButton = page.getByRole('button', { name: /sign in|log in/i }).first()
    if (await signInButton.isVisible()) {
      await signInButton.click()

      // Should see Google-branded button
      const googleButton = page.locator('[role="button"]', { hasText: /continue with google|sign in with google/i })
      await expect(googleButton.first()).toBeVisible({ timeout: 5000 })
    }
  })
})
