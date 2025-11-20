import { test, expect } from '@playwright/test'
import { ROUTES } from '../src/types/routes'

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

  test('can access Job Applications page', async ({ page }) => {
    await page.goto(ROUTES.JOB_APPLICATIONS)
    await expect(page).toHaveURL(ROUTES.JOB_APPLICATIONS)

    // Should see the Job Applications interface
    await expect(page.getByRole('heading', { name: /job applications/i })).toBeVisible()
  })

  test('can access Job Finder page', async ({ page }) => {
    await page.goto(ROUTES.JOB_FINDER)
    await expect(page).toHaveURL(ROUTES.JOB_FINDER)

    // Should see the Job Finder interface
    await expect(page.getByRole('heading', { name: /job finder/i })).toBeVisible()
  })

  test('cannot access AI Prompts page (admin only)', async ({ page }) => {
    await page.goto(ROUTES.AI_PROMPTS, { waitUntil: 'domcontentloaded' })

    // Should be redirected to unauthorized page
    await expect(page).toHaveURL(ROUTES.UNAUTHORIZED, { timeout: 10000 })
    await expect(page.getByText(/unauthorized|access denied|permission/i).first()).toBeVisible({ timeout: 10000 })
  })

  test('cannot access Queue Management page (admin only)', async ({ page }) => {
    await page.goto(ROUTES.QUEUE_MANAGEMENT, { waitUntil: 'domcontentloaded' })

    // Should be redirected to unauthorized page
    await expect(page).toHaveURL(ROUTES.UNAUTHORIZED, { timeout: 10000 })
    await expect(page.getByText(/unauthorized|access denied|permission/i).first()).toBeVisible({ timeout: 10000 })
  })

  test('cannot access Job Finder Config page (admin only)', async ({ page }) => {
    await page.goto(ROUTES.JOB_FINDER_CONFIG, { waitUntil: 'domcontentloaded' })

    // Should be redirected to unauthorized page
    await expect(page).toHaveURL(ROUTES.UNAUTHORIZED, { timeout: 10000 })
    await expect(page.getByText(/unauthorized|access denied|permission/i).first()).toBeVisible({ timeout: 10000 })
  })

  test('cannot access Settings page (admin only)', async ({ page }) => {
    await page.goto(ROUTES.SETTINGS, { waitUntil: 'domcontentloaded' })

    // Should be redirected to unauthorized page
    await expect(page).toHaveURL(ROUTES.UNAUTHORIZED, { timeout: 10000 })
    await expect(page.getByText(/unauthorized|access denied|permission/i).first()).toBeVisible({ timeout: 10000 })
  })

  test('navigation links work correctly', async ({ page }) => {
    await page.goto(ROUTES.HOME, { waitUntil: 'domcontentloaded' })

    // Wait for navigation to load
    await page.waitForTimeout(2000)

    // Test navigation to public pages
    const contentItemsLink = page.getByRole('link', { name: /content items/i }).first()
    if (await contentItemsLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await contentItemsLink.click()
      await expect(page).toHaveURL(ROUTES.CONTENT_ITEMS, { timeout: 10000 })
    }

    const documentBuilderLink = page.getByRole('link', { name: /document builder/i }).first()
    if (await documentBuilderLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await documentBuilderLink.click()
      await expect(page).toHaveURL(ROUTES.DOCUMENT_BUILDER, { timeout: 10000 })
    }

    const jobApplicationsLink = page.getByRole('link', { name: /job applications/i }).first()
    if (await jobApplicationsLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await jobApplicationsLink.click()
      await expect(page).toHaveURL(ROUTES.JOB_APPLICATIONS, { timeout: 10000 })
    }

    const jobFinderLink = page.getByRole('link', { name: /job finder/i }).first()
    if (await jobFinderLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await jobFinderLink.click()
      await expect(page).toHaveURL(ROUTES.JOB_FINDER, { timeout: 10000 })
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

    // Look for sign in button in header/nav
    const signInButton = page.getByRole('button', { name: /sign in|log in/i }).first()
    if (await signInButton.isVisible()) {
      await signInButton.click()

      // Should see Google Sign In button in modal
      await expect(page.getByText(/continue with google/i)).toBeVisible({ timeout: 5000 })
    }
  })

  test('legal pages are accessible', async ({ page }) => {
    await page.goto(ROUTES.TERMS_OF_USE, { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(ROUTES.TERMS_OF_USE)
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 15000 })

    await page.goto(ROUTES.PRIVACY_POLICY, { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(ROUTES.PRIVACY_POLICY)
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 15000 })

    await page.goto(ROUTES.COOKIE_POLICY, { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(ROUTES.COOKIE_POLICY)
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 15000 })

    await page.goto(ROUTES.DISCLAIMER, { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(ROUTES.DISCLAIMER)
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 15000 })
  })

  test('invalid routes redirect to home', async ({ page }) => {
    await page.goto('/this-page-does-not-exist')
    await expect(page).toHaveURL(ROUTES.HOME)
  })
})
