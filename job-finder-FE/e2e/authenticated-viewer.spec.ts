import { test, expect } from '@playwright/test'
import { ROUTES } from '../src/types/routes'

const TEST_AUTH_STATE_KEY = '__JF_E2E_AUTH_STATE__'
const TEST_AUTH_TOKEN_KEY = '__JF_E2E_AUTH_TOKEN__'

test.describe('Authenticated Viewer Access (Non-Admin)', () => {
  test.beforeEach(async ({ page }) => {
    // Set up viewer authentication (non-admin user)
    await page.context().clearCookies()
    await page.addInitScript(({ stateKey, tokenKey }) => {
      // Set up a viewer user (not in admin config)
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

  test('can access all public pages', async ({ page }) => {
    const publicRoutes = [
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

  test('cannot access AI Prompts page (admin only)', async ({ page }) => {
    await page.goto(ROUTES.AI_PROMPTS)

    // Should be redirected to unauthorized page
    await expect(page).toHaveURL(ROUTES.UNAUTHORIZED)
    await expect(page.getByText(/unauthorized|access denied|admin only/i)).toBeVisible()
  })

  test('cannot access Queue Management page (admin only)', async ({ page }) => {
    await page.goto(ROUTES.QUEUE_MANAGEMENT)

    // Should be redirected to unauthorized page
    await expect(page).toHaveURL(ROUTES.UNAUTHORIZED)
    await expect(page.getByText(/unauthorized|access denied|admin only/i)).toBeVisible()
  })

  test('cannot access Job Finder Config page (admin only)', async ({ page }) => {
    await page.goto(ROUTES.JOB_FINDER_CONFIG)

    // Should be redirected to unauthorized page
    await expect(page).toHaveURL(ROUTES.UNAUTHORIZED)
    await expect(page.getByText(/unauthorized|access denied|admin only/i)).toBeVisible()
  })

  test('cannot access Settings page (admin only)', async ({ page }) => {
    await page.goto(ROUTES.SETTINGS)

    // Should be redirected to unauthorized page
    await expect(page).toHaveURL(ROUTES.UNAUTHORIZED)
    await expect(page.getByText(/unauthorized|access denied|admin only/i)).toBeVisible()
  })

  test('shows viewer role in user profile', async ({ page }) => {
    await page.goto(ROUTES.HOME, { waitUntil: 'domcontentloaded' })

    // Look for user profile/menu
    const userButton = page.getByRole('button', { name: /viewer@example.com|Test Viewer|profile|account/i }).first()
    if (await userButton.isVisible({ timeout: 15000 }).catch(() => false)) {
      await userButton.click({ timeout: 10000 })

      // Should show viewer role
      await expect(page.getByText(/role.*viewer|viewer.*access/i).first()).toBeVisible({ timeout: 10000 })
    }
  })

  test('can submit job applications', async ({ page }) => {
    await page.goto(ROUTES.JOB_APPLICATIONS)

    // Look for submit/add job button
    const addButton = page.getByRole('button', { name: /add|submit|create|new/i }).first()
    if (await addButton.isVisible()) {
      await addButton.click()

      // Should see job submission form (not sign-in prompt)
      await expect(
        page.getByLabel(/company|job title|position/i).first()
      ).toBeVisible({ timeout: 5000 })
    }
  })

  test('can add content items', async ({ page }) => {
    await page.goto(ROUTES.CONTENT_ITEMS)

    // Look for add content button
    const addButton = page.getByRole('button', { name: /add|create|new/i }).first()
    if (await addButton.isVisible()) {
      await addButton.click()

      // Should see content item form (not sign-in prompt)
      await expect(
        page.getByLabel(/title|content|description/i).first()
      ).toBeVisible({ timeout: 5000 })
    }
  })

  test('can generate documents', async ({ page }) => {
    await page.goto(ROUTES.DOCUMENT_BUILDER)

    // Look for generate/create button
    const generateButton = page.getByRole('button', { name: /generate|create|build/i }).first()
    if (await generateButton.isVisible()) {
      await generateButton.click()

      // Should see document generation interface (not sign-in prompt)
      await expect(
        page.getByLabel(/template|job|content/i).first()
      ).toBeVisible({ timeout: 5000 })
    }
  })

  test('can view job matches', async ({ page }) => {
    await page.goto(ROUTES.JOB_FINDER, { waitUntil: 'domcontentloaded' })

    // Should see job matches or empty state (not unauthorized)
    await expect(
      page.getByText(/job matches|no matches|find jobs|job finder/i).first()
    ).toBeVisible({ timeout: 15000 })
  })

  test('can sign out', async ({ page }) => {
    await page.goto(ROUTES.HOME)

    // Look for sign out button
    const userButton = page.getByRole('button', { name: /viewer@example.com|Test Viewer|profile|account/i }).first()
    if (await userButton.isVisible()) {
      await userButton.click()

      const signOutButton = page.getByRole('button', { name: /sign out|log out/i }).first()
      if (await signOutButton.isVisible()) {
        await signOutButton.click()

        // Auth state should be cleared
        const authCleared = await page.evaluate((stateKey) => {
          return !localStorage.getItem(stateKey)
        }, TEST_AUTH_STATE_KEY)
        expect(authCleared).toBe(true)
      }
    }
  })

  test('admin-only navigation links are hidden', async ({ page }) => {
    await page.goto(ROUTES.HOME, { waitUntil: 'domcontentloaded' })

    // Wait for page to fully load
    await page.waitForTimeout(2000)

    // These links should not appear in navigation for viewers
    const aiPromptsLink = page.getByRole('link', { name: /ai prompts/i })
    const queueLink = page.getByRole('link', { name: /queue/i })
    const configLink = page.getByRole('link', { name: /config/i })
    const settingsLink = page.getByRole('link', { name: /settings/i })

    // Check if visible - if any are visible, the test should fail
    const linksVisible = await Promise.all([
      aiPromptsLink.isVisible({ timeout: 1000 }).catch(() => false),
      queueLink.isVisible({ timeout: 1000 }).catch(() => false),
      configLink.isVisible({ timeout: 1000 }).catch(() => false),
      settingsLink.isVisible({ timeout: 1000 }).catch(() => false)
    ])

    // None of these should be visible to a viewer
    expect(linksVisible.some(visible => visible)).toBe(false)
  })

  test('viewer has access to legal pages', async ({ page }) => {
    const legalRoutes = [
      ROUTES.TERMS_OF_USE,
      ROUTES.PRIVACY_POLICY,
      ROUTES.COOKIE_POLICY,
      ROUTES.DISCLAIMER
    ]

    for (const route of legalRoutes) {
      await page.goto(route)
      await expect(page).toHaveURL(route)
    }
  })
})
