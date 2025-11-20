import { test, expect } from "@playwright/test"
import { readFile } from "node:fs/promises"
import { applyAuthState, ownerAuthState } from "./fixtures/auth"
import { deleteContentItem, listContentItems, seedContentItem } from "./fixtures/api-client"

test.describe("Content items administration", () => {
  test.beforeEach(async ({ page }) => {
    await applyAuthState(page, ownerAuthState())
  })

  test("supports editing, child creation, reordering, deletion, and export", async ({ page, request }, testInfo) => {
    const slug = `E2E Content ${Date.now()}`
    const cleanup = async () => {
      const items = await listContentItems(request)
      const matches = items.filter((item) => item.title?.includes(slug))
      await Promise.all(matches.map((item) => deleteContentItem(request, item.id).catch(() => undefined)))
    }

    const parentAlpha = await seedContentItem(request, {
      itemData: {
        title: `${slug} Alpha`,
        order: 0,
        visibility: "published",
      },
    })
    const parentBeta = await seedContentItem(request, {
      itemData: {
        title: `${slug} Beta`,
        order: 1,
        visibility: "published",
      },
    })

    try {
      await page.goto("/content-items")

      const alphaCard = page.getByTestId(`content-item-${parentAlpha}`)
      await expect(alphaCard.getByRole("heading", { name: `${slug} Alpha` })).toBeVisible()

      // Edit root item
      await alphaCard.getByRole("button", { name: "Edit" }).click()
      await alphaCard.getByLabel("Location").fill("Portland, OR")
      await alphaCard.getByLabel("Website").fill("https://updated.example.com")
      await alphaCard.getByLabel("Description (Markdown supported)").fill("Owns automation coverage.")
      await alphaCard.getByLabel("Skills (comma separated)").fill("Playwright, SQLite")
      await alphaCard.getByRole("button", { name: "Update Item" }).click()

      await expect(alphaCard.getByText("Portland, OR")).toBeVisible()
      await expect(alphaCard.getByText("Owns automation coverage.")).toBeVisible()

      // Add child item
      const childTitle = `${slug} Child`
      await alphaCard.getByRole("button", { name: "Add Child" }).click()
      const childForm = alphaCard.locator("form").last()
      await childForm.getByLabel("Title").fill(childTitle)
      await childForm.getByLabel("Role").fill("Sr. Engineer")
      await childForm.getByRole("button", { name: "Create Child" }).click()
      await expect(alphaCard.getByText(childTitle)).toBeVisible()

      // Reorder root items
      const rootList = page.getByTestId("content-items-root")
      await expect(rootList.locator("> div[data-testid^='content-item-']").first().getByRole("heading")).toHaveText(
        `${slug} Alpha`
      )

      const betaCard = page.getByTestId(`content-item-${parentBeta}`)
      await betaCard.getByRole("button", { name: "Up" }).click()
      await expect(rootList.locator("> div[data-testid^='content-item-']").first().getByRole("heading")).toHaveText(
        `${slug} Beta`
      )

      // Delete via UI
      await betaCard.getByRole("button", { name: "Delete" }).click()
      await expect(page.getByTestId(`content-item-${parentBeta}`)).toHaveCount(0)

      // Export JSON and assert content recorded
      const download = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: /Export/i }).click(),
      ])
      const exportFile = await download[0].path()
      if (!exportFile) {
        throw new Error("Export download path missing")
      }
      const exportJson = JSON.parse(await readFile(exportFile, "utf8")) as Array<Record<string, unknown>>
      const titles: string[] = []
      const collectTitles = (nodes: Array<Record<string, unknown>>) => {
        nodes.forEach((node) => {
          if (typeof node.title === "string") {
            titles.push(node.title)
          }
          if (Array.isArray(node.children)) {
            collectTitles(node.children as Array<Record<string, unknown>>)
          }
        })
      }
      collectTitles(exportJson)
      expect(titles.some((title) => title.includes(slug))).toBeTruthy()
    } finally {
      await testInfo.attach("content-items-cleanup", {
        body: `Cleaning up items with slug: ${slug}`,
        contentType: "text/plain",
      })
      await cleanup()
    }
  })
})
