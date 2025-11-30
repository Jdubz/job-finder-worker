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

    test('can access Settings page', async ({ page }) => {
      await page.goto(ROUTES.SETTINGS)
      await expect(page).toHaveURL(ROUTES.SETTINGS)
      await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible()
    })

    test('can access all public pages', async ({ page }) => {
      const publicRoutes = [
        ROUTES.HOME,
        ROUTES.CONTENT_ITEMS,
        ROUTES.DOCUMENT_BUILDER,
        ROUTES.JOB_APPLICATIONS,
        ROUTES.JOB_FINDER
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
      await expect(page.getByRole('link', { name: /settings/i })).toBeVisible()
    })
  })

  test.describe('with non-admin authenticated user', () => {
    test.beforeEach(async ({ context }) => {
      // Authenticate with viewer token (non-admin)
      await context.clearCookies()
      await loginWithDevToken(context, 'dev-viewer-token')
    })

    test('is blocked from AI Prompts page', async ({ page }) => {
      await page.goto(ROUTES.AI_PROMPTS)
      await expect(page).toHaveURL(ROUTES.UNAUTHORIZED)
      await expect(page.getByText(/unauthorized|access denied|admin only/i)).toBeVisible()
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

    test('is blocked from Settings page', async ({ page }) => {
      await page.goto(ROUTES.SETTINGS)
      await expect(page).toHaveURL(ROUTES.UNAUTHORIZED)
      await expect(page.getByText(/unauthorized|access denied|admin only/i)).toBeVisible()
    })
  })

  test.describe('with unauthenticated user', () => {
    test.beforeEach(async ({ page }) => {
      await page.context().clearCookies()
      // No auth state needed - just leave localStorage empty
    })

    test('is blocked from AI Prompts page', async ({ page }) => {
      await page.goto(ROUTES.AI_PROMPTS, { waitUntil: 'domcontentloaded' })
      await expect(page).toHaveURL(ROUTES.UNAUTHORIZED, { timeout: 10000 })
      await expect(page.getByText(/unauthorized|sign in|login|access denied|permission/i).first()).toBeVisible({ timeout: 10000 })
    })

    test('is blocked from Queue Management page', async ({ page }) => {
      await page.goto(ROUTES.QUEUE_MANAGEMENT, { waitUntil: 'domcontentloaded' })
      await expect(page).toHaveURL(ROUTES.UNAUTHORIZED, { timeout: 10000 })
      await expect(page.getByText(/unauthorized|sign in|login|access denied|permission/i).first()).toBeVisible({ timeout: 10000 })
    })

    test('is blocked from Job Finder Config page', async ({ page }) => {
      await page.goto(ROUTES.JOB_FINDER_CONFIG, { waitUntil: 'domcontentloaded' })
      await expect(page).toHaveURL(ROUTES.UNAUTHORIZED, { timeout: 10000 })
      await expect(page.getByText(/unauthorized|sign in|login|access denied|permission/i).first()).toBeVisible({ timeout: 10000 })
    })

    test('is blocked from Settings page', async ({ page }) => {
      await page.goto(ROUTES.SETTINGS, { waitUntil: 'domcontentloaded' })
      await expect(page).toHaveURL(ROUTES.UNAUTHORIZED, { timeout: 10000 })
      await expect(page.getByText(/unauthorized|sign in|login|access denied|permission/i).first()).toBeVisible({ timeout: 10000 })
    })
  })

})
