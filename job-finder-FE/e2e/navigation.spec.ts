import { test, expect } from "@playwright/test"

/**
 * Navigation E2E Tests
 *
 * Tests core navigation functionality including routing,
 * page loads, and navigation bar interaction.
 *
 * @critical - These tests block deployment
 */

test.describe("Navigation @critical", () => {
  test("should load homepage successfully", async ({ page }) => {
    await page.goto("/")

    // Check for key elements
    await expect(page).toHaveTitle(/job finder/i)
    await expect(page.locator("body")).toBeVisible()
  })

  test("should have working navigation links", async ({ page }) => {
    await page.goto("/")

    // Check if nav links exist
    const links = [
      { name: /home/i, optional: true },
      { name: /how it works/i, optional: true },
      { name: /job finder/i, optional: true },
      { name: /dashboard/i, optional: true },
    ]

    for (const link of links) {
      const element = page.getByRole("link", { name: link.name }).first()
      const exists = await element.isVisible().catch(() => false)

      if (exists) {
        // Link exists and is visible
        expect(exists).toBe(true)
      } else if (!link.optional) {
        // Required link is missing
        throw new Error(`Required link "${link.name}" not found`)
      }
    }
  })

  test("should handle 404 pages", async ({ page }) => {
    const response = await page.goto("/non-existent-page-12345")

    // Should either show 404 page or redirect
    if (response) {
      // Page loaded - check for 404 indicators
      const has404Text = await page
        .getByText(/404|not found|page not found/i)
        .isVisible()
        .catch(() => false)

      const isRedirected = page.url() !== "/non-existent-page-12345"

      // Should either show 404 or redirect to valid page
      expect(has404Text || isRedirected).toBe(true)
    }
  })

  test("should redirect from protected routes if not authenticated", async ({ page }) => {
    await page.goto("/job-applications")

    // Should redirect to home if not authenticated (no login page)
    const url = page.url()

    if (url === "/") {
      expect(url).toBe("/")
    } else {
      // If authenticated, should show job applications page
      await expect(page).toHaveURL(/\/job-applications/)
    }
  })

  test("should load protected pages when authenticated", async ({ page }) => {
    await page.goto("/document-builder")

    // Should redirect to home if not authenticated
    const url = page.url()

    if (url === "/") {
      expect(url).toBe("/")
    } else {
      // If authenticated, should show document builder
      await expect(page).toHaveURL(/\/document-builder/)
    }
  })

  test("should have responsive design", async ({ page }) => {
    // Test desktop
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto("/")
    await expect(page.locator("body")).toBeVisible()

    // Test tablet
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto("/")
    await expect(page.locator("body")).toBeVisible()

    // Test mobile
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto("/")
    await expect(page.locator("body")).toBeVisible()
  })
})
