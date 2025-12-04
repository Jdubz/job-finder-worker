import { test as base, expect as baseExpect } from "@playwright/test"

// Console error patterns that are expected and should not fail tests.
// These typically occur during normal operation (e.g., auth checks for unauthenticated users,
// SSE connections being closed during navigation, missing optional resources).
const IGNORED_CONSOLE_ERRORS = [
  /Failed to load resource: the server responded with a status of 401/,
  /Failed to load resource: the server responded with a status of 403/,
  /Failed to load resource: the server responded with a status of 404/,
  /Queue event stream disconnected/,
  /network error/i,
]

function isIgnoredConsoleError(text: string): boolean {
  return IGNORED_CONSOLE_ERRORS.some((pattern) => pattern.test(text))
}

// Extend the base test with hard-fail guards for runtime errors.
// Any console error or pageerror will fail the current test immediately,
// ensuring UI crashes are surfaced even if the DOM still renders.
// Expected errors (like 401s from auth checks) are filtered out.
export const test = base.extend({
  page: async ({ page }, withPage) => {
    page.on("pageerror", (err) => {
      throw err
    })

    page.on("console", (msg) => {
      if (msg.type() === "error" && !isIgnoredConsoleError(msg.text())) {
        throw new Error(`Console error: ${msg.text()}`)
      }
    })

    await withPage(page)
  },
})

export const expect = baseExpect
