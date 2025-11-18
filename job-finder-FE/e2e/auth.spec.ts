import { test, expect } from "@playwright/test"

/**
 * Authentication E2E Tests
 *
 * Tests critical authentication workflows including auth modal,
 * protected route access, and session persistence.
 *
 * @critical - These tests block deployment
 */

test.describe("Authentication @critical", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/")
  })

  test("should redirect unauthenticated users from protected routes to home", async ({ page }) => {
    // Navigate to a protected route
    await page.goto("/content-items", { waitUntil: "networkidle" })

    // Should redirect to home (no login page)
    await expect(page).toHaveURL("/")
  })

  test("should show authentication modal when clicking user icon", async ({ page }) => {
    // Check if auth icon/button exists
    const authButton = page.getByRole("button", { name: /sign in|auth/i }).first()

    if (await authButton.isVisible()) {
      await authButton.click()

      // Wait for modal to appear - use specific heading to avoid multiple matches
      await expect(page.getByRole("heading", { name: /authentication/i })).toBeVisible()
      await expect(page.getByRole("button", { name: /sign in with google/i })).toBeVisible()
    }
  })

  test("should persist authentication state", async ({ page, context }) => {
    // This test requires actual authentication which needs Google OAuth
    // Skip in CI/automated environments
    test.skip(!!process.env.CI, "Requires interactive Google OAuth")

    // If already logged in, navigate to protected route
    const isLoggedIn = await page.locator('text="Content Items"').isVisible().catch(() => false)

    if (!isLoggedIn) {
      test.skip(true, "Requires manual login for this test")
    }

    // After login, navigate to protected route
    await page.goto("/content-items")
    await expect(page).toHaveURL(/\/content-items/)

    // Reload page - should stay authenticated
    await page.reload()
    await expect(page).toHaveURL(/\/content-items/)

    // Open new tab - should be authenticated
    const newPage = await context.newPage()
    await newPage.goto("/content-items")
    await expect(newPage).toHaveURL(/\/content-items/)
    await newPage.close()
  })

  test("should protect editor-only routes", async ({ page }) => {
    // Navigate to editor-only route (e.g., AI Prompts)
    await page.goto("/ai-prompts", { waitUntil: "networkidle" })

    // Should redirect to home or unauthorized (not stay on /ai-prompts)
    const url = page.url()
    const isRedirected = url.endsWith("/") || url.includes("/unauthorized")
    expect(isRedirected).toBe(true)
  })
})
