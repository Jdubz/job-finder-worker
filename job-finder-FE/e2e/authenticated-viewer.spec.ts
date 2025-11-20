import { test, expect } from '@playwright/test'
import { ROUTES } from '../src/types/routes'
import { getAuthIcon, openAuthModal, openNavigationDrawer } from './utils/ui'

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
    const authDialog = await openAuthModal(page, 'viewer')

    await expect(authDialog.getByText(/viewer@example.com/i)).toBeVisible({ timeout: 15000 })
    await expect(authDialog.getByText(/role:\s*viewer/i)).toBeVisible({ timeout: 15000 })

    await page.keyboard.press('Escape')
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
    await page.goto(ROUTES.HOME, { waitUntil: 'domcontentloaded' })
    const authDialog = await openAuthModal(page, 'viewer')

    const signOutButton = authDialog.getByRole('button', { name: /sign out|log out/i }).first()
    await expect(signOutButton).toBeVisible({ timeout: 10000 })
    await signOutButton.click()

    const authCleared = await page.evaluate(
      ({ stateKey, tokenKey }) => !localStorage.getItem(stateKey) && !localStorage.getItem(tokenKey),
      { stateKey: TEST_AUTH_STATE_KEY, tokenKey: TEST_AUTH_TOKEN_KEY }
    )
    expect(authCleared).toBe(true)
    await expect(getAuthIcon(page, 'anonymous')).toBeVisible({ timeout: 10000 })
  })

  test('admin-only navigation links are hidden', async ({ page }) => {
    await page.goto(ROUTES.HOME, { waitUntil: 'domcontentloaded' })
    await openNavigationDrawer(page)

    await expect(page.getByRole('link', { name: /ai prompts/i })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /queue management/i })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /configuration/i })).toHaveCount(0)
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
