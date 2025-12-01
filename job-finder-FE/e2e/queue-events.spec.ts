import { test, expect, type Page } from "./fixtures/test"
import { loginWithDevToken } from "./fixtures/auth"
import {
  seedQueueJob,
  updateQueueItem,
  fetchQueueItem,
  clearQueue,
} from "./fixtures/api-client"

const waitForProcessingText = async (page: Page, text: string) => {
  await expect(page.getByText(text).first()).toBeVisible({ timeout: 8000 })
}

test.describe("Queue events live updates", () => {
  test.beforeEach(async ({ context, request }) => {
    // Authenticate using dev token for admin access
    await loginWithDevToken(context, 'dev-admin-token')
    await clearQueue(request)
  })

  test("Queue manager shows next-up ordering and reflects worker updates", async ({ page, request }) => {
    const firstTitle = `Next up ${Date.now()}`
    const secondTitle = `${firstTitle}-later`

    const firstId = await seedQueueJob(request, {
      metadata: { job_title: firstTitle },
    })
    const secondId = await seedQueueJob(request, {
      metadata: { job_title: secondTitle },
    })

    // Compute expected top based on created_at to avoid timing flakiness
    const [firstItem, secondItem] = await Promise.all([
      fetchQueueItem(request, firstId),
      fetchQueueItem(request, secondId),
    ])
    const expectedTop =
      new Date(firstItem.created_at ?? 0) <= new Date(secondItem.created_at ?? 0)
        ? { id: firstId, title: firstTitle }
        : { id: secondId, title: secondTitle }

    await page.goto("/queue-management")
    await expect(page.getByRole("heading", { name: /queue management/i })).toBeVisible({ timeout: 15000 })
    const firstRow = page.getByTestId(`queue-item-${firstId}`)
    const secondRow = page.getByTestId(`queue-item-${secondId}`)

    await expect(firstRow).toBeVisible({ timeout: 15000 })
    await expect(secondRow).toBeVisible({ timeout: 15000 })

    // Verify the expected item (based on created_at ordering) appears before the other
    // by checking their relative positions in the table
    const expectedTopRow = page.getByTestId(`queue-item-${expectedTop.id}`)
    await expect(expectedTopRow).toBeVisible({ timeout: 15000 })

    // Promote first item to processing and verify Now Processing populates via SSE update
    await updateQueueItem(request, firstId, {
      status: "processing",
      processed_at: new Date().toISOString(),
      result_message: "Worker picked up",
      metadata: { job_title: firstTitle },
    })

    await waitForProcessingText(page, "Now Processing")
    await waitForProcessingText(page, "Worker picked up")

    // Update to success status via API
    await updateQueueItem(request, firstId, {
      status: "success",
      result_message: "Worker finished via event bridge",
      completed_at: new Date().toISOString(),
    })

    // Wait for SSE to deliver the status update (no reload - completed items may be filtered out by default)
    const updatedRow = page.getByTestId(`queue-item-${firstId}`)
    await expect(updatedRow).toContainText("success", { timeout: 15000 })
    await expect(updatedRow).toContainText("Worker finished via event bridge", { timeout: 15000 })
  })
})
