import { expect, test } from "@playwright/test";
import { gotoCanvas } from "./utils";
import { createTestProjectId } from "./utils/project";
import { clearBrowserStorage } from "./utils/storage";

type StoredCanvas = {
  version: 1;
  savedAt: number;
  nodes: Array<Record<string, any>>;
  edges: Array<Record<string, any>>;
};

type StarCanvasE2EState = {
  getAssets?: () => Array<Record<string, any>>;
  getEdges?: () => Array<Record<string, unknown>>;
  getNodes?: () => Array<Record<string, any>>;
};

const SOURCE_NODE_ID = "e2e-image-node-reverse-source";
const SOURCE_IMAGE_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

function getCanvasStorageKey(projectId: string): string {
  return `startrails_canvas_p:${encodeURIComponent(projectId)}`;
}

function createStoredCanvas(): StoredCanvas {
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
          title: "E2E 图片反推",
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

test("image node quick action creates a downstream prompt node from reverse prompt API", async ({ page }) => {
  const projectId = createTestProjectId("image-node-reverse-prompt");
  await clearBrowserStorage(page);
  const requests: Array<Record<string, unknown>> = [];

  await page.route("**/api/ai/reverse-prompt", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        prompt: "cinematic macro shot of a glowing pearl on black velvet",
        negativePrompt: "text, watermark, blurry",
        qualityScore: 0.88,
        language: "en",
      }),
    });
  });

  await page.addInitScript(
    ({ key, storedCanvas }) => {
      window.localStorage.setItem(key, JSON.stringify(storedCanvas));
    },
    { key: getCanvasStorageKey(projectId), storedCanvas: createStoredCanvas() },
  );

  await gotoCanvas(page, projectId);

  const sourceNode = page.locator(`[data-id='${SOURCE_NODE_ID}']`);
  await expect(sourceNode).toBeVisible({ timeout: 15_000 });
  await sourceNode.getByTestId("image-node-reverse-prompt").click();

  await expect.poll(() => requests.length, { timeout: 15_000 }).toBe(1);
  expect(requests[0].imageUrl).toBe(SOURCE_IMAGE_URL);

  await expect
    .poll(
      async () =>
        page.evaluate((sourceNodeId) => {
          const e2eState = (window as Window & { __starcanvasE2E?: StarCanvasE2EState }).__starcanvasE2E;
          return e2eState
            ?.getNodes?.()
            .find(
              (node) =>
                node.type === "content" &&
                node.data?.nodeKind === "prompt" &&
                node.data?.sourcePromptId === sourceNodeId,
            )?.data?.prompt;
        }, SOURCE_NODE_ID),
      { timeout: 15_000 },
    )
    .toBe("cinematic macro shot of a glowing pearl on black velvet");

  const downstream = await page.evaluate((sourceNodeId) => {
    const e2eState = (window as Window & { __starcanvasE2E?: StarCanvasE2EState }).__starcanvasE2E;
    const nodes = e2eState?.getNodes?.() ?? [];
    const promptNode = nodes.find(
      (node) =>
        node.type === "content" &&
        node.data?.nodeKind === "prompt" &&
        node.data?.sourcePromptId === sourceNodeId,
    );
    const edge = (e2eState?.getEdges?.() ?? []).find(
      (candidate) => candidate.source === sourceNodeId && candidate.target === promptNode?.id,
    );
    return {
      prompt: promptNode?.data?.prompt,
      summary: promptNode?.data?.summary,
      edgeType: edge?.type,
      sourcePrompt: nodes.find((node) => node.id === sourceNodeId)?.data?.prompt,
    };
  }, SOURCE_NODE_ID);

  expect(downstream.prompt).toBe("cinematic macro shot of a glowing pearl on black velvet");
  expect(String(downstream.summary)).toContain("Negative prompt: text, watermark, blurry");
  expect(downstream.edgeType).toBe("creative");
  expect(downstream.sourcePrompt).toBe("cinematic macro shot of a glowing pearl on black velvet");
});
