import { test, expect } from "./fixtures/test"
import { loginWithDevToken } from "./fixtures/auth"
import { seedContentItem, seedQueueJob, clearQueue } from "./fixtures/api-client"

test.describe("Content and queue management", () => {
  test.beforeEach(async ({ context, request }) => {
    // Authenticate using dev token for admin access
    await loginWithDevToken(context, 'dev-admin-token')
    // Clear queue to ensure test isolation
    await clearQueue(request)
  })

  test("renders content editing flow and queue management UI", async ({ page, request }) => {
    const contentTitle = `E2E Experience ${Date.now()}`
    const contentId = await seedContentItem(request, {
      itemData: {
        title: contentTitle,
        description: "Original summary",
        role: "Automation Lead",
      },
    })

    const queueId = await seedQueueJob(request, {
      metadata: {
        title: "Queue ingestion test",
      },
      // Provide legacy-shaped stringified pipeline_state to catch parsing regressions
      pipeline_state: JSON.stringify({ job_data: { title: "Queue ingestion test" } }),
    })

    await page.goto("/content-items")
    const contentCard = page.getByTestId(`content-item-${contentId}`)
    await expect(contentCard.getByText(contentTitle)).toBeVisible()

    // Enter edit mode to enable edit buttons
    await page.getByRole("button", { name: "Enter Edit Mode" }).click()
    await contentCard.getByRole("button", { name: "Edit" }).click()
    await contentCard.getByLabel("Description (Markdown supported)").fill("Updated via E2E")
    await contentCard.getByRole("button", { name: "Update Item" }).click()
    await expect(contentCard.getByText("Updated via E2E")).toBeVisible()

    await page.goto("/queue-management")
    await expect(page.getByRole("heading", { name: "Queue Management" })).toBeVisible()
    // Queue stats are shown as StatPill components (buttons with labels "Total", "Pending", etc.)
    // Use getByRole to target the stat pill buttons specifically, avoiding badge matches
    await expect(page.getByRole("button", { name: /^Total\s+\d+$/i })).toBeVisible()
    await expect(page.getByRole("button", { name: /^Pending\s+\d+$/i })).toBeVisible()

    // Open the specific queue item detail dialog and verify metadata renders
    await page.getByTestId(`queue-item-${queueId}`).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    // Dialog shows URL domain as company, and job title from metadata
    await expect(dialog).toContainText("example.com")
    await expect(dialog).toContainText("Queue ingestion test")
    await dialog.getByRole("button", { name: /close/i }).click()
  })
})
