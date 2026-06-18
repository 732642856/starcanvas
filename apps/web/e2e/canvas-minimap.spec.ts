/**
 * StarCanvas MiniMap 冒烟测试
 *
 * 覆盖：
 *   1. MiniMap 默认可见
 *   2. 点击隐藏按钮后 MiniMap 消失
 *   3. 点击显示按钮后 MiniMap 恢复
 */

import { expect, test } from "@playwright/test"

test.describe("Canvas MiniMap", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear()
      window.sessionStorage.clear()
    })
  })

  test("MiniMap is visible by default on empty canvas", async ({ page }) => {
    await page.goto("/canvas")

    // Wait for canvas to load — use the minimap toggle as anchor
    const toggle = page.getByTestId("minimap-toggle")
    await expect(toggle).toBeVisible()

    // MiniMap should be rendered by default (accessibility tree: img "画布小地图")
    const minimap = page.getByRole("img", { name: "画布小地图" })
    await expect(minimap).toBeVisible()
  })

  test("MiniMap can be hidden and shown again", async ({ page }) => {
    await page.goto("/canvas")

    const toggle = page.getByTestId("minimap-toggle")
    await expect(toggle).toBeVisible()

    // Verify MiniMap is visible initially
    const minimap = page.getByRole("img", { name: "画布小地图" })
    await expect(minimap).toBeVisible()

    await toggle.click()

    // MiniMap should be gone
    await expect(minimap).toBeHidden()

    // Click toggle to show again
    await toggle.click()

    // MiniMap should be visible again
    await expect(minimap).toBeVisible()
  })

  test("no console errors when toggling MiniMap", async ({ page }) => {
    const consoleErrors: string[] = []
    page.on("console", (message) => {
      if (message.type() === "error") {
        const text = message.text()
        if (!text.includes("favicon") && !text.includes("Failed to load resource")) {
          consoleErrors.push(text)
        }
      }
    })

    await page.goto("/canvas")
    const toggle = page.getByTestId("minimap-toggle")
    await expect(toggle).toBeVisible()

    const minimap = page.getByRole("img", { name: "画布小地图" })
    await expect(minimap).toBeVisible()

    await toggle.click()
    await expect(minimap).toBeHidden()

    await toggle.click()
    await expect(minimap).toBeVisible()

    expect(consoleErrors).toEqual([])
  })
})
