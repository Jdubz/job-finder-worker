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
  await expect(trigger).toBeVisible({ timeout: 15000 })

  // Dismiss any toast notifications that may be blocking the click
  const toastDismiss = page.locator('[data-sonner-toast] button[aria-label="Close toast"]')
  if (await toastDismiss.first().isVisible({ timeout: 500 }).catch(() => false)) {
    await toastDismiss.first().click()
    await page.waitForTimeout(300)
  }

  await trigger.click({ force: true })

  const dialog = page.getByRole("dialog", { name: /authentication/i })
  await expect(dialog).toBeVisible({ timeout: 15000 })
  return dialog
}

export async function openNavigationDrawer(page: Page) {
  const toggleButton = page.getByRole("button", { name: /toggle navigation menu/i }).first()
  await expect(toggleButton).toBeVisible({ timeout: 10000 })
  await toggleButton.click()
}
