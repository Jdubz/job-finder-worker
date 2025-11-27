import { test, expect, type Page } from "@playwright/test"
import { applyAuthState, ownerAuthState } from "./fixtures/auth"
import {
  seedQueueJob,
  updateQueueItem,
  fetchQueueItem,
  sendWorkerQueueEvent,
  clearQueue,
} from "./fixtures/api-client"

const waitForProcessingText = async (page: Page, text: string) => {
  await expect(page.getByText(text).first()).toBeVisible({ timeout: 8000 })
}

test.describe("Queue events live updates", () => {
  test.beforeEach(async ({ page, request }) => {
    await applyAuthState(page, ownerAuthState())
    await clearQueue(request)
  })

  test("Queue manager shows next-up ordering and live worker events", async ({ page, request }) => {
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

    await expect(page.getByRole("heading", { name: /queue management/i })).toBeVisible({ timeout: 15000 })

    const firstRow = page.getByTestId(`queue-item-${firstId}`)
    const secondRow = page.getByTestId(`queue-item-${secondId}`)

    await expect(firstRow).toBeVisible({ timeout: 15000 })
    await expect(secondRow).toBeVisible({ timeout: 15000 })

    const tableFirst = page.locator("tbody tr").first()
    await expect(tableFirst).toContainText(expectedTop.title)

    // Promote first item to processing and verify Now Processing populates via SSE update
    await updateQueueItem(request, firstId, {
      status: "processing",
      processed_at: new Date().toISOString(),
      result_message: "Worker picked up",
      metadata: { job_title: firstTitle },
    })

    await waitForProcessingText(page, "Now Processing")
    await waitForProcessingText(page, "Worker picked up")

    // Simulate worker bridge event to mark success
    const fetched = await fetchQueueItem(request, firstId)
    const workerPayload = {
      ...fetched,
      status: "success",
      result_message: "Worker finished via event bridge",
      completed_at: new Date().toISOString(),
    }

    await sendWorkerQueueEvent(request, {
      event: "item.updated",
      data: { queueItem: workerPayload },
    })

    await expect(page.getByTestId(`queue-item-${firstId}`)).toContainText("success")
    await expect(page.getByTestId(`queue-item-${firstId}`)).toContainText(
      "Worker finished via event bridge"
    )
  })
})
