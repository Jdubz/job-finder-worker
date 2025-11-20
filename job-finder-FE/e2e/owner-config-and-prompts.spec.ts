import { test, expect } from "@playwright/test"
import { applyAuthState, ownerAuthState } from "./fixtures/auth"

test.describe("Owner configuration and prompts", () => {
  test.beforeEach(async ({ page }) => {
    await applyAuthState(page, ownerAuthState())
  })

  test("verifies config sections and updates prompts", async ({ page }) => {
    await page.goto("/job-finder-config")
    await expect(page.getByRole("heading", { name: "Job Finder Configuration" })).toBeVisible()
    const getActiveTab = () => page.locator('[role="tabpanel"][data-state="active"]').first()

    // Stop list tab
    await expect(page.getByText(/No excluded companies/i)).toBeVisible()

    // Queue settings tab
    await page.getByRole("tab", { name: "Queue Settings" }).click()
    await expect(getActiveTab().getByLabel("Max Retries")).toBeVisible()
    await expect(getActiveTab().getByLabel("Retry Delay (seconds)")).toBeVisible()

    // AI settings tab
    await page.getByRole("tab", { name: "AI Settings" }).click()
    await expect(getActiveTab().getByRole("combobox", { name: "AI Provider" })).toBeVisible()
    await expect(getActiveTab().getByRole("combobox", { name: "AI Provider" })).toBeVisible()
    await expect(getActiveTab().getByLabel("Model")).toBeVisible()

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
