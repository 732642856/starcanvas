/**
 * StarCanvas MiniMap smoke tests.
 *
 * Covers:
 *   1. MiniMap renders when the canvas has visible nodes.
 *   2. The bottom toolbar toggle hides and restores MiniMap.
 *   3. Toggling does not emit browser console errors.
 */

import { expect, test } from "@playwright/test"
import { createTestProjectId } from "./utils/project"
import { clearBrowserStorage } from "./utils/storage"

test.setTimeout(180_000)

test.describe("Canvas MiniMap", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserStorage(page)
  })

  async function gotoCanvasWithNode(page: import("@playwright/test").Page) {
    const projectId = createTestProjectId("canvas-minimap")
    await page.goto(`/canvas?projectId=${encodeURIComponent(projectId)}`, {
      waitUntil: "domcontentloaded",
      timeout: 180_000,
    })
    await expect(page.locator(".react-flow").first()).toBeVisible({ timeout: 90_000 })
    await page.waitForFunction(
      () => Boolean((window as typeof window & { __starcanvasE2E?: unknown }).__starcanvasE2E),
      undefined,
      { timeout: 90_000 },
    )
    await expect(page.getByTestId("add-node-button")).toBeVisible({ timeout: 30_000 })
    const addButton = page.getByTestId("add-node-button")
    const addPanel = page.getByTestId("add-node-panel")
    await addButton.click()
    await expect(addPanel).toBeVisible({ timeout: 10_000 })
    await page.getByTestId("add-node-item-导演 Agent 中控").click()
    await expect(page.locator(".react-flow__node").first()).toBeVisible({ timeout: 30_000 })
  }

  test("MiniMap is visible and can be hidden and restored", async ({ page }) => {
    await gotoCanvasWithNode(page)

    const toggle = page.getByTestId("minimap-toggle")
    await expect(toggle).toBeVisible()

    const minimap = page.locator(".react-flow__minimap")
    await expect(minimap).toBeVisible()

    await toggle.click()
    await expect(minimap).toBeHidden()

    await toggle.click()
    await expect(minimap).toBeVisible()
  })

  test("toggling MiniMap emits no console errors", async ({ page }) => {
    const consoleErrors: string[] = []
    page.on("console", (message) => {
      if (message.type() !== "error") return
      const text = message.text()
      if (!text.includes("favicon") && !text.includes("Failed to load resource")) {
        consoleErrors.push(text)
      }
    })

    await gotoCanvasWithNode(page)

    const toggle = page.getByTestId("minimap-toggle")
    const minimap = page.locator(".react-flow__minimap")
    await expect(minimap).toBeVisible()

    await toggle.click()
    await expect(minimap).toBeHidden()

    await toggle.click()
    await expect(minimap).toBeVisible()

    expect(consoleErrors).toEqual([])
  })
})
