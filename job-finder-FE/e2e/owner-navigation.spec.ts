import { test, expect } from "@playwright/test"
import { applyAuthState, ownerAuthState, viewerAuthState } from "./fixtures/auth"

test("owner sees management links in navigation", async ({ page }) => {
  await applyAuthState(page, ownerAuthState())
  await page.goto("/")

  await page.getByRole("button", { name: /toggle navigation menu/i }).click()

  for (const link of ["Job Finder", "Job Applications", "Queue Management", "Configuration"]) {
    await expect(page.getByRole("link", { name: link })).toBeVisible()
  }
})

test("viewer is redirected away from owner-only routes", async ({ page }) => {
  await applyAuthState(page, viewerAuthState({ email: "viewer@jobfinder.dev" }))
  await page.goto("/queue-management")

  await expect(page).toHaveURL(/\/unauthorized$/)
  await expect(page.getByText(/permission to access this page/i)).toBeVisible()
})
