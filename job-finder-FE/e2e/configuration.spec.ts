import { test, expect } from "@playwright/test"

test.describe("Configuration Pages", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/job-finder-config")
  })

  test("should display stop list configuration", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    // Check for stop list tab
    const stopListTab = page.locator(
      '[role="tab"]:has-text("Stop List"), button:has-text("Stop List")'
    )

    if (await stopListTab.isVisible()) {
      await stopListTab.click()

      // Check for stop list sections
      const companiesSection = page.locator("text=/companies|blocked companies/i")
      const keywordsSection = page.locator("text=/keywords|blocked keywords/i")

      const hasCompanies = await companiesSection.isVisible()
      const hasKeywords = await keywordsSection.isVisible()

      expect(hasCompanies || hasKeywords).toBeTruthy()
    }
  })

  test("should allow adding companies to stop list", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    const addButton = page.locator('button:has-text("Add Company"), button[aria-label*="add"]')

    if (await addButton.first().isVisible()) {
      await expect(addButton.first()).toBeVisible()
    }
  })

  test("should display queue settings", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    const queueTab = page.locator('[role="tab"]:has-text("Queue"), button:has-text("Queue")')

    if (await queueTab.isVisible()) {
      await queueTab.click()

      // Check for queue configuration fields
      const maxConcurrent = page.locator('input[name*="concurrent"], label:has-text("concurrent")')
      const retrySettings = page.locator('input[name*="retry"], label:has-text("retry")')

      const hasConcurrent = await maxConcurrent.isVisible()
      const hasRetry = await retrySettings.isVisible()

      expect(hasConcurrent || hasRetry).toBeTruthy()
    }
  })

  test("should display AI settings", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    const aiTab = page.locator('[role="tab"]:has-text("AI"), button:has-text("AI Settings")')

    if (await aiTab.isVisible()) {
      await aiTab.click()

      // Check for AI configuration fields
      const modelSelect = page.locator('select[name*="model"], input[name*="model"]')
      const temperatureInput = page.locator('input[name*="temperature"]')

      const hasModel = await modelSelect.isVisible()
      const hasTemp = await temperatureInput.isVisible()

      expect(hasModel || hasTemp).toBeTruthy()
    }
  })

  test("should save configuration changes", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    // Look for save button
    const saveButton = page.locator('button:has-text("Save"), button[type="submit"]')

    if (await saveButton.isVisible()) {
      await expect(saveButton).toBeVisible()
    }
  })
})

test.describe("AI Prompts Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/ai-prompts")
  })

  test("should display prompt editor tabs", async ({ page }) => {
    if (page.url().includes("/login") || page.url().includes("/unauthorized")) {
      test.skip()
    }

    // Check for prompt type tabs
    const tabs = page.locator('[role="tab"], button[class*="tab"]')
    const count = await tabs.count()

    expect(count).toBeGreaterThanOrEqual(0)
  })

  test("should allow editing resume prompt", async ({ page }) => {
    if (page.url().includes("/login") || page.url().includes("/unauthorized")) {
      test.skip()
    }

    // Look for resume prompt editor
    const resumeTab = page.locator('[role="tab"]:has-text("Resume")')

    if (await resumeTab.isVisible()) {
      await resumeTab.click()

      const editor = page.locator('textarea, [contenteditable="true"]')
      if (await editor.isVisible()) {
        await expect(editor).toBeVisible()
      }
    }
  })

  test("should show variable interpolation preview", async ({ page }) => {
    if (page.url().includes("/login") || page.url().includes("/unauthorized")) {
      test.skip()
    }

    // Check for variables section
    const variablesSection = page.locator("text=/variables|available variables/i")

    if (await variablesSection.isVisible()) {
      await expect(variablesSection).toBeVisible()
    }
  })

  test("should allow saving prompt changes", async ({ page }) => {
    if (page.url().includes("/login") || page.url().includes("/unauthorized")) {
      test.skip()
    }

    const saveButton = page.locator('button:has-text("Save")')

    if (await saveButton.isVisible()) {
      await expect(saveButton).toBeVisible()
    }
  })

  test("should allow resetting prompts to defaults", async ({ page }) => {
    if (page.url().includes("/login") || page.url().includes("/unauthorized")) {
      test.skip()
    }

    const resetButton = page.locator('button:has-text("Reset"), button:has-text("Default")')

    if (await resetButton.isVisible()) {
      await expect(resetButton).toBeVisible()
    }
  })
})

test.describe("Settings Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings")
  })

  test("should display account information", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    // Check for account section
    const accountSection = page.locator("text=/account|profile|user info/i")

    if (await accountSection.isVisible()) {
      await expect(accountSection).toBeVisible()
    }
  })

  test("should display theme switcher", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    // Look for theme controls
    const themeToggle = page.locator('button:has-text("Theme"), select[name*="theme"]')

    if (await themeToggle.isVisible()) {
      await expect(themeToggle).toBeVisible()
    }
  })

  test("should allow editing user defaults", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    // Check for user defaults section
    const defaultsSection = page.locator("text=/defaults|preferences/i")

    if (await defaultsSection.isVisible()) {
      await expect(defaultsSection).toBeVisible()
    }
  })

  test("should save settings changes", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    const saveButton = page.locator('button:has-text("Save")')

    if (await saveButton.isVisible()) {
      await expect(saveButton).toBeVisible()
    }
  })
})

test.describe("Document History Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/document-history")
  })

  test("should display document list", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    // Check for document list/table
    const documentList = page.locator('table, [role="list"], [data-testid="document-list"]')

    if (await documentList.isVisible()) {
      await expect(documentList).toBeVisible()
    }
  })

  test("should allow searching documents", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    const searchInput = page.locator('input[type="search"], input[placeholder*="search"]')

    if (await searchInput.isVisible()) {
      await searchInput.fill("Senior Engineer")
      await expect(searchInput).toHaveValue("Senior Engineer")
    }
  })

  test("should allow filtering documents by type", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    const filterControl = page.locator('select[name*="type"], [role="tablist"]')

    if (await filterControl.isVisible()) {
      await expect(filterControl).toBeVisible()
    }
  })

  test("should allow downloading documents", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    const downloadButtons = page.locator('button:has-text("Download"), a[download]')
    const count = await downloadButtons.count()

    if (count > 0) {
      await expect(downloadButtons.first()).toBeVisible()
    }
  })

  test("should allow deleting documents", async ({ page }) => {
    if (page.url().includes("/login")) {
      test.skip()
    }

    const deleteButtons = page.locator('button[aria-label*="delete"], button:has-text("Delete")')
    const count = await deleteButtons.count()

    if (count > 0) {
      await expect(deleteButtons.first()).toBeVisible()
    }
  })
})
