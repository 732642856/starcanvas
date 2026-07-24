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
  const imageNodeId = "e2e-talking-photo-image";
  const talkingPhotoNodeId = "e2e-talking-photo-node";
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
        id: talkingPhotoNodeId,
        type: "content",
        position: { x: 520, y: 120 },
        width: 320,
        height: 220,
        measured: { width: 320, height: 220 },
        data: {
          title: "E2E 数字人口播",
          nodeKind: "talking-photo",
          content: "欢迎来到星轨画布。",
          prompt: "欢迎来到星轨画布。",
          status: "draft",
          runMeta: { status: "idle", message: "等待运行" },
        },
      },
    ],
    edges: [
      {
        id: "e2e-edge-image-to-talking-photo",
        source: imageNodeId,
        target: talkingPhotoNodeId,
        type: "default",
      },
    ],
  };
}

function createStoredCanvasWithUploadedAudio(): StoredCanvas {
  const imageNodeId = "e2e-talking-photo-image";
  const audioNodeId = "e2e-talking-photo-audio";
  const talkingPhotoNodeId = "e2e-talking-photo-node";
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
        id: audioNodeId,
        type: "audio",
        position: { x: 120, y: 460 },
        width: 320,
        height: 180,
        measured: { width: 320, height: 180 },
        data: {
          title: "E2E 上传音频",
          nodeKind: "tts-audio",
          audioUrl: "https://e2e.invalid/uploaded-voice.wav",
          audioAssetId: "e2e-voice-asset-1",
          status: "done",
          runMeta: { status: "succeeded", message: "音频已准备" },
        },
      },
      {
        id: talkingPhotoNodeId,
        type: "content",
        position: { x: 520, y: 120 },
        width: 320,
        height: 220,
        measured: { width: 320, height: 220 },
        data: {
          title: "E2E 数字人口播",
          nodeKind: "talking-photo",
          status: "draft",
          runMeta: { status: "idle", message: "等待运行" },
        },
      },
    ],
    edges: [
      {
        id: "e2e-edge-image-to-talking-photo",
        source: imageNodeId,
        target: talkingPhotoNodeId,
        type: "default",
      },
      {
        id: "e2e-edge-audio-to-talking-photo",
        source: audioNodeId,
        target: talkingPhotoNodeId,
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

async function seedCanvasWithUploadedAudio(page: Page, projectId: string) {
  const key = `startrails_canvas_p:${encodeURIComponent(projectId)}`;
  await page.addInitScript(
    ({ storageKey, data }) => {
      window.localStorage.setItem(storageKey, JSON.stringify(data));
    },
    { storageKey: key, data: createStoredCanvasWithUploadedAudio() },
  );
}

async function seedLocalAudioAsset(page: Page, assetId: string) {
  await page.evaluate(async (targetAssetId) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("startrail-media-assets", 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("media")) {
          db.createObjectStore("media", { keyPath: "id" });
        }
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("media", "readwrite");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
        tx.objectStore("media").put({
          id: targetAssetId,
          kind: "audio",
          blob: new Blob([new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4])], { type: "audio/wav" }),
          fileName: "e2e-voice.wav",
          mimeType: "audio/wav",
          size: 8,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      };
    });
  }, assetId);
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

async function mutateNodeData(
  page: Page,
  nodeId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await page.evaluate(
    ({ targetNodeId, nodePatch }) => {
      const e2eState = (window as Window & { __starcanvasE2E?: StarCanvasE2EState }).__starcanvasE2E;
      const nodeData = e2eState?.getNodeData?.(targetNodeId);
      if (!nodeData) return;
      Object.assign(nodeData, nodePatch);
    },
    { targetNodeId: nodeId, nodePatch: patch },
  );
}

test.describe("talking photo provider media bridge", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserStorage(page);
  });

  test("prefers generatedImageUrl over stale blob previews when running talking photo", async ({ page }) => {
    test.setTimeout(240_000);
    const projectId = createTestProjectId("talking-photo-provider-bridge");
    const errors = collectConsoleErrors(page);
    const requests: Array<Record<string, unknown>> = [];

    await seedCanvas(page, projectId);
    await page.route("**/api/ai/talking-photo", async (route) => {
      requests.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "completed",
          videoUrl: "https://e2e.invalid/talking-photo.mp4",
          durationMs: 2400,
          message: "done",
        }),
      });
    });

    await gotoCanvas(page, projectId);
    await dismissOnboardingIfPresent(page);
    await runCurrentNode(page, "e2e-talking-photo-node");

    await expect.poll(() => requests.length, { timeout: 20_000 }).toBe(1);
    expect(requests[0]?.image).toBe(REAL_IMAGE_DATA_URL);
    expect(requests[0]?.text).toBe("欢迎来到星轨画布。");

    await expect
      .poll(async () => {
        const nodeData = await readNodeData(page, "e2e-talking-photo-node");
        const generationOutput = nodeData?.generationOutput as Record<string, unknown> | undefined;
        return {
          status: nodeData?.status,
          summary: nodeData?.summary,
          resultUrl: nodeData?.resultUrl,
          videoUrl: generationOutput?.videoUrl,
        };
      }, { timeout: 20_000 })
      .toEqual({
        status: "done",
        summary: "数字人视频生成完成",
        resultUrl: "https://e2e.invalid/talking-photo.mp4",
        videoUrl: "https://e2e.invalid/talking-photo.mp4",
      });

    expect(errors.pageErrors, `Unexpected page errors: ${errors.pageErrors.map((error) => error.message).join("\n")}`).toEqual([]);
  });

  test("bridges uploaded local audio assets into base64 when running talking photo", async ({ page }) => {
    test.setTimeout(240_000);
    const projectId = createTestProjectId("talking-photo-audio-bridge");
    const errors = collectConsoleErrors(page);
    const requests: Array<Record<string, unknown>> = [];

    await seedCanvasWithUploadedAudio(page, projectId);
    await page.route("**/api/ai/talking-photo", async (route) => {
      requests.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "completed",
          videoUrl: "https://e2e.invalid/talking-photo-audio.mp4",
          durationMs: 1800,
          message: "done",
        }),
      });
    });

    await gotoCanvas(page, projectId);
    await dismissOnboardingIfPresent(page);
    await seedLocalAudioAsset(page, "e2e-voice-asset-1");
    await mutateNodeData(page, "e2e-talking-photo-audio", {
      audioUrl: "blob:http://localhost/uploaded-voice",
      audioAssetId: "e2e-voice-asset-1",
    });
    await expect
      .poll(async () => (await readNodeData(page, "e2e-talking-photo-audio"))?.audioUrl, { timeout: 10_000 })
      .toBe("blob:http://localhost/uploaded-voice");
    await runCurrentNode(page, "e2e-talking-photo-node");

    await expect.poll(() => requests.length, { timeout: 20_000 }).toBe(1);
    expect(requests[0]?.image).toBe(REAL_IMAGE_DATA_URL);
    expect(String(requests[0]?.audio || "")).toMatch(/^data:audio\/wav;base64,/);
    expect(requests[0]?.audioSource).toBe("upload");
    expect(requests[0]?.text).toBeUndefined();

    await expect
      .poll(async () => {
        const nodeData = await readNodeData(page, "e2e-talking-photo-node");
        const generationOutput = nodeData?.generationOutput as Record<string, unknown> | undefined;
        return {
          status: nodeData?.status,
          summary: nodeData?.summary,
          resultUrl: nodeData?.resultUrl,
          videoUrl: generationOutput?.videoUrl,
        };
      }, { timeout: 20_000 })
      .toEqual({
        status: "done",
        summary: "数字人视频生成完成",
        resultUrl: "https://e2e.invalid/talking-photo-audio.mp4",
        videoUrl: "https://e2e.invalid/talking-photo-audio.mp4",
      });

    expect(errors.pageErrors, `Unexpected page errors: ${errors.pageErrors.map((error) => error.message).join("\n")}`).toEqual([]);
  });
});
