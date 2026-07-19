import { expect, test } from "@playwright/test"

import { dismissOnboardingIfPresent, gotoCanvas, waitForCanvasReady } from "./utils"
import { createTestProjectId } from "./utils/project"

test.describe("Canvas issue center", () => {
  test("opens from the toolbar and reports an empty canvas as clear", async ({ page }) => {
    await gotoCanvas(page, createTestProjectId("issue-center"))
    await dismissOnboardingIfPresent(page)
    await waitForCanvasReady(page)

    await page.getByTestId("toolbar-issue-center").click()
    const panel = page.getByTestId("canvas-issue-center")
    await expect(panel).toBeVisible()
    await expect(panel).toContainText("当前画布没有待处理问题")

    await panel.getByRole("button", { name: "关闭生产问题" }).click()
    await expect(panel).not.toBeVisible()
  })
})
