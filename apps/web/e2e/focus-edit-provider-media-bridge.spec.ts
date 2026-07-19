import { expect, test, type Page } from "@playwright/test";
import { clearBrowserStorage } from "./utils/storage";
import { createTestProjectId } from "./utils/project";
import { collectConsoleErrors, dismissOnboardingIfPresent, gotoCanvas } from "./utils";

type StoredCanvas = {
  version: 1;
  savedAt: number;
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
};

type StarCanvasE2EState = {
  getNodeData?: (nodeId: string) => Record<string, unknown> | undefined;
};

const REAL_IMAGE_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

function createStoredCanvas(): StoredCanvas {
  const imageNodeId = "e2e-focus-image";
  const focusEditNodeId = "e2e-focus-edit-node";
  return {
    version: 1,
    savedAt: Date.now(),
    nodes: [
      {
        id: imageNodeId,
        type: "content",
        position: { x: 120, y: 120 },
        width: 320,
        height: 260,
        measured: { width: 320, height: 260 },
        data: {
          title: "E2E 上游图片",
          nodeKind: "image-result",
          imageUrl: "blob:http://localhost/stale-preview",
          resultUrl: "blob:http://localhost/stale-preview",
          generatedImageUrl: REAL_IMAGE_DATA_URL,
          status: "done",
          runMeta: { status: "succeeded", message: "图片已准备" },
        },
      },
      {
        id: focusEditNodeId,
        type: "content",
        position: { x: 520, y: 120 },
        width: 320,
        height: 240,
        measured: { width: 320, height: 240 },
        data: {
          title: "E2E 局部精修",
          nodeKind: "focus-edit",
          prompt: "把外套改成红色",
          content: "把外套改成红色",
          focusEditMaskDataUrl: REAL_IMAGE_DATA_URL,
          status: "draft",
          runMeta: { status: "idle", message: "等待运行" },
        },
      },
    ],
    edges: [
      {
        id: "e2e-edge-image-to-focus-edit",
        source: imageNodeId,
        target: focusEditNodeId,
        type: "default",
      },
    ],
  };
}

async function seedCanvas(page: Page, projectId: string) {
  const key = `startrails_canvas_p:${encodeURIComponent(projectId)}`;
  await page.addInitScript(
    ({ storageKey, data }) => {
      window.localStorage.setItem(storageKey, JSON.stringify(data));
    },
    { storageKey: key, data: createStoredCanvas() },
  );
}

async function runCurrentNode(page: Page, nodeId: string): Promise<void> {
  const node = page.locator(`[data-id='${nodeId}']`);
  await expect(node).toBeVisible({ timeout: 30_000 });
  const inlineRunButton = node.getByRole("button", {
    name: /运行此节点|重新运行/,
  });
  if (await inlineRunButton.count()) {
    await inlineRunButton.first().click({ force: true });
    return;
  }
  await node.click({ button: "right", position: { x: 28, y: 28 } });
  await page.getByText("运行当前节点").click({ force: true });
}

async function readNodeData(page: Page, nodeId: string): Promise<Record<string, unknown> | undefined> {
  return page.evaluate((targetNodeId) => {
    const e2eState = (window as Window & { __starcanvasE2E?: StarCanvasE2EState }).__starcanvasE2E;
    return e2eState?.getNodeData?.(targetNodeId);
  }, nodeId);
}

test.describe("focus edit provider media bridge", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserStorage(page);
  });

  test("prefers generatedImageUrl over stale blob previews when running focus edit", async ({ page }) => {
    test.setTimeout(240_000);
    const projectId = createTestProjectId("focus-edit-provider-bridge");
    const errors = collectConsoleErrors(page);
    const requests: Array<Record<string, unknown>> = [];

    await seedCanvas(page, projectId);
    await page.route("**/api/ai/focus-edit", async (route) => {
      requests.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          imageUrl: REAL_IMAGE_DATA_URL,
          requestId: "focus-edit-e2e",
          attempts: 1,
          model: "gpt-image-2",
        }),
      });
    });

    await gotoCanvas(page, projectId);
    await dismissOnboardingIfPresent(page);
    await runCurrentNode(page, "e2e-focus-edit-node");

    await expect.poll(() => requests.length, { timeout: 20_000 }).toBe(1);
    expect(requests[0]?.imageUrl).toBe(REAL_IMAGE_DATA_URL);
    expect(requests[0]?.maskBase64).toBe(REAL_IMAGE_DATA_URL);

    await expect
      .poll(async () => {
        const nodeData = await readNodeData(page, "e2e-focus-edit-node");
        const generationOutput = nodeData?.generationOutput as Record<string, unknown> | undefined;
        return {
          status: nodeData?.status,
          summary: nodeData?.summary,
          sourceImageUrl: generationOutput?.sourceImageUrl,
          hasAssetId: Boolean(nodeData?.assetId),
          resultIsBlob: String(nodeData?.resultUrl || "").startsWith("blob:"),
        };
      }, { timeout: 20_000 })
      .toEqual({
        status: "done",
        summary: "局部精修完成",
        sourceImageUrl: REAL_IMAGE_DATA_URL,
        hasAssetId: true,
        resultIsBlob: true,
      });

    expect(errors.pageErrors, `Unexpected page errors: ${errors.pageErrors.map((error) => error.message).join("\n")}`).toEqual([]);
  });
});
