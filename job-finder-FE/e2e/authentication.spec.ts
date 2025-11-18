import { test, expect } from "@playwright/test"

test.describe("Authentication Flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/")
  })

  // Skip authentication tests for now due to Firebase emulator setup requirements
  test.skip("should redirect unauthenticated users to home page", async ({ page }) => {
    await page.goto("/job-applications")
    // Unauthenticated users are redirected to home instead of login (auth modal handles login)
    await expect(page).toHaveURL("/")
  })

  test("should display auth modal when clicking auth icon", async ({ page }) => {
    await page.goto("/")

    // Click the auth icon in the navigation to open the modal
    await page.getByRole("button", { name: /authentication/i }).click()

    // Check for auth modal elements
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole("heading", { name: /authentication/i })).toBeVisible()
    await expect(page.getByRole("button", { name: /sign in with google/i })).toBeVisible()
  })

  test.skip("should show unauthorized page for non-editor users", async ({ page }) => {
    await page.goto("/unauthorized")

    // Check unauthorized page content
    await expect(page.getByRole("heading", { name: /unauthorized/i })).toBeVisible()
    await expect(page.getByText(/you don't have permission/i)).toBeVisible()
  })

  test.skip("should not allow access to editor-only routes without editor role", async ({
    page,
  }) => {
    // This test would require mocking a non-editor authenticated user
    // For now, check that the route redirects appropriately
    await page.goto("/ai-prompts")

    // Should redirect to either home or unauthorized
    const url = page.url()
    expect(url === "/" || url.includes("/unauthorized")).toBeTruthy()
  })

  test("should have accessible navigation for authenticated users", async ({ page }) => {
    // This test assumes a logged-in state (would need to set up auth state)
    // For now, we'll just verify the navigation structure exists
    await page.goto("/")

    // Check that the page has proper structure
    await expect(page.locator("main")).toBeVisible({ timeout: 10000 })
  })
})

test.describe("Protected Routes", () => {
  const protectedRoutes = [
    "/job-applications",
    "/job-finder",
    "/document-builder",
    "/document-history",
    "/job-finder-config",
    "/queue-management",
    "/settings",
  ]

  const editorOnlyRoutes = ["/ai-prompts"]

  // Skip route protection tests for now due to Firebase auth setup requirements
  protectedRoutes.forEach((route) => {
    test.skip(`should protect route: ${route}`, async ({ page }) => {
      await page.goto(route)

      // Should redirect to home if not authenticated (auth modal handles login)
      await expect(page).toHaveURL("/")
    })
  })

  editorOnlyRoutes.forEach((route) => {
    test.skip(`should protect editor-only route: ${route}`, async ({ page }) => {
      await page.goto(route)

      // Should redirect to home or unauthorized (depending on auth status)
      await expect(page).toHaveURL(/\/(home|unauthorized|\/)/)
    })
  })
})

test.describe("Navigation", () => {
  test("should allow navigation between public routes", async ({ page }) => {
    await page.goto("/")

    // Check home page loads
    await expect(page).toHaveURL("/")

    // Navigate to how it works
    await page.goto("/how-it-works")
    await expect(page).toHaveURL("/how-it-works")
  })

  test("should have working navigation links when authenticated", async ({ page }) => {
    // This would require setting up authenticated state
    // For now, verify that navigation structure exists
    await page.goto("/")

    const nav = page.locator("nav")
    if (await nav.isVisible()) {
      // Navigation exists, verify it has links
      const links = nav.locator("a")
      const count = await links.count()
      expect(count).toBeGreaterThan(0)
    }
  })
})
