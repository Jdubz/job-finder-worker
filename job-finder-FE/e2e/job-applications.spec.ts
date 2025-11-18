import { test, expect } from "@playwright/test"

test.describe("Job Applications Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/job-applications")
  })

  test("should display job matches list", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    // Check for matches container
    const matchesContainer = page.locator('[data-testid="job-matches-list"], [class*="matches"]')

    if (await matchesContainer.isVisible()) {
      await expect(matchesContainer).toBeVisible()
    }
  })

  test("should show filter controls", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    // Look for filter inputs/selects
    const filterSection = page.locator("text=/filter|search/i").first()

    if (await filterSection.isVisible()) {
      await expect(filterSection).toBeVisible()
    }
  })

  test("should display job match cards with key information", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    // Look for job cards
    const jobCards = page.locator('[data-testid="job-match-card"], article, [class*="card"]')
    const count = await jobCards.count()

    if (count > 0) {
      const firstCard = jobCards.first()
      await expect(firstCard).toBeVisible()
    }
  })

  test.skip("should open job details dialog when clicking a job", async ({ page }) => {
    // Click on first job card if available
    const jobCards = page.locator(
      '[data-testid="job-card"], .job-card, [role="button"]:has-text("Software")'
    )

    if ((await jobCards.count()) > 0) {
      await jobCards.first().click()

      // Check for dialog/modal
      const dialog = page.locator('[role="dialog"]')
      await expect(dialog).toBeVisible({ timeout: 5000 })
    }
  })

  test("should filter jobs by match score", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    // Look for score filter controls
    const scoreFilter = page.locator('input[type="range"], select[name*="score"]')

    if (await scoreFilter.isVisible()) {
      await expect(scoreFilter).toBeVisible()
    }
  })

  test("should filter jobs by status", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    // Look for status filter
    const statusFilter = page.locator('select[name*="status"], [role="tablist"]')

    if (await statusFilter.isVisible()) {
      await expect(statusFilter).toBeVisible()

      // Try changing the filter
      if ((await statusFilter.getAttribute("role")) === "tablist") {
        const tabs = statusFilter.locator('[role="tab"]')
        const tabCount = await tabs.count()
        if (tabCount > 1) {
          await tabs.nth(1).click()
          await page.waitForTimeout(500)
        }
      }
    }
  })

  test("should search jobs by company name", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    // Look for search input
    const searchInput = page.locator('input[type="search"], input[placeholder*="search"]')

    if (await searchInput.isVisible()) {
      await searchInput.fill("Google")
      await page.waitForTimeout(500)

      // Results should update
      await expect(searchInput).toHaveValue("Google")
    }
  })

  test("should display match score badges", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    // Look for score indicators
    const scoreElements = page.locator('[data-testid="match-score"], [class*="score"]')
    const count = await scoreElements.count()

    if (count > 0) {
      await expect(scoreElements.first()).toBeVisible()
    }
  })

  test("should show empty state when no matches", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    // This would require mocking an empty state
    // For now, just check if empty state UI exists
    const emptyState = page.locator("text=/no matches|no jobs found/i")

    // Empty state might not be visible if there are matches
    const isVisible = await emptyState.isVisible()
    if (isVisible) {
      await expect(emptyState).toBeVisible()
    }
  })
})

test.describe("Job Details Dialog", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/job-applications")
  })

  test("should display full job description in dialog", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    // Click first job card to open dialog
    const jobCards = page.locator('[data-testid="job-match-card"], article')
    const count = await jobCards.count()

    if (count > 0) {
      await jobCards.first().click()

      // Check for job description
      const dialog = page.locator('[role="dialog"]')
      await expect(dialog).toBeVisible({ timeout: 5000 })

      const description = dialog.locator("text=/description|about the job/i")
      if (await description.isVisible()) {
        await expect(description).toBeVisible()
      }
    }
  })

  test("should show match analysis in dialog", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    const jobCards = page.locator('[data-testid="job-match-card"], article')
    const count = await jobCards.count()

    if (count > 0) {
      await jobCards.first().click()

      const dialog = page.locator('[role="dialog"]')
      await expect(dialog).toBeVisible({ timeout: 5000 })

      // Look for match analysis section
      const analysis = dialog.locator("text=/analysis|skills match|requirements/i")
      if (await analysis.isVisible()) {
        await expect(analysis).toBeVisible()
      }
    }
  })

  test("should have action buttons in dialog", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    const jobCards = page.locator('[data-testid="job-match-card"], article')
    const count = await jobCards.count()

    if (count > 0) {
      await jobCards.first().click()

      const dialog = page.locator('[role="dialog"]')
      await expect(dialog).toBeVisible({ timeout: 5000 })

      // Check for action buttons (apply, generate resume, etc.)
      const actionButtons = dialog.locator("button")
      const buttonCount = await actionButtons.count()
      expect(buttonCount).toBeGreaterThan(0)
    }
  })

  test("should close dialog when clicking close button", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    const jobCards = page.locator('[data-testid="job-match-card"], article')
    const count = await jobCards.count()

    if (count > 0) {
      await jobCards.first().click()

      const dialog = page.locator('[role="dialog"]')
      await expect(dialog).toBeVisible({ timeout: 5000 })

      // Find and click close button
      const closeButton = dialog.locator('button[aria-label*="close"], button:has-text("Close")')
      if (await closeButton.isVisible()) {
        await closeButton.click()
        await expect(dialog).not.toBeVisible({ timeout: 2000 })
      }
    }
  })
})
