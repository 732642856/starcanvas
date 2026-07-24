import { expect, test } from "@playwright/test"

import { createTestProjectId } from "./utils/project"
import { clearBrowserStorage } from "./utils/storage"
import { waitForCanvasReady, waitForCanvasSave } from "./utils"

test("deleting a canvas node survives reload", async ({ page }) => {
  test.setTimeout(120_000)
  const projectId = createTestProjectId("node-delete-persistence")

  await page.goto("/", { waitUntil: "domcontentloaded" })
  await clearBrowserStorage(page)
  await page.goto(`/canvas?projectId=${encodeURIComponent(projectId)}`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  })
  await waitForCanvasReady(page)

  await page.getByTestId("empty-guide-create-text").click()
  const node = page.locator(".react-flow__node").first()
  await expect(node).toBeVisible({ timeout: 10_000 })

  await node.click({ button: "right" })
  await page.getByText("删除节点").click()
  await expect(page.locator(".react-flow__node")).toHaveCount(0, { timeout: 10_000 })
  await waitForCanvasSave(page)

  await page.reload({ waitUntil: "domcontentloaded", timeout: 90_000 })
  await waitForCanvasReady(page)
  await expect(page.locator(".react-flow__node")).toHaveCount(0, { timeout: 15_000 })
  await expect(page.getByTestId("empty-guide-create-text")).toBeVisible()
})
