import { test, expect } from "@playwright/test"
import { loginWithDevToken } from "./fixtures/auth"
import { seedJobMatch, seedQueueJob } from "./fixtures/api-client"

test("document builder surfaces job matches and hydrates the form", async ({ page, request, context }) => {
  const queueId = await seedQueueJob(request, {
    companyName: "Doc Builder Co",
    metadata: {
      title: "Document Builder QA",
      description: "Ensures document builder supports SQLite stack.",
    },
  })

  const jobTitle = `Document Builder Role ${Date.now()}`
  await seedJobMatch(request, {
    queueItemId: queueId,
    jobTitle,
    companyName: "Doc Builder Co",
    matchScore: 95,
  })

  // Authenticate using dev token for admin access
  await loginWithDevToken(context, 'dev-admin-token')
  await page.goto("/document-builder")
  await expect(page.getByRole("heading", { name: "Document Builder" })).toBeVisible()

  await page.getByText("Select a job match or enter manually").click()
  await page.getByRole("option", { name: new RegExp(jobTitle) }).click()

  await expect(page.locator("#job-title")).toHaveValue(jobTitle)
  await expect(page.locator("#company-name")).toHaveValue("Doc Builder Co")

  await page.locator("#target-summary").fill("Tailored summary for document builder e2e.")
  await expect(page.locator("#target-summary")).toHaveValue(
    "Tailored summary for document builder e2e."
  )

  // Ensure we stored the selection state for follow-up actions
  await expect(page.getByText(/Match Score:/i)).toContainText("95")
})
