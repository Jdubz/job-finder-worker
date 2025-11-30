import { test, expect } from "@playwright/test"
import { loginWithDevToken } from "./fixtures/auth"

test.describe("Owner configuration and prompts", () => {
  test.beforeEach(async ({ context }) => {
    // Authenticate using dev token for admin access
    await loginWithDevToken(context, 'dev-admin-token')
  })

  test("verifies config sections and updates prompts", async ({ page }) => {
    await page.goto("/job-finder-config")
    await expect(page.getByRole("heading", { name: "Job Finder Configuration" })).toBeVisible()
    const getActiveTab = () => page.locator('[role="tabpanel"][data-state="active"]').first()

    // Prefilter tab (default)
    await expect(getActiveTab().getByLabel("Strike Threshold")).toBeVisible()
    await getActiveTab().getByLabel("Strike Threshold").fill("7")
    await page.getByRole("button", { name: /save changes/i }).click()
    await expect(page.getByText(/Prefilter policy saved/i)).toBeVisible()

    // Match policy tab
    await page.getByRole("tab", { name: "Match Policy" }).click()
    await expect(getActiveTab().getByLabel(/Minimum Match Score/i)).toBeVisible()
    await getActiveTab().getByLabel(/Minimum Match Score/i).fill("85")
    await page.getByRole("button", { name: /save changes/i }).click()
    await expect(page.getByText(/Match policy saved/i)).toBeVisible()

    // Queue settings tab
    await page.getByRole("tab", { name: "Queue" }).click()
    await expect(getActiveTab().getByLabel(/Processing Timeout/)).toBeVisible()

    // AI settings tab
    await page.getByRole("tab", { name: "AI" }).click()
    await expect(getActiveTab().getByRole("combobox", { name: /Provider/i })).toBeVisible()

    // AI prompts page
    await page.goto("/ai-prompts")
    const resumePrompt = page.getByLabel("Resume Generation Prompt")
    const existingValue = await resumePrompt.inputValue()
    await resumePrompt.fill(`${existingValue}\n// e2e override`)
    await page.getByRole("button", { name: "Save Prompts" }).click()
    await expect(page.getByText(/AI prompts saved successfully/i)).toBeVisible()

    await page.getByRole("button", { name: "Reset to Defaults" }).click()
    await expect(page.getByText(/AI prompts reset to defaults/i)).toBeVisible()
  })
})
