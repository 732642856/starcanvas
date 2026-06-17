import { expect, test, type Page } from "@playwright/test";

// ============================================================================
// Helpers
// ============================================================================

type StoredCanvas = {
  version: number;
  savedAt: number;
  nodes: Array<Record<string, any>>;
  edges: Array<Record<string, any>>;
};

const MOCK_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

function createStoryboardCanvas(): StoredCanvas {
  const sourceId = "e2e-sp-source";
  const shotIds = ["e2e-sp-shot-1", "e2e-sp-shot-2", "e2e-sp-shot-3"];

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
          title: "E2E 制片规划测试",
          nodeKind: "storyboard",
          content: "三镜头短剧：测试制片规划。",
          prompt: "三镜头短剧：测试制片规划。",
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
            index === 0
              ? "城市黄昏全景"
              : index === 1
                ? "主角特写"
                : "追逐场景",
          duration: index === 0 ? 5 : index === 1 ? 3 : 4,
          shotPresetId: index === 0 ? "preset-wide" : "preset-closeup",
          stylePresetId: "style-noir",
        },
      })),
    ],
    edges: shotIds.map((id) => ({
      id: `e2e-sp-edge-${id}`,
      source: sourceId,
      target: id,
      type: "smoothstep",
    })),
  };
}

/**
 * Seed canvas data into localStorage AFTER the page has loaded.
 * The app reads from supermemory (IndexedDB) first, then falls back to
 * legacy localStorage. We inject into localStorage and then re-navigate
 * to trigger the restore logic — same pattern as project-canvas-isolation.
 */
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

/**
 * Dismiss the onboarding checklist panel if it is visible.
 * Onboarding has z-index 92 and intercepts pointer events on panels below it.
 * Uses same robust pattern as demo-screenshots.spec.ts.
 */
async function dismissOnboardingIfPresent(page: Page): Promise<void> {
  const onboarding = page.locator("[data-testid='onboarding-panel']");
  try {
    await onboarding.waitFor({ state: "visible", timeout: 10_000 });
    await page.getByRole("button", { name: "跳过引导" }).click();
    await expect(onboarding).toBeHidden({ timeout: 10_000 });
  } catch {
    // Already dismissed or never appeared — fine
  }
}

/** Navigate to canvas and wait for the React Flow shell to be visible. */
async function gotoCanvas(page: Page, projectId: string): Promise<void> {
  await page.goto(`/canvas?projectId=${encodeURIComponent(projectId)}`, {
    waitUntil: "domcontentloaded",
    timeout: 180_000,
  });
  await expect(page.locator(".react-flow").first()).toBeVisible({
    timeout: 90_000,
  });
  // Let hydration + restore complete
  await page.waitForTimeout(2_000);
}

// ============================================================================
// Tests
// ============================================================================

test.describe("Shot Planning Board e2e smoke", () => {
  const PROJECT_ID = "e2e-shot-planning-test";

  test.beforeEach(async ({ page }) => {
    // Phase 1: Navigate first so the app initializes, supermemory is ready
    await gotoCanvas(page, PROJECT_ID);

    // Phase 2: Inject canvas data into localStorage (after page load)
    await seedCanvasData(page, PROJECT_ID);

    // Phase 3: Re-navigate to trigger restore logic (reads from our localStorage)
    await gotoCanvas(page, PROJECT_ID);

    // Phase 4: Dismiss onboarding — it blocks clicks on lower-z-index panels
    await dismissOnboardingIfPresent(page);
  });

  test("generates shot planning board from storyboard", async ({ page }) => {
    // 1. Open Shot Planning panel
    await page.locator("[data-testid='shot-planning-toggle']").click();
    const panel = page.locator("[data-testid='shot-planning-panel']");
    await expect(panel).toBeVisible({ timeout: 10_000 });

    // 2. Empty state should be visible (no board yet)
    await expect(
      panel.locator("text=尚无制片规划"),
    ).toBeVisible({ timeout: 5_000 });

    // 3. Click "从分镜生成"
    await page.locator("[data-testid='shot-planning-generate']").click();

    // 4. Shot list should appear (3 shots)
    await expect(
      panel.locator("[data-planning-item]"),
    ).toHaveCount(3, { timeout: 10_000 });

    // 5. Verify shot content
    const firstItem = panel.locator("[data-planning-item]").first();
    await expect(firstItem).toContainText("镜头 1");
    await expect(firstItem).toContainText("5s");

    const secondItem = panel.locator("[data-planning-item]").nth(1);
    await expect(secondItem).toContainText("镜头 2");

    const thirdItem = panel.locator("[data-planning-item]").nth(2);
    await expect(thirdItem).toContainText("镜头 3");

    // 6. Summary bar should show
    await expect(panel.locator("text=Progress")).toBeVisible();
    await expect(panel).toContainText("0%"); // all todo = 0% progress
  });

  test("updates shot status and persists across refresh", async ({ page }) => {
    // Open and generate
    await page.locator("[data-testid='shot-planning-toggle']").click();
    const panel = page.locator("[data-testid='shot-planning-panel']");
    await expect(panel).toBeVisible({ timeout: 10_000 });
    await page.locator("[data-testid='shot-planning-generate']").click();
    await expect(panel.locator("[data-planning-item]")).toHaveCount(3, {
      timeout: 10_000,
    });

    // 1. Change first shot to "done"
    const firstStatusSelect = panel
      .locator("[data-planning-item]")
      .first()
      .locator("select");
    await firstStatusSelect.selectOption("done");

    // 2. Verify summary updates (progress should be 33%)
    await expect(panel).toContainText("33%");

    // 3. Change second shot to "ready"
    const secondStatusSelect = panel
      .locator("[data-planning-item]")
      .nth(1)
      .locator("select");
    await secondStatusSelect.selectOption("ready");

    // 4. Close panel
    await page.locator("[data-testid='shot-planning-close']").click();
    await expect(panel).not.toBeVisible({ timeout: 5_000 });

    // 5. Refresh page — onboarding reappears, must dismiss again
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator(".react-flow").first()).toBeVisible({
      timeout: 90_000,
    });
    await dismissOnboardingIfPresent(page);

    // 6. Re-open panel
    await page.locator("[data-testid='shot-planning-toggle']").click();
    const panel2 = page.locator("[data-testid='shot-planning-panel']");
    await expect(panel2).toBeVisible({ timeout: 10_000 });

    // 7. Board should be loaded from localStorage (no need to regenerate)
    await expect(panel2.locator("[data-planning-item]")).toHaveCount(3, {
      timeout: 10_000,
    });

    // 8. Statuses should be preserved
    const firstItem = panel2.locator("[data-planning-item]").first();
    await expect(
      firstItem.locator("select"),
    ).toHaveValue("done");

    const secondItem = panel2.locator("[data-planning-item]").nth(1);
    await expect(
      secondItem.locator("select"),
    ).toHaveValue("ready");

    const thirdItem = panel2.locator("[data-planning-item]").nth(2);
    await expect(
      thirdItem.locator("select"),
    ).toHaveValue("todo");

    // 9. Progress should be preserved (1/3 done = 33%)
    await expect(panel2).toContainText("33%");
  });

  test("exports Markdown", async ({ page }) => {
    // Open and generate
    await page.locator("[data-testid='shot-planning-toggle']").click();
    const panel = page.locator("[data-testid='shot-planning-panel']");
    await expect(panel).toBeVisible({ timeout: 10_000 });
    await page.locator("[data-testid='shot-planning-generate']").click();
    await expect(panel.locator("[data-planning-item]")).toHaveCount(3, {
      timeout: 10_000,
    });

    // Click export — triggers download
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 10_000 }),
      page.locator("[data-testid='shot-planning-export']").click(),
    ]);

    // Verify download filename and content
    expect(download.suggestedFilename()).toMatch(/\.md$/);

    // createReadStream() returns a Node.js Readable — convert to string
    const readable = await download.createReadStream();
    const content = await new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      readable.on("data", (chunk: Buffer) => chunks.push(chunk));
      readable.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
      readable.on("error", reject);
    });
    expect(content).toContain("# E2E 制片规划测试 · Shot Plan");
    expect(content).toContain("| Total Shots | 3 |");
    expect(content).toContain("### 1. 镜头 1");
    expect(content).toContain("### 2. 镜头 2");
    expect(content).toContain("### 3. 镜头 3");
    expect(content).toContain("- **Duration**: 5s");
    expect(content).toContain("- **Shot Preset**: `preset-wide`");
  });
});
