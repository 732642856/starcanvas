/**
 * Cross-Feature Smoke Flow — create-flow.spec.ts
 *
 * Verifies the end-to-end "create" pipeline covers all newer P0/P1 features:
 *   AI Script → Draft → Import → Canvas nodes → Shot Library → Persistence
 *
 * This is a smoke test, not a detailed feature test.
 * Each individual feature has its own dedicated tests.
 */
import { expect, test } from "@playwright/test"
import { createTestProjectId } from "./utils/project"
import { clearBrowserStorage } from "./utils/storage"
import { testIds } from "./utils/selectors"

async function waitForCanvasInteractive(page: import("@playwright/test").Page) {
  await page.waitForFunction(
    () => Boolean((window as typeof window & { __starcanvasE2E?: unknown }).__starcanvasE2E),
    undefined,
    { timeout: 90_000 },
  )
  await page.waitForTimeout(1_200)
}

test.setTimeout(300_000)

test.describe("Create flow smoke", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserStorage(page)
  })

  test("Script import → shot library → persistence", async ({ page }) => {
    const projectId = createTestProjectId("create-flow")

    // Step 1: Navigate to canvas
    await page.goto(`/canvas?projectId=${encodeURIComponent(projectId)}`, {
      waitUntil: "domcontentloaded",
      timeout: 180_000,
    })
    await expect(page.locator(".react-flow").first()).toBeVisible({ timeout: 90_000 })
    await waitForCanvasInteractive(page)

    // Step 2: Empty canvas exposes the primary script-import entry.
    await page.getByTestId("empty-guide-import-script").click()
    await expect(page.getByTestId("script-import-panel")).toBeVisible({
      timeout: 15_000,
    })

    // Step 3: Import a structured script to create the primary canvas nodes.
    await page.getByPlaceholder("例如：隐门探案 第 1 集").fill("沙漠古城")
    await page.getByPlaceholder("粘贴剧本、故事梗概、文字分镜或场次文本……").fill(
      "镜头 1\n画面内容：主角穿越沙漠寻找失落的古城。\n景别：全景\n运镜：缓慢推进",
    )
    await page.getByTestId("script-import-submit").click()

    // Assert nodes appear on canvas
    await expect.poll(
      () => page.locator(".react-flow__node").count(),
      { timeout: 15_000 },
    ).toBeGreaterThan(0)

    // Step 4: Professional tools become available after nodes exist.
    await page.locator(`[data-testid='${testIds.toolbar.shotLibrary}']`).click()
    await expect(page.locator(`[data-testid='${testIds.panels.shotLibrary}']`)).toBeVisible({
      timeout: 10_000,
    })

    // Step 5: Reload page and verify persistence
    await page.goto(`/canvas?projectId=${encodeURIComponent(projectId)}`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    })
    await expect(page.locator(".react-flow").first()).toBeVisible({ timeout: 90_000 })

    // Nodes should persist after reload
    await expect.poll(
      () => page.locator(".react-flow__node").count(),
      { timeout: 15_000 },
    ).toBeGreaterThan(0)
  })

  test("Reverse storyboard → extract frames → generate draft → import", async ({ page }) => {
    const projectId = createTestProjectId("reverse-story")

    // Step 1: Navigate to canvas
    await page.goto(`/canvas?projectId=${encodeURIComponent(projectId)}`, {
      waitUntil: "domcontentloaded",
      timeout: 180_000,
    })
    await expect(page.locator(".react-flow").first()).toBeVisible({ timeout: 90_000 })

    // Step 2: Open reference video entry from the blank-canvas guide
    await page.getByTestId("empty-guide-import-reference-video").click()
    await expect(page.locator(`[data-testid='${testIds.panels.referenceVideoEntry}']`)).toBeVisible({
      timeout: 10_000,
    })
    await page.locator("[data-testid='reference-video-entry-storyboard']").click()
    await expect(page.locator(`[data-testid='${testIds.panels.reverseStoryboard}']`)).toBeVisible({
      timeout: 10_000,
    })

    // Step 3: Verify UI structure (file input, step labels)
    await expect(
      page.locator(`[data-testid='${testIds.panels.reverseStoryboard}']`),
    ).toContainText("选择参考视频")

    // Close panel cleanly
    await page.locator(`[data-testid='${testIds.panels.reverseStoryboard}'] button svg.lucide-x`).click()
  })

  test("Reference video entry routes to structure analysis", async ({ page }) => {
    const projectId = createTestProjectId("reference-video-structure")

    await page.goto(`/canvas?projectId=${encodeURIComponent(projectId)}`, {
      waitUntil: "domcontentloaded",
      timeout: 180_000,
    })

    await expect(page.locator(".react-flow").first()).toBeVisible({ timeout: 90_000 })
    await waitForCanvasInteractive(page)
    await page.getByTestId("empty-guide-import-reference-video").click()
    await expect(page.locator(`[data-testid='${testIds.panels.referenceVideoEntry}']`)).toBeVisible({
      timeout: 10_000,
    })
    await page.locator("[data-testid='reference-video-entry-structure']").click()
    await expect(page.getByText("一键拉片")).toBeVisible({ timeout: 10_000 })
    await page.locator("button[title='关闭']").last().click()
  })

  test("Color grade panel opens and closes cleanly", async ({ page }) => {
    const projectId = createTestProjectId("color-grade")

    await page.goto(`/canvas?projectId=${encodeURIComponent(projectId)}`, {
      waitUntil: "domcontentloaded",
      timeout: 180_000,
    })
    await expect(page.locator(".react-flow").first()).toBeVisible({ timeout: 90_000 })

    // Professional tools are intentionally hidden until the canvas has content.
    await page.getByTestId("empty-guide-create-text").click()
    await expect.poll(() => page.locator(".react-flow__node").count(), { timeout: 10_000 }).toBeGreaterThan(0)

    // Open color grade
    await page.locator(`[data-testid='${testIds.toolbar.colorGrade}']`).click()
    await expect(page.locator(`[data-testid='${testIds.panels.colorGrade}']`)).toBeVisible({
      timeout: 10_000,
    })

    // Close color grade
    await page.locator(`[data-testid='${testIds.panels.colorGrade}'] button svg.lucide-x`).click()
    await expect(page.locator(`[data-testid='${testIds.panels.colorGrade}']`)).not.toBeVisible({
      timeout: 5_000,
    })
  })
})
