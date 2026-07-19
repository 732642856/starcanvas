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
  const imageNodeId = "e2e-upscale-image";
  const upscaleNodeId = "e2e-upscale-node";
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
        id: upscaleNodeId,
        type: "content",
        position: { x: 520, y: 120 },
        width: 320,
        height: 220,
        measured: { width: 320, height: 220 },
        data: {
          title: "E2E HD 增强",
          nodeKind: "upscale",
          prompt: "放大并保留细节",
          content: "放大并保留细节",
          status: "draft",
          runMeta: { status: "idle", message: "等待运行" },
        },
      },
    ],
    edges: [
      {
        id: "e2e-edge-image-to-upscale",
        source: imageNodeId,
        target: upscaleNodeId,
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

test.describe("upscale provider media bridge", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserStorage(page);
  });

  test("prefers generatedImageUrl over stale blob previews when running upscale", async ({ page }) => {
    test.setTimeout(240_000);
    const projectId = createTestProjectId("upscale-provider-bridge");
    const errors = collectConsoleErrors(page);
    const requests: Array<Record<string, unknown>> = [];

    await seedCanvas(page, projectId);
    await page.route("**/api/ai/upscale", async (route) => {
      requests.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          imageUrl: REAL_IMAGE_DATA_URL,
          message: "done",
        }),
      });
    });

    await gotoCanvas(page, projectId);
    await dismissOnboardingIfPresent(page);
    await runCurrentNode(page, "e2e-upscale-node");

    await expect.poll(() => requests.length, { timeout: 20_000 }).toBe(1);
    expect(requests[0]?.image).toBe(REAL_IMAGE_DATA_URL);

    await expect
      .poll(async () => {
        const nodeData = await readNodeData(page, "e2e-upscale-node");
        return {
          status: nodeData?.status,
          resultUrl: nodeData?.resultUrl,
          summary: nodeData?.summary,
        };
      }, { timeout: 20_000 })
      .toEqual({
        status: "done",
        resultUrl: REAL_IMAGE_DATA_URL,
        summary: "HD 增强完成",
      });

    expect(errors.pageErrors, `Unexpected page errors: ${errors.pageErrors.map((error) => error.message).join("\n")}`).toEqual([]);
  });
});
