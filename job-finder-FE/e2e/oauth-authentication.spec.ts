import { test, expect } from '@playwright/test'
import { ROUTES } from '../src/types/routes'
import { getAuthIcon, openAuthModal } from './utils/ui'
import { loginWithDevToken } from './fixtures/auth'

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
    // Authenticate using dev token for viewer
    await loginWithDevToken(context, 'dev-viewer-token')
    const page = await context.newPage()

    await page.goto(ROUTES.HOME, { waitUntil: 'domcontentloaded' })
    await expect(getAuthIcon(page, 'viewer')).toBeVisible({ timeout: 15000 })
    const viewerDialog = await openAuthModal(page, 'viewer')
    await expect(viewerDialog.getByText(/dev-viewer@jobfinder\.dev/i)).toBeVisible({ timeout: 15000 })
    await page.keyboard.press('Escape')

    // Should be able to access authenticated pages
    await page.goto(ROUTES.JOB_APPLICATIONS, { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(ROUTES.JOB_APPLICATIONS)

    // Should be able to view AI Prompts (public for viewing)
    await page.goto(ROUTES.AI_PROMPTS, { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(ROUTES.AI_PROMPTS)

    // Should NOT be able to access admin-only pages
    await page.goto(ROUTES.QUEUE_MANAGEMENT, { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(ROUTES.UNAUTHORIZED, { timeout: 10000 })

    await page.close()
  })

  test('successful authentication with admin email grants admin access', async ({ context }) => {
    // Authenticate using dev token for admin
    await loginWithDevToken(context, 'dev-admin-token')
    const page = await context.newPage()

    await page.goto(ROUTES.HOME, { waitUntil: 'domcontentloaded' })
    await expect(getAuthIcon(page, 'owner')).toBeVisible({ timeout: 15000 })
    const adminDialog = await openAuthModal(page, 'owner')
    await expect(adminDialog.getByText(/dev-admin@jobfinder\.dev/i).first()).toBeVisible({ timeout: 15000 })
    await page.keyboard.press('Escape')

    // Should be able to access all pages including admin pages
    await page.goto(ROUTES.AI_PROMPTS, { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(ROUTES.AI_PROMPTS)

    await page.goto(ROUTES.QUEUE_MANAGEMENT, { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(ROUTES.QUEUE_MANAGEMENT)

    await page.goto(ROUTES.JOB_FINDER_CONFIG, { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(ROUTES.JOB_FINDER_CONFIG)

    // Note: There is no dedicated Settings page
    await page.close()
  })

  test('sign out clears authentication state', async ({ context }) => {
    // Authenticate using dev token for viewer
    await loginWithDevToken(context, 'dev-viewer-token')
    const page = await context.newPage()

    await page.goto(ROUTES.HOME, { waitUntil: 'domcontentloaded' })
    await expect(getAuthIcon(page, 'viewer')).toBeVisible({ timeout: 15000 })

    const authDialog = await openAuthModal(page, 'viewer')
    const signOutButton = authDialog.getByRole('button', { name: /sign out|log out/i }).first()
    await expect(signOutButton).toBeVisible({ timeout: 10000 })
    await signOutButton.click({ timeout: 10000 })

    // Should now see sign in button instead of user menu
    await expect(getAuthIcon(page, 'anonymous')).toBeVisible({ timeout: 10000 })

    await page.close()
  })

  test('authentication state persists across page reloads', async ({ context }) => {
    // Authenticate using dev token for viewer
    await loginWithDevToken(context, 'dev-viewer-token')
    const page = await context.newPage()

    await page.goto(ROUTES.HOME, { waitUntil: 'domcontentloaded' })
    await expect(getAuthIcon(page, 'viewer')).toBeVisible({ timeout: 15000 })

    // Reload page
    await page.reload({ waitUntil: 'domcontentloaded' })

    // Should still be signed in (session cookie persists)
    await expect(getAuthIcon(page, 'viewer')).toBeVisible({ timeout: 15000 })

    // Navigate to another page
    await page.goto(ROUTES.JOB_APPLICATIONS, { waitUntil: 'domcontentloaded' })

    // Should still be signed in
    await expect(getAuthIcon(page, 'viewer')).toBeVisible({ timeout: 15000 })

    await page.close()
  })

  test('authentication state persists across navigation', async ({ context }) => {
    // Authenticate using dev token for viewer
    await loginWithDevToken(context, 'dev-viewer-token')
    const page = await context.newPage()

    await page.goto(ROUTES.HOME, { waitUntil: 'domcontentloaded' })
    await expect(getAuthIcon(page, 'viewer')).toBeVisible({ timeout: 15000 })

    await page.goto(ROUTES.CONTENT_ITEMS, { waitUntil: 'domcontentloaded' })
    await expect(getAuthIcon(page, 'viewer')).toBeVisible({ timeout: 15000 })

    await page.goto(ROUTES.DOCUMENT_BUILDER, { waitUntil: 'domcontentloaded' })
    await expect(getAuthIcon(page, 'viewer')).toBeVisible({ timeout: 15000 })

    await page.close()
  })

  // These tests are no longer relevant with proper backend session auth
  // The backend validates sessions, not localStorage tokens

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
