import { test, expect } from '@playwright/test'
import { ROUTES } from '../src/types/routes'
import adminConfig from '../src/config/admins.json' with { type: 'json' }
import { openNavigationDrawer } from './utils/ui'

const TEST_AUTH_STATE_KEY = '__JF_E2E_AUTH_STATE__'
const TEST_AUTH_TOKEN_KEY = '__JF_E2E_AUTH_TOKEN__'

test.describe('Admin Route Protection', () => {
  test.describe('with admin user', () => {
    test.beforeEach(async ({ page }) => {
      // Set up admin authentication using one of the configured admin emails
      const adminEmail = adminConfig.adminEmails[0]
      await page.context().clearCookies()
      await page.addInitScript(({ email, stateKey, tokenKey }) => {
        const adminAuthState = {
          uid: 'admin-test-user',
          email: email,
          displayName: 'Test Admin',
          isOwner: true,
          emailVerified: true,
          token: 'mock-admin-token'
        }

        window.localStorage.setItem(stateKey, JSON.stringify(adminAuthState))
        window.localStorage.setItem(tokenKey, 'mock-admin-token')
      }, { email: adminEmail, stateKey: TEST_AUTH_STATE_KEY, tokenKey: TEST_AUTH_TOKEN_KEY })
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

      const userButton = page.getByRole('button', { name: new RegExp(adminConfig.adminEmails[0], 'i') }).first()
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
    test.beforeEach(async ({ page }) => {
      // Set up viewer authentication (non-admin)
      await page.context().clearCookies()
      await page.addInitScript(({ stateKey, tokenKey }) => {
        const viewerAuthState = {
          uid: 'viewer-test-user',
          email: 'viewer@example.com',
          displayName: 'Test Viewer',
          isOwner: false,
          emailVerified: true,
          token: 'mock-viewer-token'
        }

        window.localStorage.setItem(stateKey, JSON.stringify(viewerAuthState))
        window.localStorage.setItem(tokenKey, 'mock-viewer-token')
      }, { stateKey: TEST_AUTH_STATE_KEY, tokenKey: TEST_AUTH_TOKEN_KEY })
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

  test.describe('admin configuration validation', () => {
    test('admin config has valid emails', () => {
      expect(Array.isArray(adminConfig.adminEmails)).toBe(true)
      expect(adminConfig.adminEmails.length).toBeGreaterThan(0)

      adminConfig.adminEmails.forEach(email => {
        expect(email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
      })
    })

    test('both configured admins are recognized', async ({ context }) => {
      for (const adminEmail of adminConfig.adminEmails) {
        // Create new page with fresh context for each email
        const testPage = await context.newPage()

        await testPage.addInitScript(({ email, stateKey, tokenKey }) => {
          const adminAuthState = {
            uid: `admin-${email}`,
            email: email,
            displayName: `Admin ${email}`,
            isOwner: true,
            emailVerified: true,
            token: `mock-token-${email}`
          }

          window.localStorage.setItem(stateKey, JSON.stringify(adminAuthState))
          window.localStorage.setItem(tokenKey, `mock-token-${email}`)
        }, { email: adminEmail, stateKey: TEST_AUTH_STATE_KEY, tokenKey: TEST_AUTH_TOKEN_KEY })

        // Try accessing an admin page
        await testPage.goto(ROUTES.AI_PROMPTS)
        await expect(testPage).toHaveURL(ROUTES.AI_PROMPTS)

        await testPage.close()
      }
    })
  })
})
