import { test, expect } from './fixtures/test'
import { ROUTES } from '../src/types/routes'
import { getAuthIcon, openAuthModal, openNavigationDrawer } from './utils/ui'
import { loginWithDevToken } from './fixtures/auth'

test.describe('Authenticated Viewer Access (Non-Admin)', () => {
  test.beforeEach(async ({ context }) => {
    // Authenticate with backend using viewer token (non-admin)
    await context.clearCookies()
    await loginWithDevToken(context, 'dev-viewer-token')
  })

  test('can access all public pages', async ({ page }) => {
    const publicRoutes = [
      ROUTES.CONTENT_ITEMS,
      ROUTES.DOCUMENT_BUILDER,
      ROUTES.JOB_APPLICATIONS,
      ROUTES.HOME
    ]

    for (const route of publicRoutes) {
      await page.goto(route)
      await expect(page).toHaveURL(route)
    }
  })

  test('can view AI Prompts page (public for viewing)', async ({ page }) => {
    await page.goto(ROUTES.AI_PROMPTS)

    // AI Prompts is now public for viewing (editing is admin-only)
    await expect(page).toHaveURL(ROUTES.AI_PROMPTS)
    await expect(page.getByRole('heading', { name: /ai prompts|prompts/i })).toBeVisible()
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

  // Settings route does not exist in this app - removed test

  test('shows viewer role in user profile', async ({ page }) => {
    await page.goto(ROUTES.HOME, { waitUntil: 'domcontentloaded' })
    const authDialog = await openAuthModal(page, 'viewer')

    // dev-viewer-token uses dev-viewer@jobfinder.dev
    await expect(authDialog.getByText(/dev-viewer@jobfinder\.dev/i)).toBeVisible({ timeout: 15000 })
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

  test('can sign out', async ({ page }) => {
    await page.goto(ROUTES.HOME, { waitUntil: 'domcontentloaded' })
    const authDialog = await openAuthModal(page, 'viewer')

    const signOutButton = authDialog.getByRole('button', { name: /sign out|log out/i }).first()
    await expect(signOutButton).toBeVisible({ timeout: 10000 })
    await signOutButton.click()

    // After sign out, should show anonymous auth state
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
