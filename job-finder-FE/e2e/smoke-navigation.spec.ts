import { test, expect } from "./fixtures/test"
import { loginWithDevToken } from "./fixtures/auth"

test.describe("Smoke navigation", () => {
  test.beforeEach(async ({ context }) => {
    await loginWithDevToken(context, "dev-admin-token")
  })

  type Check = [string, (page: typeof test.extend["page"]) => Promise<void>]

  const paths: Check[] = [
    ["/queue-management", async (page) => {
      await expect(page.getByRole("heading", { name: /Queue Management/i, level: 1 })).toBeVisible({ timeout: 15000 })
    }],
    ["/document-builder", async (page) => {
      await expect(page.getByRole("heading", { name: /Document Builder/i, level: 1 })).toBeVisible({ timeout: 15000 })
    }],
    ["/content-items", async (page) => {
      await expect(page.getByRole("heading", { name: /Career Story/i, level: 1 })).toBeVisible({ timeout: 15000 })
    }],
    ["/owner/config", async (page) => {
      await expect(page.getByRole("heading", { name: /Configuration/i })).toBeVisible({ timeout: 15000 })
    }],
  ]

  for (const [path, check] of paths) {
    test(`renders without runtime errors: ${path}`, async ({ page }) => {
      await page.goto(path)
      await check(page)
      // tiny wait to allow effect hooks to run while error sentry is active
      await page.waitForTimeout(50)
    })
  }
})
