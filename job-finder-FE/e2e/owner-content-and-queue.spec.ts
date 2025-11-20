import { test, expect } from "@playwright/test"
import { applyAuthState, ownerAuthState } from "./fixtures/auth"
import { seedContentItem, seedQueueJob } from "./fixtures/api-client"

test.describe("Content and queue management", () => {
  test.beforeEach(async ({ page }) => {
    await applyAuthState(page, ownerAuthState())
  })

  test("renders content editing flow and queue management UI", async ({ page, request }) => {
    const contentTitle = `E2E Experience ${Date.now()}`
    const contentId = await seedContentItem(request, {
      itemData: {
        company: contentTitle,
        summary: "Original summary",
      },
    })

    const queueCompany = `Queue Ops ${Date.now()}`
    await seedQueueJob(request, {
      companyName: queueCompany,
      metadata: {
        title: "Queue ingestion test",
      },
    })

    await page.goto("/content-items")
    const contentCard = page.getByTestId(`content-item-${contentId}`)
    await expect(contentCard.getByText(contentTitle)).toBeVisible()

    await contentCard.getByRole("button", { name: "Edit" }).click()
    await contentCard.getByLabel(/Summary/).fill("Updated via E2E")
    await contentCard.getByRole("button", { name: "Save" }).click()
    await expect(page.getByText(/Item updated successfully/i)).toBeVisible()
    await contentCard.getByRole("button", { name: "Edit" }).click()
    await expect(contentCard.getByLabel(/Summary/)).toHaveValue("Updated via E2E")
    await contentCard.getByRole("button", { name: "Cancel" }).click()

    await page.goto("/queue-management")
    await expect(page.getByRole("heading", { name: "Queue Management" })).toBeVisible()
    await expect(page.getByText("Total Items")).toBeVisible()
    await expect(page.getByText("Pending")).toBeVisible()
  })
})
