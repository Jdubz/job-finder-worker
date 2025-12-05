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

    // Pre-filter tab (default)
    await expect(
      getActiveTab().getByRole("heading", { name: /(title keywords|required keywords)/i })
    ).toBeVisible()
    // Add a keyword to enable save
    await getActiveTab().getByRole("button", { name: /add/i }).first().click()
    await page.getByRole("button", { name: /save changes/i }).click()
    await expect(page.getByText(/Pre-filter policy saved/i)).toBeVisible()

    // Scoring tab - may show setup prompt if match-policy not configured
    await page.getByRole("tab", { name: "Scoring" }).click()
    // Scoring content uses conditional rendering (not TabsContent), so look on page directly
    const scoringSetupPrompt = page.getByText(/Scoring Configuration Required/i)
    const scoringForm = page.getByLabel(/Minimum Score/i)

    // Check if scoring form is available (match-policy is configured)
    if (await scoringForm.isVisible({ timeout: 2000 }).catch(() => false)) {
      await scoringForm.fill("65")
      await page.getByRole("button", { name: /save changes/i }).click()
      await expect(page.getByText(/Match policy saved/i)).toBeVisible()
    } else {
      // Match-policy not configured - verify setup message is shown
      await expect(scoringSetupPrompt).toBeVisible()
    }

    // Queue settings tab
    await page.getByRole("tab", { name: "Worker Runtime" }).click()
    await expect(getActiveTab().getByLabel(/Processing Timeout/)).toBeVisible()

    // AI settings tab
    await page.getByRole("tab", { name: "AI" }).click()
    // New AgentManager UI - verify agent configuration section is visible
    await expect(getActiveTab().getByRole("heading", { name: /Configured Agents/i })).toBeVisible()

    // AI prompts page
    await page.goto("/ai-prompts")
    const resumePrompt = page.getByLabel("Resume Generation Prompt")
    const existingValue = await resumePrompt.inputValue()
    await resumePrompt.fill(`${existingValue}\n// e2e override`)
    await page.getByRole("button", { name: "Save Prompts" }).click()
    await expect(page.getByText(/AI prompts saved successfully/i)).toBeVisible()

    // Verify the updated content was saved by checking it contains the override
    await page.reload()
    await expect(resumePrompt).toHaveValue(/\/\/ e2e override/)
  })
})
