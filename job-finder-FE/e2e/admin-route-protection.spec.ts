import { test, expect } from '@playwright/test'
import { ROUTES } from '../src/types/routes'
import { openNavigationDrawer } from './utils/ui'
import { loginWithDevToken } from './fixtures/auth'

test.describe('Admin Route Protection', () => {
  test.describe('with admin user', () => {
    test.beforeEach(async ({ context }) => {
      // Authenticate with backend to get session cookie
      await context.clearCookies()
      await loginWithDevToken(context, 'dev-admin-token')
    })

    test('can access AI Prompts page', async ({ page }) => {
      await page.goto(ROUTES.AI_PROMPTS)
      await expect(page).toHaveURL(ROUTES.AI_PROMPTS)
      await expect(page.getByRole('heading', { name: /ai prompts|prompts/i })).toBeVisible()
    })

    test('can access Queue Management page', async ({ page }) => {
      await page.goto(ROUTES.QUEUE_MANAGEMENT)
      await expect(page).toHaveURL(ROUTES.QUEUE_MANAGEMENT)
      await expect(page.getByRole('heading', { name: 'Queue Management' }).first()).toBeVisible()
    })

    test('can access Job Finder Config page', async ({ page }) => {
      await page.goto(ROUTES.JOB_FINDER_CONFIG)
      await expect(page).toHaveURL(ROUTES.JOB_FINDER_CONFIG)
      await expect(page.getByRole('heading', { name: /config|configuration|settings/i })).toBeVisible()
    })

    // Note: There is no dedicated Settings page - removed test

    test('can access all public pages', async ({ page }) => {
      const publicRoutes = [
        ROUTES.HOME,
        ROUTES.CONTENT_ITEMS,
        ROUTES.DOCUMENT_BUILDER,
        ROUTES.JOB_APPLICATIONS,
        ROUTES.AI_PROMPTS  // AI Prompts is public for viewing
      ]

      for (const route of publicRoutes) {
        await page.goto(route)
        await expect(page).toHaveURL(route)
      }
    })

    test('shows admin/owner role in profile', async ({ page }) => {
      await page.goto(ROUTES.HOME)

      const userButton = page.getByRole('button', { name: /dev-admin@jobfinder\.dev/i }).first()
      if (await userButton.isVisible()) {
        await userButton.click()

        // Should show admin/owner role
        await expect(page.getByText(/role.*(admin|owner)|admin.*access|owner.*access/i)).toBeVisible({ timeout: 5000 })
      }
    })

    test('admin navigation links are visible', async ({ page }) => {
      await page.goto(ROUTES.HOME, { waitUntil: 'domcontentloaded' })
      await openNavigationDrawer(page)

      await expect(page.getByRole('link', { name: /ai prompts/i })).toBeVisible()
      await expect(page.getByRole('link', { name: /queue management/i })).toBeVisible()
      await expect(page.getByRole('link', { name: /configuration/i })).toBeVisible()
      // Note: No dedicated settings page link exists
    })
  })

  test.describe('with non-admin authenticated user', () => {
    test.beforeEach(async ({ context }) => {
      // Authenticate with viewer token (non-admin)
      await context.clearCookies()
      await loginWithDevToken(context, 'dev-viewer-token')
    })

    test('can view AI Prompts page (public for viewing)', async ({ page }) => {
      await page.goto(ROUTES.AI_PROMPTS)
      // AI Prompts is public for viewing (editing is admin-only)
      await expect(page).toHaveURL(ROUTES.AI_PROMPTS)
      await expect(page.getByRole('heading', { name: /ai prompts|prompts/i })).toBeVisible()
    })

    test('is blocked from Queue Management page', async ({ page }) => {
      await page.goto(ROUTES.QUEUE_MANAGEMENT)
      await expect(page).toHaveURL(ROUTES.UNAUTHORIZED)
      await expect(page.getByText(/unauthorized|access denied|admin only/i)).toBeVisible()
    })

    test('is blocked from Job Finder Config page', async ({ page }) => {
      await page.goto(ROUTES.JOB_FINDER_CONFIG)
      await expect(page).toHaveURL(ROUTES.UNAUTHORIZED)
      await expect(page.getByText(/unauthorized|access denied|admin only/i)).toBeVisible()
    })

    // Note: There is no dedicated Settings page - removed test
  })

  test.describe('with unauthenticated user', () => {
    test.beforeEach(async ({ page }) => {
      await page.context().clearCookies()
      // No auth state needed - just leave localStorage empty
    })

    test('can view AI Prompts page (public for viewing)', async ({ page }) => {
      await page.goto(ROUTES.AI_PROMPTS, { waitUntil: 'domcontentloaded' })
      // AI Prompts is public for viewing
      await expect(page).toHaveURL(ROUTES.AI_PROMPTS)
      await expect(page.getByRole('heading', { name: /ai prompts|prompts/i })).toBeVisible()
    })

    test('is redirected from Queue Management page', async ({ page }) => {
      await page.goto(ROUTES.QUEUE_MANAGEMENT, { waitUntil: 'domcontentloaded' })
      // Unauthenticated users are redirected to HOME for admin-only routes
      await expect(page).toHaveURL(ROUTES.HOME, { timeout: 10000 })
    })

    test('is redirected from Job Finder Config page', async ({ page }) => {
      await page.goto(ROUTES.JOB_FINDER_CONFIG, { waitUntil: 'domcontentloaded' })
      // Unauthenticated users are redirected to HOME for admin-only routes
      await expect(page).toHaveURL(ROUTES.HOME, { timeout: 10000 })
    })

    // Note: There is no dedicated Settings page - removed test
  })

})
