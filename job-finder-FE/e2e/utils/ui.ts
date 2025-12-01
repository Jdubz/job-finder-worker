import { expect, type Locator, type Page } from "@playwright/test"

type AuthStateVariant = "owner" | "viewer" | "anonymous" | "any"

function authStatePattern(state: AuthStateVariant): RegExp {
  switch (state) {
    case "owner":
      return /Signed in as Owner/i
    case "viewer":
      return /Signed in as Viewer/i
    case "anonymous":
      return /Not signed in/i
    default:
      return /(Signed in as (Owner|Viewer)|Not signed in)/i
  }
}

export function getAuthIcon(page: Page, state: AuthStateVariant = "any"): Locator {
  return page.getByRole("button", { name: authStatePattern(state) }).first()
}

export async function openAuthModal(page: Page, state: AuthStateVariant = "any") {
  const trigger = getAuthIcon(page, state)

  // Wait for the button to be visible AND enabled (auth context finished loading)
  await expect(trigger).toBeVisible({ timeout: 15000 })
  await expect(trigger).toBeEnabled({ timeout: 15000 })

  // Wait for any toast notifications to disappear (they auto-dismiss)
  const toast = page.locator('[data-sonner-toast]')

  // Wait up to 5 seconds for toasts to auto-dismiss
  try {
    await toast.first().waitFor({ state: "hidden", timeout: 5000 })
  } catch {
    // If toast still visible, try to click close button or use force click
    const closeButton = toast.first().locator('button[aria-label="Close toast"]')
    if (await closeButton.isVisible({ timeout: 500 }).catch(() => false)) {
      await closeButton.click()
      await page.waitForTimeout(300)
    }
  }

  // Scroll the button into view and ensure it's stable
  await trigger.scrollIntoViewIfNeeded()
  await page.waitForTimeout(100) // Brief pause for any scroll animations

  // Click - use JavaScript dispatch if normal click fails (more reliable for React)
  try {
    await trigger.click({ timeout: 3000 })
  } catch {
    // Fall back to JavaScript click dispatch which properly bubbles to React
    await trigger.evaluate((el: HTMLElement) => {
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }))
    })
  }

  // Try accessible name first, fall back to any dialog containing "Authentication" text
  const dialogByName = page.getByRole("dialog", { name: /authentication/i })
  const dialogByContent = page.getByRole("dialog").filter({ hasText: /authentication/i })

  // Wait for either selector to be visible
  const dialog = await Promise.any([
    dialogByName.waitFor({ state: "visible", timeout: 15000 }).then(() => dialogByName),
    dialogByContent.waitFor({ state: "visible", timeout: 15000 }).then(() => dialogByContent)
  ]).catch(() => {
    throw new Error("Authentication dialog did not appear within 15 seconds")
  })

  return dialog
}

export async function openNavigationDrawer(page: Page) {
  const toggleButton = page.getByRole("button", { name: /toggle navigation menu/i }).first()
  await expect(toggleButton).toBeVisible({ timeout: 10000 })
  await toggleButton.click()
}
