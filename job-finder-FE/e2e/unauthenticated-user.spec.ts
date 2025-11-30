import { test, expect } from './fixtures/test'
import { ROUTES } from '../src/types/routes'
import { openAuthModal, openNavigationDrawer } from './utils/ui'

test.describe('Unauthenticated User Access', () => {
  test.beforeEach(async ({ page }) => {
    // Ensure we're not authenticated
    await page.context().clearCookies()
    // No init script needed - we want empty localStorage
  })

  test('can access home page (How It Works)', async ({ page }) => {
    await page.goto(ROUTES.HOME)
    await expect(page).toHaveURL(ROUTES.HOME)

    // Verify we're on the How It Works page
    await expect(page.locator('h1, h2').first()).toBeVisible()
  })

  test('can access Content Items page', async ({ page }) => {
    await page.goto(ROUTES.CONTENT_ITEMS, { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(ROUTES.CONTENT_ITEMS)

    // Should see the Content Items interface
    await expect(page.getByRole('heading', { name: /content items/i }).first()).toBeVisible({ timeout: 15000 })
  })

  test('can access Document Builder page', async ({ page }) => {
    await page.goto(ROUTES.DOCUMENT_BUILDER)
    await expect(page).toHaveURL(ROUTES.DOCUMENT_BUILDER)

    // Should see the Document Builder interface
    await expect(page.getByRole('heading', { name: /document builder/i })).toBeVisible()
  })

  test('is redirected from Job Applications page (requires auth)', async ({ page }) => {
    await page.goto(ROUTES.JOB_APPLICATIONS)
    // Job Applications requires authentication - should redirect to home
    await expect(page).toHaveURL(ROUTES.HOME)
  })

  test('can access AI Prompts page (public for viewing)', async ({ page }) => {
    await page.goto(ROUTES.AI_PROMPTS, { waitUntil: 'domcontentloaded' })

    // AI Prompts is public for viewing (editing is admin-only)
    await expect(page).toHaveURL(ROUTES.AI_PROMPTS)
    await expect(page.getByRole('heading', { name: /ai prompts|prompts/i })).toBeVisible()
  })

  test('cannot access Queue Management page (admin only)', async ({ page }) => {
    await page.goto(ROUTES.QUEUE_MANAGEMENT, { waitUntil: 'domcontentloaded' })

    // Unauthenticated users are redirected to HOME for admin-only routes
    await expect(page).toHaveURL(ROUTES.HOME, { timeout: 10000 })
  })

  test('cannot access Job Finder Config page (admin only)', async ({ page }) => {
    await page.goto(ROUTES.JOB_FINDER_CONFIG, { waitUntil: 'domcontentloaded' })

    // Unauthenticated users are redirected to HOME for admin-only routes
    await expect(page).toHaveURL(ROUTES.HOME, { timeout: 10000 })
  })

  // Note: There is no dedicated Settings page - removed test

  test('navigation links work correctly', async ({ page }) => {
    const linksToTest = [
      { name: /home/i, route: ROUTES.HOME },
      { name: /how it works/i, route: ROUTES.HOW_IT_WORKS },
      { name: /experience/i, route: ROUTES.CONTENT_ITEMS },
      { name: /document builder/i, route: ROUTES.DOCUMENT_BUILDER }
    ]

    for (const link of linksToTest) {
      await page.goto(ROUTES.HOME, { waitUntil: 'domcontentloaded' })
      await openNavigationDrawer(page)
      await page.getByRole('link', { name: link.name }).first().click()
      await expect(page).toHaveURL(link.route, { timeout: 10000 })
    }
  })

  test('shows sign in prompt when attempting actions requiring authentication', async ({ page }) => {
    await page.goto(ROUTES.JOB_APPLICATIONS)

    // Try to submit a job application (this should prompt for sign-in)
    const submitButton = page.getByRole('button', { name: /submit|add|create/i }).first()
    if (await submitButton.isVisible()) {
      await submitButton.click()

      // Should see sign-in modal or prompt
      await expect(
        page.getByText(/sign in|log in|authenticate/i).first()
      ).toBeVisible({ timeout: 5000 })
    }
  })

  test('auth modal appears when clicking sign in button', async ({ page }) => {
    await page.goto(ROUTES.HOME)

    const authDialog = await openAuthModal(page, 'anonymous')
    await expect(authDialog.getByText(/sign in/i).first()).toBeVisible({ timeout: 5000 })
    // In production mode, shows Google OAuth component
    // In dev mode, shows role selection buttons (Public, Viewer, Admin)
    // Check for either presence
    const hasGoogleAuth = await authDialog.locator('iframe, [data-google], .g_id_signin').first().isVisible({ timeout: 2000 }).catch(() => false)
    const hasDevModeButtons = await authDialog.getByRole('button', { name: /public|viewer|admin/i }).first().isVisible({ timeout: 2000 }).catch(() => false)
    expect(hasGoogleAuth || hasDevModeButtons).toBe(true)
  })

  test('legal pages are accessible', async ({ page }) => {
    const legalRoutes = [
      ROUTES.TERMS_OF_USE,
      ROUTES.PRIVACY_POLICY,
      ROUTES.COOKIE_POLICY,
      ROUTES.DISCLAIMER
    ]

    for (const route of legalRoutes) {
      await page.goto(route, { waitUntil: 'domcontentloaded' })
      await expect(page).toHaveURL(route)
      await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 15000 })
    }
  })

  test('invalid routes redirect to home', async ({ page }) => {
    await page.goto('/this-page-does-not-exist')
    await expect(page).toHaveURL(ROUTES.HOME)
  })
})
