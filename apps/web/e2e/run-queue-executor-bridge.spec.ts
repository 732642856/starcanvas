/**
 * E2E smoke: Run Queue → Executor bridge
 *
 * Verifies that the bridged queue (from ShotPlanningBoard) is wired to
 * useProductionRunExecutor, so the "开始生产" button executes bridged tasks.
 *
 * Run: npx playwright test --config=playwright.config.ts e2e/run-queue-executor-bridge.spec.ts
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
  const sourceId = "e2e-exec-bridge-source";
  const shotIds = ["e2e-exec-bridge-shot-1", "e2e-exec-bridge-shot-2"];

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
          title: "E2E 执行器桥接测试",
          nodeKind: "storyboard",
          content: "两镜头短剧：测试执行器桥接。",
          prompt: "两镜头短剧：测试执行器桥接。",
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
          title: `执行桥接镜头 ${index + 1}`,
          nodeKind: "shot",
          description:
            index === 0
              ? "女主站在窗前，阳光洒落。"
              : "女主回头望向门口。",
          duration: index === 0 ? 3 : 2,
          shotPresetId: index === 0 ? "preset-wide" : "preset-closeup",
          stylePresetId: "style-noir",
          image: MOCK_IMAGE,
          prompt: [
            "cinematic wide shot, woman standing by window, warm sunlight",
            "cinematic close-up, woman turning to look at door, suspenseful lighting",
          ][index],
          shot: {
            id,
            order: index + 1,
            title: `执行桥接镜头 ${index + 1}`,
            shotType: index === 0 ? "wide" : "close-up",
            cameraMovement: "static",
            duration: index === 0 ? "3s" : "2s",
            description:
              index === 0
                ? "女主站在窗前，阳光洒落。"
                : "女主回头望向门口。",
            visualPrompt: [
              "cinematic wide shot, woman standing by window, warm sunlight",
              "cinematic close-up, woman turning to look at door, suspenseful lighting",
            ][index],
            dialogue: index === 0 ? "今天的阳光真好。" : "谁在那里？",
            sourceStoryboardNodeId: sourceId,
            status: "ready",
          },
        },
      })),
    ],
    edges: shotIds.map((id) => ({
      id: `e2e-exec-bridge-edge-${id}`,
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
      window.localStorage.setItem("startrails_use_mock", "true");
    },
    { key: storageKey, data: canvas },
  );
}

import { dismissOnboardingIfPresent, gotoCanvas } from "./utils";

// ============================================================================
// Tests
// ============================================================================

test.describe("Run Queue → Executor Bridge", () => {
  const PROJECT_ID = "e2e-exec-bridge-project";

  test.beforeEach(async ({ page }) => {
    // Phase 1: Navigate first so the app initializes
    await gotoCanvas(page, PROJECT_ID);

    // Phase 2: Inject canvas data into localStorage (after page load)
    await seedCanvasData(page, PROJECT_ID);

    // Phase 3: Re-navigate to trigger restore logic
    await gotoCanvas(page, PROJECT_ID);

    // Phase 4: Dismiss onboarding
    await dismissOnboardingIfPresent(page);
  });

  test("bridged queue start button executes tasks to completion", async ({ page }) => {
    // ── Mock AI config ──
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

    // ── Mock image generation (with delay so isRunning state is visible) ──
    await page.route("**/api/ai/generate-image", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ imageUrl: MOCK_IMAGE, requestId: "e2e-exec-bridge-image" }),
      });
    });

    await page.route("**/api/ai/generate-video-vidu", async (route) => {
      const sseBody = [
        "event: progress\ndata: " + JSON.stringify({ stage: "queued", percent: 10, message: "queued" }) + "\n\n",
        "event: result\ndata: " + JSON.stringify({ videoUrl: MOCK_IMAGE, taskId: "e2e-exec-bridge-video" }) + "\n\n",
      ].join("");
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sseBody,
      });
    });

    // ── Mock TTS HF Space ──
    await page.route("**/k2-fsa-omnivoice.hf.space/call/generate", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ event_id: "e2e-exec-bridge-tts" }),
        });
      }
    });

    // ── Mock TTS result polling ──
    await page.route("**/k2-fsa-omnivoice.hf.space/call/generate/e2e-exec-bridge-tts", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          stage: "complete",
          output: {
            data: [{ url: "/file=/tmp/e2e-exec-bridge-tts.wav", name: "e2e-exec-bridge-tts.wav" }],
          },
        }),
      });
    });

    // ── Mock TTS audio fetch ──
    await page.route("**/k2-fsa-omnivoice.hf.space/file=/tmp/e2e-exec-bridge-tts.wav", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "audio/wav",
        body: Buffer.from(
          "UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=",
          "base64",
        ),
      });
    });

    // ── 1. Open Shot Planning panel ──
    const planningBtn = page.getByTestId("shot-planning-toggle");
    await expect(planningBtn).toBeVisible({ timeout: 5_000 });
    await planningBtn.click();

    const panel = page.getByTestId("shot-planning-panel");
    await expect(panel).toBeVisible({ timeout: 10_000 });

    // ── 2. Generate board from storyboard ──
    await page.getByTestId("shot-planning-generate").click();
    await expect(panel.locator("[data-planning-item]")).toHaveCount(2, {
      timeout: 10_000,
    });

    // ── 3. Mark both shots as "ready" ──
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

    // ── 4. Create run queue from ready shots ──
    const createQueueBtn = page.getByTestId("shot-planning-create-queue");
    await expect(createQueueBtn).toBeEnabled({ timeout: 3_000 });
    await createQueueBtn.click();

    // ── 5. Close shot planning panel (z-index 91 blocks queue panel clicks) ──
    const closeBtn = page.getByTestId("shot-planning-close");
    await closeBtn.click();
    await expect(panel).not.toBeVisible({ timeout: 5_000 });

    // ── 6. Verify bridged queue panel auto-opened ──
    const queuePanel = page.getByTestId("production-run-queue-panel");
    await expect(queuePanel).toBeVisible({ timeout: 5_000 });

    // ── 7. Verify tasks are visible ──
    const tasks = page.getByTestId("production-run-queue-task");
    await expect(tasks.first()).toBeVisible({ timeout: 5_000 });
    const taskCount = await tasks.count();
    expect(taskCount).toBe(8);

    // ── 8. Verify "开始生产" button is present (wired to executor) ──
    const startBtn = page.getByTestId("production-run-queue-start");
    await expect(startBtn).toBeVisible();
    await expect(startBtn).toBeEnabled();

    // ── 9. Click start to verify executor runs on bridged queue ──
    await startBtn.click();

    // ── 10. Verify "执行中" state appears (mock has 300ms delay) ──
    await expect(page.getByTestId("production-run-queue-status")).toContainText("运行中", { timeout: 10_000 });

    // ── 11. Wait for execution to complete ──
    await expect(page.getByTestId("production-run-queue-status")).toContainText("已完成", { timeout: 60_000 });

    // ── 12. Close panel via close button ──
    await page.getByTestId("production-run-queue-panel").locator('button[aria-label="关闭"]').click();
    await expect(queuePanel).toHaveCount(0);
  });

  test("bridged queue panel is not shown when bridged queue is cleared", async ({ page }) => {
    // ── Mock AI config ──
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

    // No bridged queue — panel should not be visible
    await expect(page.getByTestId("production-run-queue-panel")).toHaveCount(0);
  });
});
