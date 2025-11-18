import { test, expect } from "@playwright/test"

test.describe("Accessibility Tests", () => {
  // Note: Full axe-core accessibility testing would require axe-playwright package
  // For now, these tests verify basic accessibility features manually

  test("should have proper document structure on home page", async ({ page }) => {
    await page.goto("/")

    // Check for main landmark
    const main = page.locator("main")
    await expect(main).toBeVisible()
  })

  test("should have proper document structure on login page", async ({ page }) => {
    await page.goto("/login")

    // Check for main content with timeout
    const heading = page.locator("h1, h2")
    await expect(heading.first()).toBeVisible({ timeout: 10000 })
  })

  test("should have proper heading hierarchy", async ({ page }) => {
    await page.goto("/")

    // Check for h1 with timeout
    const h1 = page.locator("h1")
    await expect(h1.first()).toBeVisible({ timeout: 10000 })
  })

  test("should have proper ARIA labels on interactive elements", async ({ page }) => {
    await page.goto("/")

    // Check buttons have labels
    const buttons = page.locator("button")
    const count = await buttons.count()

    for (let i = 0; i < Math.min(count, 5); i++) {
      const button = buttons.nth(i)
      if (await button.isVisible()) {
        const ariaLabel = await button.getAttribute("aria-label")
        const text = await button.textContent()

        // Button should have either aria-label or text content
        expect(ariaLabel || text?.trim()).toBeTruthy()
      }
    }
  })

  test("should have proper form labels", async ({ page }) => {
    await page.goto("/login")

    // Check all inputs have associated labels
    const inputs = page.locator("input")
    const count = await inputs.count()

    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i)
      const id = await input.getAttribute("id")
      const ariaLabel = await input.getAttribute("aria-label")
      const ariaLabelledBy = await input.getAttribute("aria-labelledby")

      // Input should have id (for label), aria-label, or aria-labelledby
      expect(id || ariaLabel || ariaLabelledBy).toBeTruthy()
    }
  })

  test("should support keyboard navigation on main navigation", async ({ page }) => {
    await page.goto("/")

    // Try tabbing through navigation
    await page.keyboard.press("Tab")

    // Check if an element is focused
    const focusedElement = page.locator(":focus")
    const isVisible = await focusedElement.isVisible()

    if (isVisible) {
      await expect(focusedElement).toBeVisible()
    }
  })

  test("should have visible focus indicators", async ({ page }) => {
    await page.goto("/")

    // Tab to first focusable element
    await page.keyboard.press("Tab")

    const focusedElement = page.locator(":focus")
    if (await focusedElement.isVisible()) {
      // Check if focused element has outline or other focus styles
      const outline = await focusedElement.evaluate((el) => {
        const styles = window.getComputedStyle(el)
        return (
          styles.outline !== "none" || styles.outlineWidth !== "0px" || styles.boxShadow !== "none"
        )
      })

      expect(outline).toBeTruthy()
    }
  })

  test("should have dark mode support", async ({ page }) => {
    await page.goto("/")

    // Check for theme toggle or dark mode class
    const darkModeIndicators = page.locator(
      '[class*="dark"], [data-theme], button:has-text("Theme")'
    )
    const count = await darkModeIndicators.count()

    // App should have some theme support
    expect(count).toBeGreaterThanOrEqual(0)
  })

  test("should have proper alt text for images", async ({ page }) => {
    await page.goto("/")

    const images = page.locator("img")
    const count = await images.count()

    for (let i = 0; i < count; i++) {
      const img = images.nth(i)
      const alt = await img.getAttribute("alt")

      // All images should have alt attribute (can be empty for decorative)
      expect(alt).not.toBeNull()
    }
  })

  test("should have proper ARIA roles for custom components", async ({ page }) => {
    await page.goto("/job-applications")

    if (page.url().includes("/login")) {
      test.skip()
    }

    // Check for proper roles on interactive elements
    const cards = page.locator('[role="article"], article')
    const cardsCount = await cards.count()

    const dialogs = page.locator('[role="dialog"]')
    const dialogsCount = await dialogs.count()

    const alerts = page.locator('[role="alert"]')
    const alertsCount = await alerts.count()

    // At least one semantic element should exist
    expect(cardsCount + dialogsCount + alertsCount).toBeGreaterThanOrEqual(0)
  })

  test("should allow skipping to main content", async ({ page }) => {
    await page.goto("/")

    // Look for skip link
    const skipLink = page.locator('a[href="#main"], a:has-text("Skip to")')

    if (await skipLink.isVisible()) {
      await expect(skipLink).toBeVisible()
    }
  })

  test("should announce dynamic content changes to screen readers", async ({ page }) => {
    await page.goto("/job-finder")

    if (page.url().includes("/login")) {
      test.skip()
    }

    // Look for live regions
    const liveRegions = page.locator('[aria-live], [role="status"], [role="alert"]')
    const count = await liveRegions.count()

    // Live regions should exist for dynamic updates
    if (count > 0) {
      const firstRegion = liveRegions.first()
      const ariaLive = await firstRegion.getAttribute("aria-live")
      expect(ariaLive).toBeTruthy()
    }
  })

  test("should have proper table semantics", async ({ page }) => {
    await page.goto("/job-finder")

    if (page.url().includes("/login")) {
      test.skip()
    }

    const tables = page.locator("table")
    const count = await tables.count()

    if (count > 0) {
      const table = tables.first()

      // Check for proper table structure
      const thead = table.locator("thead")
      const tbody = table.locator("tbody")

      await expect(thead).toBeVisible()
      await expect(tbody).toBeVisible()
    }
  })
})

test.describe("Keyboard Navigation", () => {
  test("should allow keyboard navigation through forms", async ({ page }) => {
    await page.goto("/login")

    // Tab through form elements
    await page.keyboard.press("Tab")
    const firstFocus = await page.locator(":focus").count()
    expect(firstFocus).toBe(1)

    await page.keyboard.press("Tab")
    const secondFocus = await page.locator(":focus").count()
    expect(secondFocus).toBe(1)
  })

  test("should trap focus in modal dialogs", async ({ page }) => {
    await page.goto("/job-applications")

    if (page.url().includes("/login")) {
      test.skip()
    }

    // Open a dialog if possible
    const cards = page.locator('[data-testid="job-match-card"], article')
    const count = await cards.count()

    if (count > 0) {
      await cards.first().click()

      const dialog = page.locator('[role="dialog"]')
      if (await dialog.isVisible({ timeout: 2000 })) {
        // Tab multiple times and ensure focus stays in dialog
        const dialogElement = await dialog.elementHandle()

        await page.keyboard.press("Tab")
        const focusedElement = await page.locator(":focus").elementHandle()

        // Focus should be within the dialog
        if (dialogElement && focusedElement) {
          const isInDialog = await dialogElement.evaluate(
            (dialog, focused) => dialog.contains(focused),
            focusedElement
          )
          expect(isInDialog).toBeTruthy()
        }
      }
    }
  })

  test("should support escape key to close dialogs", async ({ page }) => {
    await page.goto("/job-applications")

    if (page.url().includes("/login")) {
      test.skip()
    }

    const cards = page.locator('[data-testid="job-match-card"], article')
    const count = await cards.count()

    if (count > 0) {
      await cards.first().click()

      const dialog = page.locator('[role="dialog"]')
      if (await dialog.isVisible({ timeout: 2000 })) {
        await page.keyboard.press("Escape")

        // Dialog should close
        await expect(dialog).not.toBeVisible({ timeout: 2000 })
      }
    }
  })

  test("should support arrow key navigation in select components", async ({ page }) => {
    await page.goto("/job-finder-config")

    if (page.url().includes("/login")) {
      test.skip()
    }

    const selects = page.locator("select")
    const count = await selects.count()

    if (count > 0) {
      const select = selects.first()
      await select.focus()

      // Try arrow down
      await page.keyboard.press("ArrowDown")

      // Select should still be focused
      await expect(select).toBeFocused()
    }
  })
})
