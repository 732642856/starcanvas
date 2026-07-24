/**
 * Quick Add Node Search E2E Tests — canvas-quick-add-node-search.spec.ts
 *
 * Verifies the ComfyUI-style double-click-to-search node quick-add feature:
 *   Double-click canvas → search panel opens → filter → ↑↓ navigate → Enter select → Esc close
 *
 * Test data-testid anchors from QuickAddNodeSearch.tsx:
 *   quick-add-node-search          — panel container
 *   quick-add-node-search-input    — search input
 *   quick-add-node-option-{id}     — option buttons
 */
import { expect, test } from "@playwright/test"
import { createTestProjectId } from "./utils/project"
import { clearBrowserStorage } from "./utils/storage"
import { gotoCanvas } from "./utils"

test.setTimeout(180_000)

test.describe("Quick Add Node Search", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserStorage(page)
  })

  const openQuickAddPanel = async (page: any) => {
    await page.locator(".react-flow__pane").first().dispatchEvent("dblclick", {
      bubbles: true,
      cancelable: true,
      detail: 2,
      clientX: 300,
      clientY: 200,
      button: 0,
    })
  }

  const clickCanvasPane = async (page: any) => {
    await page.locator(".react-flow__pane").first().dispatchEvent("click", {
      bubbles: true,
      cancelable: true,
      detail: 1,
      clientX: 300,
      clientY: 200,
      button: 0,
    })
  }

  test("double-click on canvas opens search panel", async ({ page }) => {
    const projectId = createTestProjectId("quick-add-open")

    await gotoCanvas(page, projectId)

    // Double-click on the canvas pane to trigger quick-add search
    await openQuickAddPanel(page)

    // Panel should open
    await expect(page.getByTestId("quick-add-node-search")).toBeVisible({
      timeout: 10_000,
    })

    // Input should be focused
    await expect(page.getByTestId("quick-add-node-search-input")).toBeFocused()
  })

  test("search input filters node options", async ({ page }) => {
    const projectId = createTestProjectId("quick-add-filter")

    await gotoCanvas(page, projectId)

    // Open the panel
    await openQuickAddPanel(page)
    await expect(page.getByTestId("quick-add-node-search")).toBeVisible({
      timeout: 10_000,
    })

    // Initially all options visible
    await expect(page.getByTestId("quick-add-node-option-content-text")).toBeVisible()

    // Type a filter
    const input = page.getByTestId("quick-add-node-search-input")
    await input.fill("图片")

    // Only image-related options should be visible
    await expect(page.getByTestId("quick-add-node-option-image")).toBeVisible()
    // Text node should be filtered out
    await expect(page.getByTestId("quick-add-node-option-content-text")).not.toBeVisible()
  })

  test("arrow keys navigate and enter selects to create node", async ({ page }) => {
    const projectId = createTestProjectId("quick-add-select")

    await gotoCanvas(page, projectId)

    // Open the panel
    await openQuickAddPanel(page)
    await expect(page.getByTestId("quick-add-node-search")).toBeVisible({
      timeout: 10_000,
    })

    const input = page.getByTestId("quick-add-node-search-input")

    // Navigate down a few times
    await input.press("ArrowDown")
    await input.press("ArrowDown")

    // Press Enter to select
    await input.press("Enter")

    // Panel should close
    await expect(page.getByTestId("quick-add-node-search")).not.toBeVisible({
      timeout: 5_000,
    })

    // A node should have been added to the canvas
    await expect.poll(
      () => page.locator(".react-flow__node").count(),
      { timeout: 10_000 },
    ).toBeGreaterThan(0)
  })

  test("escape key closes the panel without creating a node", async ({ page }) => {
    const projectId = createTestProjectId("quick-add-escape")

    await gotoCanvas(page, projectId)

    // Get initial node count
    const initialNodeCount = await page.locator(".react-flow__node").count()

    // Open the panel
    await openQuickAddPanel(page)
    await expect(page.getByTestId("quick-add-node-search")).toBeVisible({
      timeout: 10_000,
    })

    // Press Escape
    await page.keyboard.press("Escape")

    // Panel should close
    await expect(page.getByTestId("quick-add-node-search")).not.toBeVisible({
      timeout: 5_000,
    })

    // No new nodes should have been created
    await expect(page.locator(".react-flow__node")).toHaveCount(initialNodeCount)
  })

  test("click outside closes the panel", async ({ page }) => {
    const projectId = createTestProjectId("quick-add-outside")

    await gotoCanvas(page, projectId)

    // Open the panel
    await openQuickAddPanel(page)
    await expect(page.getByTestId("quick-add-node-search")).toBeVisible({
      timeout: 10_000,
    })

    // Click outside the panel (on the canvas pane, far from the panel at 300,200)
    // Use mouse.click with coordinates outside the panel (panel width=320, position 300,200)
    await page.mouse.click(700, 300);
    await page.waitForTimeout(500);

    // Panel should close
    await expect(page.getByTestId("quick-add-node-search")).not.toBeVisible({
      timeout: 5_000,
    })
  })

  test("single click on canvas does NOT open the panel", async ({ page }) => {
    const projectId = createTestProjectId("quick-add-single")

    await gotoCanvas(page, projectId)

    // Single click on canvas pane
    await clickCanvasPane(page)

    // Panel should NOT open
    await expect(page.getByTestId("quick-add-node-search")).not.toBeVisible({
      timeout: 3_000,
    })
  })
})
