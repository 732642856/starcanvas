/**
 * E2E smoke: Shot Planning Board → Production Run Queue bridge
 *
 * Run: npx playwright test --config=playwright.config.ts e2e/shot-planning-run-queue-bridge.spec.ts
 */

import { expect, test, type Page } from "@playwright/test";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";

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
          nodeKind: "shot",
          title: `镜头 ${index + 1}`,
          description:
            index === 0 ? "城市黄昏全景" : index === 1 ? "主角特写" : "追逐场景",
          duration: index === 0 ? 5 : index === 1 ? 3 : 4,
          prompt:
            index === 0
              ? "电影感分镜图，黄昏城市全景，霓虹初亮，黑色电影风格"
              : index === 1
                ? "电影感分镜图，主角面部特写，侧逆光，黑色电影风格"
                : "电影感分镜图，街头追逐场景，中景，黑色电影风格",
          shotPresetId: index === 0 ? "preset-wide" : "preset-closeup",
          stylePresetId: "style-noir",
          image: MOCK_IMAGE,
          sourceStoryboardNodeId: sourceId,
          shot: {
            id,
            order: index + 1,
            title: `镜头 ${index + 1}`,
            shotType: index === 0 ? "wide" : index === 1 ? "close-up" : "medium",
            cameraMovement: "static",
            duration: `${index === 0 ? 5 : index === 1 ? 3 : 4}s`,
            description:
              index === 0 ? "城市黄昏全景" : index === 1 ? "主角特写" : "追逐场景",
            visualPrompt:
              index === 0
                ? "电影感分镜图，黄昏城市全景，霓虹初亮，黑色电影风格"
                : index === 1
                  ? "电影感分镜图，主角面部特写，侧逆光，黑色电影风格"
                  : "电影感分镜图，街头追逐场景，中景，黑色电影风格",
            dialogue:
              index === 0 ? "夜色快落下了。" : index === 1 ? "他就在前面。" : "别跟丢。",
            sourceStoryboardNodeId: sourceId,
            status: "ready",
          },
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

import { collectConsoleErrors, dismissOnboardingIfPresent, gotoCanvas } from "./utils";

async function openExportPreflight(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  await page.getByTestId("export-dropdown-toggle").click();
  await page.getByRole("button", { name: "剪映兼容包 (ZIP)" }).click();
  await expect(page.getByText("导出预检")).toBeVisible({ timeout: 15_000 });
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
    await expect(panel).toContainText("Created 8 queue tasks", { timeout: 5_000 });

    // 6. Production Run Queue panel should auto-open
    const queuePanel = page.locator("[data-testid='production-run-queue-panel']");
    await expect(queuePanel).toBeVisible({ timeout: 10_000 });
  });

  test("runs bridged queue and exports Jianying handoff package", async ({ page }) => {
    test.setTimeout(180_000);
    const errors = collectConsoleErrors(page);

    await page.route("**/api/ai/config", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          baseUrl: "https://e2e.invalid/v1",
          hasApiKey: true,
          defaultModel: "e2e-text-model",
          defaultImageModel: "e2e-image-model",
          timeoutMs: 120000,
        }),
      });
    });

    await page.route("**/api/ai/generate-image", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          imageUrl: MOCK_IMAGE,
          requestId: "e2e-shot-planning-bridge-image",
        }),
      });
    });

    await page.evaluate(() => {
      window.localStorage.setItem("startrails_use_mock", "true");
    });

    await page.locator("[data-testid='shot-planning-toggle']").click();
    const panel = page.locator("[data-testid='shot-planning-panel']");
    await expect(panel).toBeVisible({ timeout: 10_000 });
    await page.locator("[data-testid='shot-planning-generate']").click();
    await expect(panel.locator("[data-planning-item]")).toHaveCount(3, {
      timeout: 10_000,
    });

    await panel.locator("[data-planning-item]").first().locator("select").selectOption("ready");
    await panel.locator("[data-planning-item]").nth(1).locator("select").selectOption("ready");

    const createBtn = page.locator("[data-testid='shot-planning-create-queue']");
    await expect(createBtn).toBeEnabled();
    await createBtn.click();

    const queuePanel = page.locator("[data-testid='production-run-queue-panel']");
    await expect(queuePanel).toBeVisible({ timeout: 10_000 });

    await page.getByTestId("production-run-queue-start").click();
    await expect(page.getByTestId("production-run-queue-status")).toContainText("已完成", {
      timeout: 90_000,
    });
    await expect(page.getByTestId("production-run-queue-progress")).toContainText("8/8 完成", {
      timeout: 90_000,
    });

    await openExportPreflight(page);
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /导出 ZIP 兼容包|仍导出/ }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("星轨画布导出_JianYingCompatible.zip");

    const filePath = await download.path();
    if (!filePath) {
      throw new Error("zip download path unavailable");
    }

    const zipBuffer = await readFile(filePath);
    const zip = await JSZip.loadAsync(zipBuffer);
    const entryNames = Object.keys(zip.files).sort();
    expect(entryNames).toContain("JianYingCompatible/README.txt");
    expect(entryNames).toContain("JianYingCompatible/subtitles.srt");
    expect(entryNames).toContain("JianYingCompatible/draft_content.json");
    const videoEntries = entryNames.filter(
      (name) => /^JianYingCompatible\/videos\/[^/]+\.mp4$/.test(name),
    );
    expect(videoEntries).toHaveLength(2);
    for (const name of videoEntries) {
      expect((await zip.file(name)?.async("uint8array"))?.length).toBeGreaterThan(0);
    }

    await expect(page.getByText("导出成功")).toBeVisible({ timeout: 15_000 });
    expect(errors.pageErrors).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
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
