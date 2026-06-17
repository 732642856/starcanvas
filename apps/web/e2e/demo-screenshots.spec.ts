/**
 * Demo Screenshots — rc.3 feature showcase for README and docs.
 *
 * Captures 7 screenshots of key features for the README Screenshots section.
 * NOT part of CI — skipped when CI=true.
 *
 * Run locally:
 *   pnpm exec playwright test --config=playwright.config.ts e2e/demo-screenshots.spec.ts
 *
 * Output:
 *   docs/assets/screenshots/rc3-*.png
 */
import { expect, test } from "@playwright/test"
import path from "path"
import { createTestProjectId } from "./utils/project"
import { testIds } from "./utils/selectors"

const SCREENSHOT_DIR = path.resolve(__dirname, "../../../docs/assets/screenshots")
const DEMO_PROJECT = createTestProjectId("demo-rc3")
const VIEWPORT = { width: 1440, height: 1000 }

test.setTimeout(360_000)

// Skip in CI — these are documentation assets, not functional tests
test.skip(() => !!process.env.CI, "Screenshots skipped in CI")

test.describe("Demo Screenshots (rc.3)", () => {
  test.beforeEach(async ({ page }) => {
    // Use addInitScript to clear storage before page loads (avoids about:blank SecurityError)
    await page.addInitScript(() => {
      try {
        window.localStorage.clear()
        window.sessionStorage.clear()
      } catch {
        // Storage may not be available yet — that's fine
      }
    })
    await page.setViewportSize(VIEWPORT)
  })

  test("Capture: Onboarding Checklist", async ({ page }) => {
    await page.goto(`/canvas?projectId=${encodeURIComponent(DEMO_PROJECT)}`, {
      waitUntil: "domcontentloaded",
      timeout: 180_000,
    })
    await expect(page.locator(".react-flow").first()).toBeVisible({ timeout: 90_000 })

    // Wait for onboarding panel (auto-shown for new project)
    await expect(page.locator("[data-testid='onboarding-panel']")).toBeVisible({
      timeout: 15_000,
    })

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "rc3-onboarding.png"),
      fullPage: false,
    })
  })

  test("Capture: AI Script Generation", async ({ page }) => {
    await page.goto(`/canvas?projectId=${encodeURIComponent(DEMO_PROJECT)}`, {
      waitUntil: "domcontentloaded",
      timeout: 180_000,
    })
    await expect(page.locator(".react-flow").first()).toBeVisible({ timeout: 90_000 })
    await expect(page.locator("[data-testid='onboarding-panel']")).toBeVisible({ timeout: 15_000 })

    // Use onboarding step 3 button to open AI Script panel (proven reliable)
    await page.locator("[data-testid='onboarding-action-generate-ai-script']").click()
    await expect(page.locator(`[data-testid='${testIds.panels.aiScript}']`)).toBeVisible({
      timeout: 10_000,
    })

    // Fill a demo prompt
    await page.locator(`[data-testid='${testIds.aiScript.briefInput}']`).fill(
      "一个关于勇气与成长的故事：主角穿越沙漠寻找失落的古城",
    )

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "rc3-ai-script.png"),
      fullPage: false,
    })
  })

  test("Capture: Storyboard Canvas", async ({ page }) => {
    await page.goto(`/canvas?projectId=${encodeURIComponent(DEMO_PROJECT)}`, {
      waitUntil: "domcontentloaded",
      timeout: 180_000,
    })
    await expect(page.locator(".react-flow").first()).toBeVisible({ timeout: 90_000 })
    await expect(page.locator("[data-testid='onboarding-panel']")).toBeVisible({ timeout: 15_000 })

    // Dismiss onboarding first — it overlaps with AI Script panel at same position
    await page.getByRole("button", { name: "跳过引导" }).click()
    await expect(page.locator("[data-testid='onboarding-panel']")).toBeHidden({ timeout: 10_000 })

    // Open AI Script via toolbar button (now no onboarding overlay to intercept clicks)
    await page.locator(`[data-testid='${testIds.toolbar.aiScript}']`).click()
    await expect(page.locator(`[data-testid='${testIds.panels.aiScript}']`)).toBeVisible({
      timeout: 10_000,
    })

    // Fill brief, generate, and import
    await page.locator(`[data-testid='${testIds.aiScript.briefInput}']`).fill(
      "一个关于勇气与成长的故事",
    )
    await page.locator(`[data-testid='${testIds.aiScript.generateButton}']`).click()
    await expect(page.locator(`[data-testid='${testIds.aiScript.draftPreview}']`)).toBeVisible({
      timeout: 15_000,
    })
    await page.locator(`[data-testid='${testIds.aiScript.importButton}']`).click()

    // Wait for nodes on canvas
    await expect.poll(
      () => page.locator(".react-flow__node").count(),
      { timeout: 15_000 },
    ).toBeGreaterThan(0)

    // Close AI Script panel
    await page.locator(`[data-testid='${testIds.panels.aiScript}']`).locator("svg.lucide-x").click()

    // Small delay for canvas to settle
    await page.waitForTimeout(500)

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "rc3-storyboard-canvas.png"),
      fullPage: false,
    })
  })

  test("Capture: Shot Library", async ({ page }) => {
    await page.goto(`/canvas?projectId=${encodeURIComponent(DEMO_PROJECT)}`, {
      waitUntil: "domcontentloaded",
      timeout: 180_000,
    })
    await expect(page.locator(".react-flow").first()).toBeVisible({ timeout: 90_000 })
    await expect(page.locator("[data-testid='onboarding-panel']")).toBeVisible({ timeout: 15_000 })

    // Use onboarding step 5 button to open Shot Library
    await page.locator("[data-testid='onboarding-action-apply-shot-preset']").click()
    await expect(page.locator(`[data-testid='${testIds.panels.shotLibrary}']`)).toBeVisible({
      timeout: 10_000,
    })

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "rc3-shot-library.png"),
      fullPage: false,
    })
  })

  test("Capture: Color Grading", async ({ page }) => {
    await page.goto(`/canvas?projectId=${encodeURIComponent(DEMO_PROJECT)}`, {
      waitUntil: "domcontentloaded",
      timeout: 180_000,
    })
    await expect(page.locator(".react-flow").first()).toBeVisible({ timeout: 90_000 })
    await expect(page.locator("[data-testid='onboarding-panel']")).toBeVisible({ timeout: 15_000 })

    // Use onboarding step 6 button to open Color Grade
    await page.locator("[data-testid='onboarding-action-adjust-color-grade']").click()
    await expect(page.locator(`[data-testid='${testIds.panels.colorGrade}']`)).toBeVisible({
      timeout: 10_000,
    })

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "rc3-color-grading.png"),
      fullPage: false,
    })
  })

  test("Capture: Style Library", async ({ page }) => {
    await page.goto(`/canvas?projectId=${encodeURIComponent(DEMO_PROJECT)}`, {
      waitUntil: "domcontentloaded",
      timeout: 180_000,
    })
    await expect(page.locator(".react-flow").first()).toBeVisible({ timeout: 90_000 })
    await expect(page.locator("[data-testid='onboarding-panel']")).toBeVisible({ timeout: 15_000 })

    // Use onboarding step 1 button to open Style Library
    await page.locator("[data-testid='onboarding-action-choose-style']").click()

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "rc3-style-library.png"),
      fullPage: false,
    })
  })

  test("Capture: Reverse Storyboard", async ({ page }) => {
    await page.goto(`/canvas?projectId=${encodeURIComponent(DEMO_PROJECT)}`, {
      waitUntil: "domcontentloaded",
      timeout: 180_000,
    })
    await expect(page.locator(".react-flow").first()).toBeVisible({ timeout: 90_000 })
    await expect(page.locator("[data-testid='onboarding-panel']")).toBeVisible({ timeout: 15_000 })

    // Dismiss onboarding with robust getByRole locator
    await page.getByRole("button", { name: "跳过引导" }).click()
    await expect(page.locator("[data-testid='onboarding-panel']")).toBeHidden({ timeout: 10_000 })

    // Open reverse storyboard via toolbar
    await page.locator(`[data-testid='${testIds.toolbar.reverseStoryboard}']`).click()
    await expect(page.locator(`[data-testid='${testIds.panels.reverseStoryboard}']`)).toBeVisible({
      timeout: 10_000,
    })

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "rc3-reverse-storyboard.png"),
      fullPage: false,
    })
  })
})
