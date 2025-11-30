import { test, expect } from "./fixtures/test"
import { loginWithDevToken } from "./fixtures/auth"

test("owner sees management links in navigation", async ({ page, context }) => {
  // Authenticate using dev token for admin access
  await loginWithDevToken(context, 'dev-admin-token')
  await page.goto("/")

  await page.getByRole("button", { name: /toggle navigation menu/i }).click()

  // Check for expected navigation links (note: "Job Finder" may not be a link in the nav)
  for (const link of ["Job Applications", "Queue Management", "Configuration"]) {
    await expect(page.getByRole("link", { name: link })).toBeVisible()
  }
})

test("viewer is redirected away from owner-only routes", async ({ page, context }) => {
  // Authenticate using dev token for viewer (non-admin)
  await loginWithDevToken(context, 'dev-viewer-token')
  await page.goto("/queue-management")

  await expect(page).toHaveURL(/\/unauthorized$/)
  await expect(page.getByText(/permission to access this page/i)).toBeVisible()
})
