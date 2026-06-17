/**
 * E2E smoke: Shot Planning Board → Production Run Queue bridge
 *
 * Run: npx playwright test --config=playwright.config.ts e2e/shot-planning-run-queue-bridge.spec.ts
 */

import { expect, test, type Page } from "@playwright/test";

// ============================================================================
// Helpers
// ============================================================================

type StoredCanvas = {
  version: 1;
  savedAt: number;
  nodes: Array<Record<string, any>>;
  edges: Array<Record<string, any>>;
};

const MOCK_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

function createStoryboardCanvas(): StoredCanvas {
  const sourceId = "e2e-bridge-source";
  const shotIds = ["e2e-bridge-shot-1", "e2e-bridge-shot-2", "e2e-bridge-shot-3"];

  return {
    version: 1,
    savedAt: Date.now(),
    nodes: [
      {
        id: sourceId,
        type: "content",
        position: { x: 120, y: 120 },
        width: 760,
        height: 620,
        measured: { width: 760, height: 620 },
        data: {
          title: "E2E 桥接测试",
          nodeKind: "storyboard",
          content: "三镜头短剧：测试桥接。",
          prompt: "三镜头短剧：测试桥接。",
          storyboardAssistantStage: "storyboard-text",
          autoSizeMode: "fixed-width-height-grows",
          displayWidth: 760,
          displayHeight: 620,
          generatedShotNodeIds: shotIds,
          storyboardProcessVisible: true,
        },
      },
      ...shotIds.map((id, index) => ({
        id,
        type: "shot",
        position: { x: 980, y: 120 + index * 360 },
        width: 340,
        height: 260,
        measured: { width: 340, height: 260 },
        data: {
          title: `镜头 ${index + 1}`,
          description:
            index === 0 ? "城市黄昏全景" : index === 1 ? "主角特写" : "追逐场景",
          duration: index === 0 ? 5 : index === 1 ? 3 : 4,
          shotPresetId: index === 0 ? "preset-wide" : "preset-closeup",
          stylePresetId: "style-noir",
          image: MOCK_IMAGE,
        },
      })),
    ],
    edges: shotIds.map((id) => ({
      id: `e2e-bridge-edge-${id}`,
      source: sourceId,
      target: id,
      type: "smoothstep",
    })),
  };
}

async function seedCanvasData(page: Page, projectId: string): Promise<void> {
  const storageKey = `startrails_canvas_p:${encodeURIComponent(projectId)}`;
  const canvas = createStoryboardCanvas();
  await page.evaluate(
    ({ key, data }) => {
      window.localStorage.setItem(key, JSON.stringify(data));
    },
    { key: storageKey, data: canvas },
  );
}

async function dismissOnboardingIfPresent(page: Page): Promise<void> {
  const onboarding = page.locator("[data-testid='onboarding-panel']");
  try {
    await onboarding.waitFor({ state: "visible", timeout: 10_000 });
    await page.getByRole("button", { name: "跳过引导" }).click();
    await expect(onboarding).toBeHidden({ timeout: 10_000 });
  } catch {
    // Already dismissed or never appeared
  }
}

async function gotoCanvas(page: Page, projectId: string): Promise<void> {
  await page.goto(`/canvas?projectId=${encodeURIComponent(projectId)}`, {
    waitUntil: "domcontentloaded",
    timeout: 180_000,
  });
  await expect(page.locator(".react-flow").first()).toBeVisible({
    timeout: 90_000,
  });
  await page.waitForTimeout(2_000);
}

// ============================================================================
// Tests
// ============================================================================

test.describe("Shot Planning → Run Queue bridge e2e", () => {
  const PROJECT_ID = "e2e-shot-planning-bridge";

  test.beforeEach(async ({ page }) => {
    await gotoCanvas(page, PROJECT_ID);
    await seedCanvasData(page, PROJECT_ID);
    await gotoCanvas(page, PROJECT_ID);
    await dismissOnboardingIfPresent(page);
  });

  test("creates run queue from ready shots and verifies tasks", async ({ page }) => {
    // 1. Open Shot Planning panel
    await page.locator("[data-testid='shot-planning-toggle']").click();
    const panel = page.locator("[data-testid='shot-planning-panel']");
    await expect(panel).toBeVisible({ timeout: 10_000 });

    // 2. Generate board from storyboard
    await page.locator("[data-testid='shot-planning-generate']").click();
    await expect(panel.locator("[data-planning-item]")).toHaveCount(3, {
      timeout: 10_000,
    });

    // 3. Mark first two shots as "ready"
    await panel
      .locator("[data-planning-item]")
      .first()
      .locator("select")
      .selectOption("ready");
    await panel
      .locator("[data-planning-item]")
      .nth(1)
      .locator("select")
      .selectOption("ready");

    // 4. Click "Create run queue"
    const createBtn = page.locator("[data-testid='shot-planning-create-queue']");
    await expect(createBtn).toBeEnabled();
    await createBtn.click();

    // 5. Success message should appear
    await expect(panel).toContainText("Created 2 queue tasks", { timeout: 5_000 });

    // 6. Production Run Queue panel should auto-open
    const queuePanel = page.locator("[data-testid='production-run-queue-panel']");
    await expect(queuePanel).toBeVisible({ timeout: 10_000 });
  });

  test("disables create button when no ready shots", async ({ page }) => {
    await page.locator("[data-testid='shot-planning-toggle']").click();
    const panel = page.locator("[data-testid='shot-planning-panel']");
    await expect(panel).toBeVisible({ timeout: 10_000 });
    await page.locator("[data-testid='shot-planning-generate']").click();
    await expect(panel.locator("[data-planning-item]")).toHaveCount(3, {
      timeout: 10_000,
    });

    // All shots are "todo" — button should be disabled
    const createBtn = page.locator("[data-testid='shot-planning-create-queue']");
    await expect(createBtn).toBeDisabled();
  });
});
