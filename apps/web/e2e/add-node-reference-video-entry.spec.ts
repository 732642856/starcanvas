import { expect, test } from "@playwright/test"
import { createTestProjectId } from "./utils/project"
import { clearBrowserStorage } from "./utils/storage"
import { gotoCanvas, waitForCanvasReady } from "./utils"
import { testIds } from "./utils/selectors"

test.describe("Add Node reference video entry", () => {
  test.setTimeout(180_000)

  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await clearBrowserStorage(page)
  })

  async function openReferenceVideoEntry(page: import("@playwright/test").Page) {
    await page.getByTestId("add-node-button").click()
    const panel = page.getByTestId("add-node-panel")
    await expect(panel).toBeVisible({ timeout: 15_000 })
    await panel.getByTitle("视频").click()
    await panel.getByTestId("add-node-item-参考视频分析").click()
    await expect(page.getByTestId(testIds.panels.referenceVideoEntry)).toBeVisible({ timeout: 15_000 })
  }

  test("routes to storyboard and structure analysis from the shared entry", async ({ page }) => {
    const projectId = createTestProjectId("add-node-reference-video")
    await gotoCanvas(page, projectId)
    await waitForCanvasReady(page)

    await openReferenceVideoEntry(page)
    await page.getByTestId("reference-video-entry-storyboard").click()
    await expect(page.getByTestId(testIds.panels.reverseStoryboard)).toBeVisible({ timeout: 15_000 })
    await page.getByTestId(testIds.panels.reverseStoryboard).getByRole("button", { name: "关闭" }).click()

    await openReferenceVideoEntry(page)
    await page.getByTestId("reference-video-entry-structure").click()
    await expect(page.getByTestId(testIds.panels.videoRemix)).toBeVisible({ timeout: 15_000 })
  })
})
