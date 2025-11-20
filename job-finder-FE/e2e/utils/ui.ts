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
  await trigger.click()

  const dialog = page.getByRole("dialog", { name: /authentication/i })
  await expect(dialog).toBeVisible({ timeout: 15000 })
  return dialog
}

export async function openNavigationDrawer(page: Page) {
  const toggleButton = page.getByRole("button", { name: /toggle navigation menu/i }).first()
  await expect(toggleButton).toBeVisible({ timeout: 10000 })
  await toggleButton.click()
}
