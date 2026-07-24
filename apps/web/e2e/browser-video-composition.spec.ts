import { expect, test, type Page } from "@playwright/test";

import { collectConsoleErrors, gotoCanvas } from "./utils";
import { createTestProjectId } from "./utils/project";

const SOURCE_NODE_ID = "e2e-composition-source";
const SECOND_SOURCE_NODE_ID = "e2e-composition-source-two";
const AUDIO_SOURCE_NODE_ID = "e2e-composition-audio";
const SUBTITLE_SOURCE_NODE_ID = "e2e-composition-subtitle";
const COMPOSITION_NODE_ID = "e2e-composition-output";

type StoredCanvas = {
  version: 2;
  savedAt: number;
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
  viewport: { x: number; y: number; zoom: number };
};

test("real browser WebM -> composition node -> downloads MP4", async ({ page }) => {
  test.setTimeout(360_000);

  const projectId = createTestProjectId("browser-video-composition");
  await page.addInitScript(() => {
    const createObjectUrl = URL.createObjectURL.bind(URL);
    (window as Window & { __compositionArtifacts?: Array<{ size: number; type: string }> }).__compositionArtifacts = [];
    URL.createObjectURL = (object) => {
      const url = createObjectUrl(object);
      if (object instanceof Blob && object.type === "video/mp4") {
        (window as Window & { __compositionArtifacts?: Array<{ size: number; type: string }> })
          .__compositionArtifacts?.push({ size: object.size, type: object.type });
      }
      return url;
    };
  });
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 180_000 });
  const videoDataUrl = await createTinyVideoDataUrl(page);
  await seedCompositionProject(page, projectId, videoDataUrl);

  const errors = collectConsoleErrors(page);
  await gotoCanvas(page, projectId);
  await expect(page.locator(`[data-id='${SOURCE_NODE_ID}']`)).toBeVisible();
  await expect(page.locator(`[data-id='${COMPOSITION_NODE_ID}']`)).toBeVisible();

  await runCurrentNode(page, COMPOSITION_NODE_ID);

  await expect.poll(() => readCompositionArtifact(page), { timeout: 60_000 }).toMatchObject({ type: "video/mp4" });

  const artifact = await readCompositionArtifact(page);
  expect(artifact?.size).toBeGreaterThan(512);
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("composition-download").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("starcanvas-composition.mp4");
  expect(await download.failure()).toBeNull();
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
});

test("two real browser WebMs -> composition node -> downloads MP4", async ({ page }) => {
  test.setTimeout(360_000);
  const projectId = createTestProjectId("browser-video-composition-two-clips");
  await page.addInitScript(() => {
    const createObjectUrl = URL.createObjectURL.bind(URL);
    (window as Window & { __compositionArtifacts?: Array<{ size: number; type: string }> }).__compositionArtifacts = [];
    URL.createObjectURL = (object) => {
      const url = createObjectUrl(object);
      if (object instanceof Blob && object.type === "video/mp4") {
        (window as Window & { __compositionArtifacts?: Array<{ size: number; type: string }> })
          .__compositionArtifacts?.push({ size: object.size, type: object.type });
      }
      return url;
    };
  });
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 180_000 });
  const firstVideoDataUrl = await createTinyVideoDataUrl(page);
  const secondVideoDataUrl = await createTinyVideoDataUrl(page);
  await seedCompositionProject(page, projectId, firstVideoDataUrl);
  await addSecondCompositionSource(page, projectId, secondVideoDataUrl);
  const errors = collectConsoleErrors(page);
  await gotoCanvas(page, projectId);
  await expect(page.locator(`[data-id='${SECOND_SOURCE_NODE_ID}']`)).toBeVisible();
  await runCurrentNode(page, COMPOSITION_NODE_ID);
  await expect.poll(() => readCompositionArtifact(page), { timeout: 60_000 }).toMatchObject({ type: "video/mp4" });
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("composition-download").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("starcanvas-composition.mp4");
  expect(await download.failure()).toBeNull();
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
});

test("real browser WebM plus WAV -> composition node -> downloads MP4", async ({ page }) => {
  test.setTimeout(360_000);
  const projectId = createTestProjectId("browser-video-composition-audio");
  await page.addInitScript(() => {
    const createObjectUrl = URL.createObjectURL.bind(URL);
    (window as Window & { __compositionArtifacts?: Array<{ size: number; type: string }> }).__compositionArtifacts = [];
    URL.createObjectURL = (object) => {
      const url = createObjectUrl(object);
      if (object instanceof Blob && object.type === "video/mp4") {
        (window as Window & { __compositionArtifacts?: Array<{ size: number; type: string }> })
          .__compositionArtifacts?.push({ size: object.size, type: object.type });
      }
      return url;
    };
  });
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 180_000 });
  const videoDataUrl = await createTinyVideoDataUrl(page);
  const audioDataUrl = await createTinyWavDataUrl(page);
  await seedCompositionProject(page, projectId, videoDataUrl);
  await addAudioCompositionSource(page, projectId, audioDataUrl);
  const errors = collectConsoleErrors(page);
  await gotoCanvas(page, projectId);
  await expect(page.locator(`[data-id='${AUDIO_SOURCE_NODE_ID}']`)).toBeVisible();
  await runCurrentNode(page, COMPOSITION_NODE_ID);
  await expect.poll(() => readCompositionArtifact(page), { timeout: 60_000 }).toMatchObject({ type: "video/mp4" });
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("composition-download").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("starcanvas-composition.mp4");
  expect(await download.failure()).toBeNull();
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
});

test("real browser WebM plus subtitle track -> composition node -> downloads MP4", async ({ page }) => {
  test.setTimeout(360_000);
  const projectId = createTestProjectId("browser-video-composition-subtitle");
  await page.addInitScript(() => {
    const createObjectUrl = URL.createObjectURL.bind(URL);
    (window as Window & { __compositionArtifacts?: Array<{ size: number; type: string }> }).__compositionArtifacts = [];
    URL.createObjectURL = (object) => {
      const url = createObjectUrl(object);
      if (object instanceof Blob && object.type === "video/mp4") {
        (window as Window & { __compositionArtifacts?: Array<{ size: number; type: string }> })
          .__compositionArtifacts?.push({ size: object.size, type: object.type });
      }
      return url;
    };
  });
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 180_000 });
  const videoDataUrl = await createTinyVideoDataUrl(page);
  await seedCompositionProject(page, projectId, videoDataUrl);
  await addSubtitleCompositionSource(page, projectId);
  const errors = collectConsoleErrors(page);
  await gotoCanvas(page, projectId);
  await expect(page.locator(`[data-id='${SUBTITLE_SOURCE_NODE_ID}']`)).toBeVisible();
  await runCurrentNode(page, COMPOSITION_NODE_ID);
  await expect.poll(() => readCompositionArtifact(page), { timeout: 60_000 }).toMatchObject({ type: "video/mp4" });
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("composition-download").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("starcanvas-composition.mp4");
  expect(await download.failure()).toBeNull();
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
});

test("real browser WebM plus WAV and subtitle -> composition node -> downloads MP4", async ({ page }) => {
  test.setTimeout(360_000);
  const projectId = createTestProjectId("browser-video-composition-complete");
  await page.addInitScript(() => {
    const createObjectUrl = URL.createObjectURL.bind(URL);
    (window as Window & { __compositionArtifacts?: Array<{ size: number; type: string }> }).__compositionArtifacts = [];
    URL.createObjectURL = (object) => {
      const url = createObjectUrl(object);
      if (object instanceof Blob && object.type === "video/mp4") {
        (window as Window & { __compositionArtifacts?: Array<{ size: number; type: string }> })
          .__compositionArtifacts?.push({ size: object.size, type: object.type });
      }
      return url;
    };
  });
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 180_000 });
  const videoDataUrl = await createTinyVideoDataUrl(page);
  const audioDataUrl = await createTinyWavDataUrl(page);
  await seedCompositionProject(page, projectId, videoDataUrl);
  await addAudioCompositionSource(page, projectId, audioDataUrl);
  await addSubtitleCompositionSource(page, projectId);
  const errors = collectConsoleErrors(page);
  await gotoCanvas(page, projectId);
  await runCurrentNode(page, COMPOSITION_NODE_ID);
  await expect.poll(() => readCompositionArtifact(page), { timeout: 60_000 }).toMatchObject({ type: "video/mp4" });
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("composition-download").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("starcanvas-composition.mp4");
  expect(await download.failure()).toBeNull();
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
});

test("oversized composition failure opens Jianying ZIP preflight", async ({ page }) => {
  const projectId = createTestProjectId("browser-video-composition-oversized");
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 180_000 });
  await seedCompositionProject(page, projectId, "data:video/webm;base64,AA==");
  await page.evaluate(({ projectId, compositionNodeId }) => {
    const storageKey = `startrails_canvas_p:${encodeURIComponent(projectId)}`;
    const canvas = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}") as StoredCanvas;
    const composition = canvas.nodes.find((node) => node.id === compositionNodeId);
    if (!composition) throw new Error("Missing composition node");
    composition.data = {
      ...composition.data,
      runMeta: {
        runStatus: "failed",
        error: "浏览器合成仅支持总计 64 MB 以内素材（当前 65 MB）；请导出剪映交接包继续合成。",
      },
    };
    window.localStorage.setItem(storageKey, JSON.stringify(canvas));
  }, { projectId, compositionNodeId: COMPOSITION_NODE_ID });
  await gotoCanvas(page, projectId);
  await page.getByTestId("composition-export-jianying").click();
  await expect(page.getByText("导出预检")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /导出 ZIP 兼容包|仍导出/ })).toBeVisible();
});

async function createTinyVideoDataUrl(page: Page): Promise<string> {
  return page.evaluate(async () => {
    if (!("MediaRecorder" in window)) throw new Error("MediaRecorder is unavailable");

    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 90;
    if (typeof canvas.captureStream !== "function") throw new Error("canvas.captureStream is unavailable");

    const context = canvas.getContext("2d");
    if (!context) throw new Error("2D canvas is unavailable");
    context.fillStyle = "#1d4ed8";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#f8fafc";
    context.font = "18px sans-serif";
    context.fillText("StarCanvas", 16, 50);

    const stream = canvas.captureStream(8);
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
      ? "video/webm;codecs=vp8"
      : "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: BlobPart[] = [];
    const done = new Promise<Blob>((resolve, reject) => {
      recorder.addEventListener("dataavailable", (event) => chunks.push(event.data));
      recorder.addEventListener("stop", () => resolve(new Blob(chunks, { type: mimeType })));
      recorder.addEventListener("error", () => reject(recorder.error ?? new Error("MediaRecorder failed")));
    });

    recorder.start();
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    recorder.stop();
    const blob = await done;
    stream.getTracks().forEach((track) => track.stop());
    if (blob.size === 0) throw new Error("Generated video blob is empty");

    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error("Failed to read video blob"));
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(blob);
    });
  });
}

async function createTinyWavDataUrl(page: Page): Promise<string> {
  return page.evaluate(() => {
    const sampleRate = 8_000;
    const sampleCount = 2_000;
    const buffer = new ArrayBuffer(44 + sampleCount * 2);
    const view = new DataView(buffer);
    const writeText = (offset: number, value: string) => {
      [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
    };
    writeText(0, "RIFF");
    view.setUint32(4, 36 + sampleCount * 2, true);
    writeText(8, "WAVEfmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeText(36, "data");
    view.setUint32(40, sampleCount * 2, true);
    for (let index = 0; index < sampleCount; index++) {
      view.setInt16(44 + index * 2, Math.sin((index / sampleRate) * Math.PI * 2 * 440) * 2_000, true);
    }
    const bytes = new Uint8Array(buffer);
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return `data:audio/wav;base64,${btoa(binary)}`;
  });
}

async function seedCompositionProject(page: Page, projectId: string, videoDataUrl: string): Promise<void> {
  await page.evaluate(({ projectId, videoDataUrl, canvas }) => {
    window.localStorage.setItem(
      `startrails_canvas_p:${encodeURIComponent(projectId)}`,
      JSON.stringify(canvas),
    );
  }, {
    projectId,
    videoDataUrl,
    canvas: createStoredCanvas(videoDataUrl),
  });
}

async function addSecondCompositionSource(page: Page, projectId: string, videoDataUrl: string): Promise<void> {
  await page.evaluate(({ projectId, videoDataUrl, sourceNodeId, secondSourceNodeId, compositionNodeId }) => {
    const storageKey = `startrails_canvas_p:${encodeURIComponent(projectId)}`;
    const canvas = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}") as StoredCanvas;
    const source = structuredClone(canvas.nodes.find((node) => node.id === sourceNodeId));
    if (!source) throw new Error("Missing composition source node");
    source.id = secondSourceNodeId;
    source.position = { x: 80, y: 350 };
    source.data = {
      ...source.data,
      title: "第二段真实 WebM 视频",
      resultUrl: videoDataUrl,
      imageUrl: videoDataUrl,
      assetUrl: videoDataUrl,
    };
    canvas.nodes.push(source);
    canvas.edges.push({
      id: `${secondSourceNodeId}->${compositionNodeId}`,
      source: secondSourceNodeId,
      target: compositionNodeId,
      type: "smoothstep",
    });
    window.localStorage.setItem(storageKey, JSON.stringify(canvas));
  }, {
    projectId,
    videoDataUrl,
    sourceNodeId: SOURCE_NODE_ID,
    secondSourceNodeId: SECOND_SOURCE_NODE_ID,
    compositionNodeId: COMPOSITION_NODE_ID,
  });
}

async function addAudioCompositionSource(page: Page, projectId: string, audioDataUrl: string): Promise<void> {
  await page.evaluate(({ projectId, audioDataUrl, audioNodeId, compositionNodeId }) => {
    const storageKey = `startrails_canvas_p:${encodeURIComponent(projectId)}`;
    const canvas = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}") as StoredCanvas;
    canvas.nodes.push({
      id: audioNodeId,
      type: "workflow",
      position: { x: 80, y: 350 },
      width: 280,
      height: 160,
      data: {
        title: "真实 WAV 配音",
        nodeKind: "audio",
        resultUrl: audioDataUrl,
        mimeType: "audio/wav",
        runMeta: { runStatus: "succeeded", progress: 100 },
      },
    });
    canvas.edges.push({
      id: `${audioNodeId}->${compositionNodeId}`,
      source: audioNodeId,
      target: compositionNodeId,
      type: "smoothstep",
    });
    window.localStorage.setItem(storageKey, JSON.stringify(canvas));
  }, {
    projectId,
    audioDataUrl,
    audioNodeId: AUDIO_SOURCE_NODE_ID,
    compositionNodeId: COMPOSITION_NODE_ID,
  });
}

async function addSubtitleCompositionSource(page: Page, projectId: string): Promise<void> {
  await page.evaluate(({ projectId, subtitleNodeId, compositionNodeId }) => {
    const storageKey = `startrails_canvas_p:${encodeURIComponent(projectId)}`;
    const canvas = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}") as StoredCanvas;
    canvas.nodes.push({
      id: subtitleNodeId,
      type: "workflow",
      position: { x: 80, y: 350 },
      width: 280,
      height: 160,
      data: {
        title: "真实字幕轨",
        nodeKind: "subtitle",
        segments: [{ startSeconds: 0, endSeconds: 0.2, text: "StarCanvas" }],
        runMeta: { runStatus: "succeeded", progress: 100 },
      },
    });
    canvas.edges.push({
      id: `${subtitleNodeId}->${compositionNodeId}`,
      source: subtitleNodeId,
      target: compositionNodeId,
      type: "smoothstep",
    });
    window.localStorage.setItem(storageKey, JSON.stringify(canvas));
  }, {
    projectId,
    subtitleNodeId: SUBTITLE_SOURCE_NODE_ID,
    compositionNodeId: COMPOSITION_NODE_ID,
  });
}

function createStoredCanvas(videoDataUrl: string): StoredCanvas {
  return {
    version: 2,
    savedAt: Date.now(),
    viewport: { x: 40, y: 80, zoom: 0.8 },
    nodes: [
      {
        id: SOURCE_NODE_ID,
        type: "workflow",
        position: { x: 80, y: 140 },
        width: 280,
        height: 160,
        data: {
          title: "真实 WebM 视频",
          nodeKind: "video-generation",
          status: "ready",
          resultUrl: videoDataUrl,
          imageUrl: videoDataUrl,
          assetUrl: videoDataUrl,
          mimeType: "video/webm",
          runMeta: { runStatus: "succeeded", progress: 100 },
        },
      },
      {
        id: COMPOSITION_NODE_ID,
        type: "workflow",
        position: { x: 450, y: 140 },
        width: 280,
        height: 160,
        data: {
          title: "合成最终视频",
          nodeKind: "composition",
          status: "idle",
        },
      },
    ],
    edges: [
      {
        id: `${SOURCE_NODE_ID}->${COMPOSITION_NODE_ID}`,
        source: SOURCE_NODE_ID,
        target: COMPOSITION_NODE_ID,
      },
    ],
  };
}

async function runCurrentNode(page: Page, nodeId: string): Promise<void> {
  const node = page.locator(`[data-id='${nodeId}']`);
  await expect(node).toBeVisible();
  const inlineRunButton = node.getByRole("button", { name: /运行此节点|重新运行/ });
  if (await inlineRunButton.count()) {
    await inlineRunButton.first().click({ timeout: 5_000 });
    return;
  }

  await node.click({ button: "right", position: { x: 28, y: 28 } });
  await page.getByText("运行当前节点").click({ force: true });
}

async function readCompositionArtifact(page: Page): Promise<{ type?: string; size?: number } | undefined> {
  return page.evaluate(() => {
    const artifacts = (window as Window & {
      __compositionArtifacts?: Array<{ size: number; type: string }>;
    }).__compositionArtifacts;
    return artifacts?.at(-1);
  });
}
