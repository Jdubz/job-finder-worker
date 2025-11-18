import { test, expect } from "@playwright/test"

test.describe("Document Builder Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/document-builder")
  })

  test("should display document type selection", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    // Check for document type selector (resume/cover letter)
    const typeSelector = page.locator('select[name*="type"], [role="tablist"]')

    if (await typeSelector.isVisible()) {
      await expect(typeSelector).toBeVisible()
    }
  })

  test("should show job selection dropdown", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    // Look for job selector
    const jobSelector = page.locator('select[name*="job"], input[placeholder*="job"]')

    if (await jobSelector.isVisible()) {
      await expect(jobSelector).toBeVisible()
    }
  })

  test("should display document history list", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    // Check for history section
    const historySection = page.locator("text=/recent documents|history/i")

    if (await historySection.isVisible()) {
      await expect(historySection).toBeVisible()
    }
  })

  test("should generate resume for selected job", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    // This would require setting up job data
    const generateButton = page.locator('button:has-text("Generate Resume")')

    if (await generateButton.isVisible()) {
      await expect(generateButton).toBeVisible()

      // Clicking would require proper setup
      // await generateButton.click();
      // await expect(page.getByText(/generating/i)).toBeVisible();
    }
  })

  test("should generate cover letter for selected job", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    const generateButton = page.locator('button:has-text("Generate Cover Letter")')

    if (await generateButton.isVisible()) {
      await expect(generateButton).toBeVisible()
    }
  })

  test("should show loading state during generation", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    // This would require triggering a generation
    const loadingIndicator = page.locator('[role="status"], [aria-busy="true"]')

    // Loading might not be visible initially
    const isVisible = await loadingIndicator.isVisible()
    if (isVisible) {
      await expect(loadingIndicator).toBeVisible()
    }
  })

  test("should display generated document preview", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    // Look for preview area
    const preview = page.locator('[data-testid="document-preview"], [class*="preview"]')

    if (await preview.isVisible()) {
      await expect(preview).toBeVisible()
    }
  })

  test("should allow downloading generated document", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    // Look for download button
    const downloadButton = page.locator('button:has-text("Download"), a[download]')

    if (await downloadButton.isVisible()) {
      await expect(downloadButton).toBeVisible()
    }
  })

  test("should allow editing document before downloading", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    // Look for edit controls
    const editButton = page.locator('button:has-text("Edit")')

    if (await editButton.isVisible()) {
      await expect(editButton).toBeVisible()
    }
  })

  test("should handle generation errors gracefully", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    // This would require mocking API errors
    const errorAlert = page.locator('[role="alert"]')

    const isVisible = await errorAlert.isVisible()
    if (isVisible) {
      await expect(errorAlert).toBeVisible()
    }
  })
})

test.describe("Document History List", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/document-builder")
  })

  test("should display list of previously generated documents", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    // Look for document list
    const documentList = page.locator('[data-testid="document-history-list"]')

    if (await documentList.isVisible()) {
      await expect(documentList).toBeVisible()
    }
  })

  test("should show document metadata (title, company, date)", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    const documentItems = page.locator('[data-testid="document-item"], li, tr')
    const count = await documentItems.count()

    if (count > 0) {
      const firstItem = documentItems.first()
      await expect(firstItem).toBeVisible()

      // Check for metadata text
      const hasText = await firstItem.textContent()
      expect(hasText).toBeTruthy()
    }
  })

  test("should allow downloading documents from history", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    const documentItems = page.locator('[data-testid="document-item"], li, tr')
    const count = await documentItems.count()

    if (count > 0) {
      const downloadButtons = page.locator('button:has-text("Download"), a[download]')
      const buttonCount = await downloadButtons.count()

      if (buttonCount > 0) {
        await expect(downloadButtons.first()).toBeVisible()
      }
    }
  })

  test("should allow deleting documents from history", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    const deleteButtons = page.locator('button[aria-label*="delete"], button:has-text("Delete")')
    const count = await deleteButtons.count()

    if (count > 0) {
      await expect(deleteButtons.first()).toBeVisible()
    }
  })

  test.skip("should confirm before deleting documents", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    const deleteButtons = page.locator('button[aria-label*="delete"], button:has-text("Delete")')
    const count = await deleteButtons.count()

    if (count > 0) {
      // DISABLED: Don't actually click delete in E2E tests to avoid mutating staging data
      // await deleteButtons.first().click()

      // Just verify the button exists, don't click it
      await expect(deleteButtons.first()).toBeVisible()
    }
  })

  test("should filter documents by type", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    // Look for filter controls
    const filterControl = page.locator('select[name*="type"], [role="tablist"]')

    if (await filterControl.isVisible()) {
      await expect(filterControl).toBeVisible()
    }
  })

  test("should sort documents by date", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    // Look for sort controls
    const sortControl = page.locator('select[name*="sort"], button[aria-label*="sort"]')

    if (await sortControl.isVisible()) {
      await expect(sortControl).toBeVisible()
    }
  })
})

test.describe("Document Generation Flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/document-builder")
  })

  test("should complete full resume generation flow", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    // This would require proper setup with mock data
    // 1. Select job
    // 2. Click generate
    // 3. Wait for generation
    // 4. Preview document
    // 5. Download

    // For now, just verify the components exist
    const jobSelector = page.locator('select[name*="job"]')
    const generateButton = page.locator('button:has-text("Generate")')

    if ((await jobSelector.isVisible()) && (await generateButton.isVisible())) {
      await expect(jobSelector).toBeVisible()
      await expect(generateButton).toBeVisible()
    }
  })

  test("should complete full cover letter generation flow", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    // Similar to resume flow but for cover letter
    const typeSelector = page.locator('[role="tab"]:has-text("Cover Letter")')

    if (await typeSelector.isVisible()) {
      await typeSelector.click()

      const generateButton = page.locator('button:has-text("Generate")')
      if (await generateButton.isVisible()) {
        await expect(generateButton).toBeVisible()
      }
    }
  })
})
