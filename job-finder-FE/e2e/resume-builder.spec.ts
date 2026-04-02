import { test, expect } from "./fixtures/test"
import { loginWithDevToken } from "./fixtures/auth"
import { seedResumePoolItem, deleteResumePoolItem, seedBaseConfigs } from "./fixtures/api-client"

test.describe("Resume pool editing", () => {
  const seededIds: string[] = []

  test.beforeEach(async ({ context }) => {
    await loginWithDevToken(context, "dev-admin-token")
    seededIds.length = 0
  })

  test.afterEach(async ({ request }) => {
    for (const id of seededIds) {
      await deleteResumePoolItem(request, id).catch(() => {})
    }
  })

  test("edits a pool item and verifies the update persists", async ({ page, request }) => {
    const itemId = await seedResumePoolItem(request, {
      title: "E2E Edit Corp",
      aiContext: "work",
      role: "Original Role",
      startDate: "2023-01",
      description: "Original description for editing test.",
    })
    seededIds.push(itemId)

    await page.goto("/resumes")
    // Switch to Pool tab
    await page.getByRole("tab", { name: /Pool/i }).click()

    // Enter edit mode
    await page.getByRole("button", { name: /Edit Mode/i }).click()

    // Find the seeded item and click Edit
    const itemCard = page.getByTestId(`content-item-${itemId}`)
    await expect(itemCard.getByText("E2E Edit Corp")).toBeVisible()
    await itemCard.getByRole("button", { name: "Edit" }).click()

    // Modify the role field
    const roleInput = itemCard.getByLabel("Role")
    await roleInput.clear()
    await roleInput.fill("Updated Role")

    // Submit the form
    await itemCard.getByRole("button", { name: "Update Item" }).click()

    // Verify the updated text is visible (form closes, card shows new data)
    await expect(itemCard.getByText("Updated Role")).toBeVisible({ timeout: 10000 })
    // Original role should be gone
    await expect(itemCard.getByText("Original Role")).not.toBeVisible()
  })

  test("creates a new pool item and deletes it", async ({ page }) => {
    await page.goto("/resumes")
    await page.getByRole("tab", { name: /Pool/i }).click()
    await page.getByRole("button", { name: /Edit Mode/i }).click()

    // Click Add Section
    await page.getByRole("button", { name: /Add Section/i }).click()

    // Fill the form
    await page.getByLabel("Title").fill("E2E New Section")
    await page.getByLabel("AI Context").click()
    await page.getByRole("option", { name: /Skills/i }).click()
    await page.getByLabel("Skills (comma separated)").fill("TypeScript, React, Node.js")

    // Submit
    await page.getByRole("button", { name: "Create Section" }).click()

    // Verify it appears
    await expect(page.getByText("E2E New Section")).toBeVisible({ timeout: 10000 })

    // Find and delete it
    const newItem = page.locator("[data-testid]", { hasText: "E2E New Section" }).first()
    await newItem.getByRole("button", { name: "Delete" }).click()

    // Verify it's gone
    await expect(page.getByText("E2E New Section")).not.toBeVisible({ timeout: 10000 })
  })
})

test.describe("Custom resume builder", () => {
  const seededIds: string[] = []

  test.beforeEach(async ({ context, request }) => {
    await loginWithDevToken(context, "dev-admin-token")
    await seedBaseConfigs(request)
    seededIds.length = 0
  })

  test.afterEach(async ({ request }) => {
    for (const id of seededIds) {
      await deleteResumePoolItem(request, id).catch(() => {})
    }
  })

  test("selects items and sees content fit estimation", async ({ page, request }) => {
    // Seed pool items for the builder
    const narId = await seedResumePoolItem(request, {
      title: "E2E Fullstack Summary",
      aiContext: "narrative",
      description: "A versatile fullstack engineer with broad experience across frontend and backend systems.",
    })
    seededIds.push(narId)

    const workId = await seedResumePoolItem(request, {
      title: "E2E Company",
      aiContext: "work",
      role: "Senior Engineer",
      startDate: "2022-01",
    })
    seededIds.push(workId)

    const hlId = await seedResumePoolItem(request, {
      parentId: workId,
      aiContext: "highlight",
      description: "Led migration to microservices, reducing deploy times by 60%.",
    })
    seededIds.push(hlId)

    const skillsId = await seedResumePoolItem(request, {
      title: "E2E Languages",
      aiContext: "skills",
      skills: ["TypeScript", "Python", "Go"],
    })
    seededIds.push(skillsId)

    const eduId = await seedResumePoolItem(request, {
      title: "E2E University",
      aiContext: "education",
      role: "BS Computer Science",
      startDate: "2016-09",
      endDate: "2020-06",
    })
    seededIds.push(eduId)

    await page.goto("/resumes")
    // Switch to Build Resume tab
    await page.getByRole("tab", { name: /Build Resume/i }).click()

    // Verify categories are visible (exact match to avoid matching item titles)
    await expect(page.getByText("Summary", { exact: true })).toBeVisible()
    await expect(page.getByText("Experience", { exact: true })).toBeVisible()
    await expect(page.getByText("Skills", { exact: true })).toBeVisible()
    await expect(page.getByText("Education", { exact: true })).toBeVisible()

    // Initially: no estimate shown, generate button disabled
    await expect(page.getByText("Select items to see page fit estimate")).toBeVisible()
    await expect(page.getByRole("button", { name: /Generate PDF/i })).toBeDisabled()

    // Select a narrative
    await page.getByText("E2E Fullstack Summary").click()

    // Select items — use the rounded border container that holds each selectable item
    await page.locator(".rounded-md.border", { hasText: "E2E Company" }).getByRole("checkbox").click()
    await page.locator("label", { hasText: "E2E Languages" }).getByRole("checkbox").click()
    await page.locator("label", { hasText: "E2E University" }).getByRole("checkbox").click()

    // Content fit estimation should appear after debounce
    await expect(page.getByText(/% of 1 page/)).toBeVisible({ timeout: 10000 })

    // Generate button should be enabled
    await expect(page.getByRole("button", { name: /Generate PDF/i })).toBeEnabled()
  })

  // PDF generation requires a writable /data directory and Chromium on the backend,
  // which aren't available in CI. The estimation test above validates the selection + API flow.
  test("generates a PDF and shows download button", async ({ page, request }) => {
    test.skip(!!process.env.CI, "PDF build requires /data directory not available in CI")
    // Seed minimal pool items
    const skillsId = await seedResumePoolItem(request, {
      title: "E2E Build Skills",
      aiContext: "skills",
      skills: ["JavaScript", "React"],
    })
    seededIds.push(skillsId)

    const eduId = await seedResumePoolItem(request, {
      title: "E2E Build University",
      aiContext: "education",
      role: "BS Engineering",
    })
    seededIds.push(eduId)

    await page.goto("/resumes")
    await page.getByRole("tab", { name: /Build Resume/i }).click()

    // Select items
    await page.locator("label", { hasText: "E2E Build Skills" }).getByRole("checkbox").click()
    await page.locator("label", { hasText: "E2E Build University" }).getByRole("checkbox").click()

    // Wait for estimation
    await expect(page.getByText(/% of 1 page/)).toBeVisible({ timeout: 10000 })

    // Click Generate PDF
    await page.getByRole("button", { name: /Generate PDF/i }).click()

    // Wait for build to complete — Download PDF button should appear
    await expect(page.getByRole("button", { name: /Download PDF/i })).toBeVisible({ timeout: 30000 })
  })
})
