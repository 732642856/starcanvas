import { expect, test } from "@playwright/test";

import {
  collectConsoleErrors,
  dismissOnboardingIfPresent,
  gotoCanvas,
  waitForCanvasSave,
} from "./utils";
import { createTestProjectId } from "./utils/project";

type StarCanvasE2EState = {
  getAssets?: () => Array<Record<string, any>>;
  getNodes?: () => Array<Record<string, any>>;
};

const SOURCE_NODE_ID = "e2e-reverse-prompt-asset-source";
const SOURCE_IMAGE_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

function getCanvasStorageKey(projectId: string): string {
  return `startrails_canvas_p:${encodeURIComponent(projectId)}`;
}

function createStoredCanvas() {
  return {
    version: 1,
    savedAt: Date.now(),
    nodes: [
      {
        id: SOURCE_NODE_ID,
        type: "image",
        position: { x: 160, y: 180 },
        width: 340,
        height: 420,
        measured: { width: 340, height: 420 },
        data: {
          title: "Reverse Prompt Source",
          nodeKind: "uploaded-image",
          imageUrl: SOURCE_IMAGE_URL,
          assetUrl: SOURCE_IMAGE_URL,
          resultUrl: SOURCE_IMAGE_URL,
          displayWidth: 340,
          displayHeight: 220,
          runMeta: { runStatus: "succeeded", message: "图片已准备" },
        },
      },
    ],
    edges: [],
  };
}

test("reverse-prompt asset survives reload and can be re-consumed as a prompt node", async ({ page }) => {
  test.setTimeout(240_000);
  const projectId = createTestProjectId("reverse-prompt-asset-roundtrip");
  const errors = collectConsoleErrors(page);

  await page.route("**/api/ai/reverse-prompt", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        prompt: "cinematic close-up portrait with soft key light and shallow depth of field",
        negativePrompt: "text, watermark, blurry",
        qualityScore: 0.93,
        language: "en",
      }),
    });
  });

  await page.addInitScript(
    ({ key, storedCanvas }) => {
      if (!window.sessionStorage.getItem("__reverse_prompt_asset_seeded__")) {
        window.localStorage.clear();
        window.sessionStorage.clear();
        window.localStorage.setItem(key, JSON.stringify(storedCanvas));
        window.sessionStorage.setItem("__reverse_prompt_asset_seeded__", "1");
      }
    },
    { key: getCanvasStorageKey(projectId), storedCanvas: createStoredCanvas() },
  );

  await gotoCanvas(page, projectId);
  await dismissOnboardingIfPresent(page);

  const sourceNode = page.locator(`[data-id='${SOURCE_NODE_ID}']`);
  await expect(sourceNode).toBeVisible({ timeout: 15_000 });
  await sourceNode.getByTestId("image-node-reverse-prompt").click();

  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const e2e = (window as Window & { __starcanvasE2E?: StarCanvasE2EState }).__starcanvasE2E;
          const assets = e2e?.getAssets?.() ?? [];
          return assets.find((asset) => asset.type === "prompt" && String(asset.metadata?.source) === "reverse-prompt");
        }),
      { timeout: 30_000 },
    )
    .toMatchObject({
      type: "prompt",
      name: "反推提示词：Reverse Prompt Source",
    });

  await waitForCanvasSave(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await dismissOnboardingIfPresent(page);

  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const e2e = (window as Window & { __starcanvasE2E?: StarCanvasE2EState }).__starcanvasE2E;
          return (e2e?.getAssets?.() ?? []).find(
            (asset) => asset.type === "prompt" && String(asset.metadata?.source) === "reverse-prompt",
          );
        }),
      { timeout: 30_000 },
    )
    .toMatchObject({
      type: "prompt",
      name: "反推提示词：Reverse Prompt Source",
    });

  await page.getByTitle("素材库").click();
  await expect(page.getByRole("heading", { name: "素材库" })).toBeVisible({ timeout: 15_000 });
  await page.getByText("反推提示词：Reverse Prompt Source").click();

  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const e2e = (window as Window & { __starcanvasE2E?: StarCanvasE2EState }).__starcanvasE2E;
          const nodes = e2e?.getNodes?.() ?? [];
          return nodes.filter(
            (node) =>
              node.type === "content" &&
              node.data?.nodeKind === "prompt" &&
              node.data?.prompt ===
                "cinematic close-up portrait with soft key light and shallow depth of field",
          ).length;
        }),
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0);

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});
