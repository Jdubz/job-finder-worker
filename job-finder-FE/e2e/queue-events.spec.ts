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
    page.on("console", (msg) => console.log("[page console]", msg.type(), msg.text()))
    page.on("pageerror", (err) => console.log("[page error]", err.message))
    await applyAuthState(page, ownerAuthState())
    await clearQueue(request)
  })

  test("Queue manager shows next-up ordering and live worker events", async ({ page, request }) => {
    const firstTitle = `Next up ${Date.now()}`
    const secondTitle = `${firstTitle}-later`

    const firstId = await seedQueueJob(request, {
      metadata: { job_title: firstTitle },
    })
    await new Promise((r) => setTimeout(r, 15))
    const secondId = await seedQueueJob(request, {
      metadata: { job_title: secondTitle },
    })

    await page.goto("/queue-management")
    const apiStatus = await page.evaluate(async () => {
      const token = window.localStorage.getItem("__JF_E2E_AUTH_TOKEN__") || ""
      const res = await fetch("/api/queue", {
        headers: { Authorization: `Bearer ${token}` },
      })
      return { status: res.status, ok: res.ok }
    })
    console.log("/api/queue from page", apiStatus)
    const bodyText = await page.textContent("body")
    console.log("body text snapshot", bodyText?.slice(0, 400))

    await expect(page.getByRole("heading", { name: /queue management/i })).toBeVisible({ timeout: 15000 })

    const firstRow = page.getByTestId(`queue-item-${firstId}`)
    const secondRow = page.getByTestId(`queue-item-${secondId}`)

    const tableDump = await page.locator("tbody").evaluate((node) => node?.innerHTML)
    console.log("table body html", tableDump)

    await expect(firstRow).toBeVisible({ timeout: 15000 })
    await expect(secondRow).toBeVisible({ timeout: 15000 })

    const tableFirst = page.locator("tbody tr").first()
    await expect(tableFirst).toContainText(firstTitle)

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
