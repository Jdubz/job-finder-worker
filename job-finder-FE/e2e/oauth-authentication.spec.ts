import { test, expect } from './fixtures/test'
import { ROUTES } from '../src/types/routes'
import { getAuthIcon, openAuthModal } from './utils/ui'
import { loginWithDevToken } from './fixtures/auth'

test.describe('Google OAuth Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Start with clean state
    await page.context().clearCookies()
    // No init script needed - we want empty localStorage for these tests
  })

  test('sign in modal renders with interactive content', async ({ page }) => {
    await page.goto(ROUTES.HOME, { waitUntil: 'domcontentloaded' })

    const authModal = await openAuthModal(page, 'anonymous')

    // In dev mode: role selector buttons should be visible (not blank)
    // In prod mode: "Continue with Google" button should be visible
    // Either way, the modal must have interactive content — not a blank screen
    const hasDevButtons = await authModal.getByRole('button', { name: /Admin/i }).isVisible().catch(() => false)
    const hasGoogleButton = await authModal.getByRole('button', { name: /Continue with Google/i }).isVisible().catch(() => false)

    expect(hasDevButtons || hasGoogleButton).toBe(true)
  })

  test('sign in modal can be closed with Escape', async ({ page }) => {
    await page.goto(ROUTES.HOME, { waitUntil: 'domcontentloaded' })

    const modal = await openAuthModal(page, 'anonymous')
    await expect(modal).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(modal).not.toBeVisible()
  })

  test('session endpoint returns 200 with user: null on cold load (no cookie)', async ({ page }) => {
    // Intercept the session API call that AuthContext makes on mount
    const sessionResponsePromise = page.waitForResponse(
      (res) => res.url().includes('/auth/session') && res.request().method() === 'GET'
    )

    await page.goto(ROUTES.HOME, { waitUntil: 'domcontentloaded' })

    const sessionResponse = await sessionResponsePromise
    expect(sessionResponse.status()).toBe(200)

    const body = await sessionResponse.json()
    expect(body.success).toBe(true)
    expect(body.data.user).toBeNull()
  })

  test('session endpoint returns 200 with user data after login', async ({ context }) => {
    await loginWithDevToken(context, 'dev-admin-token')
    const page = await context.newPage()

    const sessionResponsePromise = page.waitForResponse(
      (res) => res.url().includes('/auth/session') && res.request().method() === 'GET'
    )

    await page.goto(ROUTES.HOME, { waitUntil: 'domcontentloaded' })

    const sessionResponse = await sessionResponsePromise
    expect(sessionResponse.status()).toBe(200)

    const body = await sessionResponse.json()
    expect(body.success).toBe(true)
    expect(body.data.user).toBeTruthy()
    expect(body.data.user.email).toBeDefined()
    expect(body.data.user.roles).toBeDefined()

    await page.close()
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

    await page.goto(ROUTES.RESUMES, { waitUntil: 'domcontentloaded' })
    await expect(getAuthIcon(page, 'viewer')).toBeVisible({ timeout: 15000 })

    await page.close()
  })

})
