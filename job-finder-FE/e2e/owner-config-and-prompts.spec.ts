import { test, expect } from "./fixtures/test"
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

    // Title Filter tab (default)
    await expect(getActiveTab().getByRole("heading", { name: /required keywords/i })).toBeVisible()
    // Add a keyword to enable save
    await getActiveTab().getByRole("button", { name: /add/i }).first().click()
    await page.getByRole("button", { name: /save changes/i }).click()
    await expect(page.getByText(/Title filter saved/i)).toBeVisible()

    // Scoring tab
    await page.getByRole("tab", { name: "Scoring" }).click()
    await expect(getActiveTab().getByLabel(/Minimum Score/i)).toBeVisible()
    await getActiveTab().getByLabel(/Minimum Score/i).fill("65")
    await page.getByRole("button", { name: /save changes/i }).click()
    await expect(page.getByText(/Scoring config saved/i)).toBeVisible()

    // Queue settings tab
    await page.getByRole("tab", { name: "Queue" }).click()
    await expect(getActiveTab().getByLabel(/Processing Timeout/)).toBeVisible()

    // AI settings tab
    await page.getByRole("tab", { name: "AI" }).click()
    // There are multiple Provider comboboxes - just check the first one is visible
    await expect(getActiveTab().getByRole("combobox", { name: /Provider/i }).first()).toBeVisible()

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
