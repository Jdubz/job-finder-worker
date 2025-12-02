import { test, expect } from "./fixtures/test"
import { loginWithDevToken } from "./fixtures/auth"

test.describe("Smoke navigation", () => {
  test.beforeEach(async ({ context }) => {
    await loginWithDevToken(context, "dev-admin-token")
  })

  const paths: Array<[string, RegExp]> = [
    ["/queue-management", /Queue Management/i],
    ["/document-builder", /Document Builder/i],
    ["/content-items", /Career Story|Experience/i],
    ["/owner/config", /Job Finder Configuration|Configuration|Queue Settings|AI/i],
  ]

  for (const [path, headingPattern] of paths) {
    test(`renders without runtime errors: ${path}`, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByRole("heading", { name: headingPattern })).toBeVisible({ timeout: 15000 })
      // tiny wait to allow effect hooks to run while error sentry is active
      await page.waitForTimeout(50)
    })
  }
})
