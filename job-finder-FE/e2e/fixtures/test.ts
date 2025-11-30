import { test as base, expect as baseExpect } from "@playwright/test"

// Extend the base test with hard-fail guards for runtime errors.
// Any console error or pageerror will fail the current test immediately,
// ensuring UI crashes are surfaced even if the DOM still renders.
export const test = base.extend({
  page: async ({ page }, withPage) => {
    page.on("pageerror", (err) => {
      throw err
    })

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        throw new Error(`Console error: ${msg.text()}`)
      }
    })

    await withPage(page)
  },
})

export const expect = baseExpect
