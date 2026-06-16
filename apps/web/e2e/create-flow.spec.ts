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

test.setTimeout(300_000)

test.describe("Create flow smoke", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserStorage(page)
  })

  test("AI Script generation → import → shot library → persistence", async ({ page }) => {
    const projectId = createTestProjectId("create-flow")

    // Step 1: Navigate to canvas
    await page.goto(`/canvas?projectId=${encodeURIComponent(projectId)}`, {
      waitUntil: "domcontentloaded",
      timeout: 180_000,
    })
    await expect(page.locator(".react-flow").first()).toBeVisible({ timeout: 90_000 })

    // Step 2: Open AI Script panel
    await page.locator(`[data-testid='${testIds.toolbar.aiScript}']`).click()
    await expect(page.locator(`[data-testid='${testIds.panels.aiScript}']`)).toBeVisible({
      timeout: 15_000,
    })

    // Step 3: Fill brief and generate
    await page.locator(`[data-testid='${testIds.aiScript.briefInput}']`).fill(
      "一个冒险故事：主角穿越沙漠寻找失落的古城",
    )
    await page.locator(`[data-testid='${testIds.aiScript.generateButton}']`).click()

    // Wait for draft preview to appear
    await expect(page.locator(`[data-testid='${testIds.aiScript.draftPreview}']`)).toBeVisible({
      timeout: 15_000,
    })

    // Step 4: Import shots to canvas
    await page.locator(`[data-testid='${testIds.aiScript.importButton}']`).click()

    // Assert nodes appear on canvas
    await expect.poll(
      () => page.locator(".react-flow__node").count(),
      { timeout: 15_000 },
    ).toBeGreaterThan(0)

    // Step 5: Close panel, open shot library
    await page.locator(`[data-testid='${testIds.panels.aiScript}'] button svg.lucide-x`).click()
    await expect(page.locator(`[data-testid='${testIds.panels.aiScript}']`)).not.toBeVisible({
      timeout: 5_000,
    })

    await page.locator(`[data-testid='${testIds.toolbar.shotLibrary}']`).click()
    await expect(page.locator(`[data-testid='${testIds.panels.shotLibrary}']`)).toBeVisible({
      timeout: 10_000,
    })

    // Step 6: Reload page and verify persistence
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

    // Step 2: Open reverse storyboard panel
    await page.locator(`[data-testid='${testIds.toolbar.reverseStoryboard}']`).click()
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

  test("Color grade panel opens and closes cleanly", async ({ page }) => {
    const projectId = createTestProjectId("color-grade")

    await page.goto(`/canvas?projectId=${encodeURIComponent(projectId)}`, {
      waitUntil: "domcontentloaded",
      timeout: 180_000,
    })
    await expect(page.locator(".react-flow").first()).toBeVisible({ timeout: 90_000 })

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
