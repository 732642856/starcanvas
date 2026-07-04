import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  collectConsoleErrors,
  dismissOnboardingIfPresent,
  gotoCanvas,
  waitForCanvasSave,
} from "./utils";
import { createTestProjectId } from "./utils/project";

type StoredCanvas = {
  version: 2;
  savedAt: number;
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
  viewport: { x: number; y: number; zoom: number };
};

type StarCanvasE2EState = {
  getNodeData?: (nodeId: string) => Record<string, unknown> | undefined;
};

const SOURCE_VIDEO_NODE_ID = "e2e-real-video-source";
const SAMPLE_FRAMES_NODE_ID = "e2e-sample-frames";
const VIDEO_ANALYZE_NODE_ID = "e2e-video-analyze";

test.describe("real video workflow", () => {
  test.beforeEach(async ({ page }) => {
    await mockAiConfig(page);
  });

  test("user uploads a real video and gets a runnable frame extraction + analysis chain", async ({ page }) => {
    test.setTimeout(300_000);

    const projectId = createTestProjectId("real-video-upload-chain");
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 180_000 });
    const videoDataUrl = await createTinyVideoDataUrl(page);
    const videoPath = await writeVideoDataUrlToTempFile(
      videoDataUrl,
      "starcanvas-upload-chain.webm",
    );

    const errors = collectConsoleErrors(page);
    await gotoCanvas(page, projectId);
    await dismissOnboardingIfPresent(page);

    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByTestId("empty-guide-upload-image").click();
    const chooser = await chooserPromise;
    await chooser.setFiles(videoPath);

    await expect
      .poll(() => readCanvasSummary(page), {
        timeout: 30_000,
        message: "uploading a video should create source, sample, analyze nodes and edges",
      })
      .toMatchObject({
        uploadedVideos: 1,
        sampleFrames: 1,
        videoAnalyze: 1,
        sourceToSampleEdges: 1,
        sampleToAnalyzeEdges: 1,
      });

    const ids = await readVideoWorkflowNodeIds(page);
    expect(ids.sourceId).toBeTruthy();
    expect(ids.sampleId).toBeTruthy();
    expect(ids.analyzeId).toBeTruthy();

    const sourceBeforeReload = await readNodeData(page, ids.sourceId!);
    expect(String(sourceBeforeReload?.assetUrl)).toMatch(/^blob:/);
    expect(String(sourceBeforeReload?.assetId)).toBeTruthy();
    expect(sourceBeforeReload?.persistence).toBe("indexeddb");

    await waitForCanvasSave(page);
    await gotoCanvas(page, projectId);
    await dismissOnboardingIfPresent(page);

    await expect
      .poll(() => readCanvasSummary(page), {
        timeout: 30_000,
        message: "uploaded video workflow should restore after reload",
      })
      .toMatchObject({
        uploadedVideos: 1,
        sampleFrames: 1,
        videoAnalyze: 1,
        sourceToSampleEdges: 1,
        sampleToAnalyzeEdges: 1,
      });

    const sourceAfterReload = await readNodeData(page, ids.sourceId!);
    expect(String(sourceAfterReload?.assetUrl)).toMatch(/^blob:/);
    expect(sourceAfterReload?.assetId).toBe(sourceBeforeReload?.assetId);
    expect(sourceAfterReload?.persistence).toBe("indexeddb");

    await runCurrentNode(page, ids.sampleId!);
    await expect
      .poll(() => readGenerationOutput(page, ids.sampleId!), {
        timeout: 60_000,
        message: "uploaded-video chain should run real frame extraction",
      })
      .toMatchObject({
        mode: "real-browser-extraction",
        sourceVideo: { nodeId: ids.sourceId },
      });

    await runCurrentNode(page, ids.analyzeId!);
    await expect
      .poll(() => readGenerationOutput(page, ids.analyzeId!), {
        timeout: 60_000,
        message: "uploaded-video chain should run local video analysis",
      })
      .toMatchObject({
        raw: {
          mode: "local-frame-analysis",
          sourceVideoIds: [ids.sourceId],
        },
      });

    await expect
      .poll(() => readVideoAnalysisStoryboardSummary(page, ids.analyzeId!), {
        timeout: 30_000,
        message: "video analysis should create traceable storyboard draft nodes",
      })
      .toMatchObject({
        ready: true,
        allFromAnalysis: true,
        allProductionShots: true,
      });

    expect(errors.consoleErrors).toEqual([]);
    expect(errors.pageErrors).toEqual([]);
  });

  test("uploaded video -> real frame extraction -> local video analysis", async ({ page }) => {
    test.setTimeout(180_000);

    const projectId = createTestProjectId("real-video-workflow");

    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 180_000 });
    const videoDataUrl = await createTinyVideoDataUrl(page);
    expect(videoDataUrl).toMatch(/^data:video\/webm/);

    await seedRealVideoWorkflow(page, projectId, videoDataUrl);

    const errors = collectConsoleErrors(page);
    await gotoCanvas(page, projectId);
    await dismissOnboardingIfPresent(page);

    await expect(page.locator(`[data-id='${SOURCE_VIDEO_NODE_ID}']`)).toBeVisible();
    await expect(page.locator(`[data-id='${SAMPLE_FRAMES_NODE_ID}']`)).toBeVisible();
    await expect(page.locator(`[data-id='${VIDEO_ANALYZE_NODE_ID}']`)).toBeVisible();

    await runCurrentNode(page, SAMPLE_FRAMES_NODE_ID);
    await expect
      .poll(() => readGenerationOutput(page, SAMPLE_FRAMES_NODE_ID), {
        timeout: 60_000,
        message: "sample frame node should store real extracted frames",
      })
      .toMatchObject({
        mode: "real-browser-extraction",
        sourceVideo: { nodeId: SOURCE_VIDEO_NODE_ID },
      });

    const frameOutput = await readGenerationOutput(page, SAMPLE_FRAMES_NODE_ID);
    const frames = Array.isArray(frameOutput?.frames) ? frameOutput.frames : [];
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.length).toBeLessThanOrEqual(6);
    expect(String((frames[0] as Record<string, unknown>).imageUrl)).toMatch(/^data:image\/jpeg/);
    expect(String((frames[0] as Record<string, unknown>).selectionReason)).toMatch(/representative|scene-change|uniform-fallback/);
    expect(Number((frames[0] as Record<string, unknown>).sceneIndex)).toBeGreaterThanOrEqual(0);
    expect(Number((frames[0] as Record<string, unknown>).changeScore)).toBeGreaterThanOrEqual(0);

    await runCurrentNode(page, VIDEO_ANALYZE_NODE_ID);
    await expect
      .poll(() => readGenerationOutput(page, VIDEO_ANALYZE_NODE_ID), {
        timeout: 60_000,
        message: "video analyzer should store local frame analysis",
      })
      .toMatchObject({
        raw: {
          mode: "local-frame-analysis",
          sourceVideoIds: [SOURCE_VIDEO_NODE_ID],
        },
      });

    const analysisOutput = await readGenerationOutput(page, VIDEO_ANALYZE_NODE_ID);
    expect(String(analysisOutput?.summary)).toContain("真实视频分析");
    expect(
      Array.isArray(analysisOutput?.keyframes)
        ? analysisOutput.keyframes.length
        : 0,
    ).toBeGreaterThan(0);

    const raw = analysisOutput?.raw as Record<string, unknown> | undefined;
    const metrics = raw?.metrics as Record<string, unknown> | undefined;
    expect(Number(metrics?.frameCount ?? 0)).toBeGreaterThan(0);
    expect(metrics?.dominantColors).toEqual(expect.any(Array));
    expect(Array.isArray(analysisOutput?.scenes)).toBe(true);
    expect(Array.isArray(raw?.transitions)).toBe(true);
    expect(Array.isArray(raw?.scenes)).toBe(true);
    expect((analysisOutput?.scenes as unknown[]).length).toBeGreaterThan(0);

    await expect
      .poll(() => readVideoAnalysisStoryboardSummary(page, VIDEO_ANALYZE_NODE_ID), {
        timeout: 30_000,
        message: "video analysis should create storyboard draft nodes",
      })
      .toMatchObject({
        ready: true,
        allFromAnalysis: true,
        allProductionShots: true,
      });

    expect(errors.consoleErrors).toEqual([]);
    expect(errors.pageErrors).toEqual([]);
  });

  test("imported project package restores uploaded-video assets and can rerun the workflow immediately", async ({
    page,
  }) => {
    test.setTimeout(300_000);

    const exportProjectId = createTestProjectId("real-video-package-export");
    const importProjectId = createTestProjectId("real-video-package-import");

    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 180_000 });
    const videoDataUrl = await createTinyVideoDataUrl(page);
    const videoPath = await writeVideoDataUrlToTempFile(
      videoDataUrl,
      "starcanvas-package-roundtrip.webm",
    );

    const errors = collectConsoleErrors(page);
    await gotoCanvas(page, exportProjectId);
    await dismissOnboardingIfPresent(page);

    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByTestId("empty-guide-upload-image").click();
    const chooser = await chooserPromise;
    await chooser.setFiles(videoPath);

    await expect
      .poll(() => readCanvasSummary(page), {
        timeout: 30_000,
        message: "uploading a video should create a runnable workflow before export",
      })
      .toMatchObject({
        uploadedVideos: 1,
        sampleFrames: 1,
        videoAnalyze: 1,
        sourceToSampleEdges: 1,
        sampleToAnalyzeEdges: 1,
      });

    const exportIds = await readVideoWorkflowNodeIds(page);
    expect(exportIds.sourceId).toBeTruthy();
    expect(exportIds.sampleId).toBeTruthy();
    expect(exportIds.analyzeId).toBeTruthy();

    await waitForCanvasSave(page);
    const projectPackagePath = await downloadProjectPackageToTempFile(page);

    await gotoCanvas(page, importProjectId);
    await dismissOnboardingIfPresent(page);

    await page.getByTestId("toolbar-file-upload").click();
    await expect(page.getByText("文件上传")).toBeVisible({ timeout: 15_000 });

    const importChooserPromise = page.waitForEvent("filechooser");
    await page.getByText("拖拽文件到此处").click();
    const importChooser = await importChooserPromise;
    await importChooser.setFiles(projectPackagePath);

    await expect
      .poll(() => readCanvasSummary(page), {
        timeout: 30_000,
        message: "imported project package should restore uploaded-video workflow nodes and edges",
      })
      .toMatchObject({
        uploadedVideos: 1,
        sampleFrames: 1,
        videoAnalyze: 1,
        sourceToSampleEdges: 1,
        sampleToAnalyzeEdges: 1,
      });

    const importIds = await readVideoWorkflowNodeIds(page);
    expect(importIds.sourceId).toBeTruthy();
    expect(importIds.sampleId).toBeTruthy();
    expect(importIds.analyzeId).toBeTruthy();

    const sourceAfterImport = await readNodeData(page, importIds.sourceId!);
    expect(sourceAfterImport?.assetId).toBeTruthy();
    expect(sourceAfterImport?.persistence).toBe("indexeddb");
    expect(String(sourceAfterImport?.assetUrl)).toMatch(/^blob:/);

    await runCurrentNode(page, importIds.sampleId!);
    await expect
      .poll(() => readGenerationOutput(page, importIds.sampleId!), {
        timeout: 60_000,
        message: "imported uploaded-video chain should rerun real frame extraction without a page reload",
      })
      .toMatchObject({
        mode: "real-browser-extraction",
        sourceVideo: { nodeId: importIds.sourceId },
      });

    await runCurrentNode(page, importIds.analyzeId!);
    await expect
      .poll(() => readGenerationOutput(page, importIds.analyzeId!), {
        timeout: 60_000,
        message: "imported uploaded-video chain should rerun local video analysis without a page reload",
      })
      .toMatchObject({
        raw: {
          mode: "local-frame-analysis",
          sourceVideoIds: [importIds.sourceId],
        },
      });

    expect(errors.consoleErrors).toEqual([]);
    expect(errors.pageErrors).toEqual([]);
  });
});

async function mockAiConfig(page: Page): Promise<void> {
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
}

async function writeVideoDataUrlToTempFile(
  dataUrl: string,
  fileName: string,
): Promise<string> {
  const [, base64] = dataUrl.split(",");
  if (!base64) throw new Error("Video data URL is missing base64 payload");
  const dir = path.join(os.tmpdir(), "starcanvas-e2e");
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, fileName);
  await writeFile(filePath, Buffer.from(base64, "base64"));
  return filePath;
}

async function downloadProjectPackageToTempFile(page: Page): Promise<string> {
  await page.getByTestId("export-dropdown-toggle").click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出项目包" }).click();
  const download = await downloadPromise;
  const dir = path.join(os.tmpdir(), "starcanvas-e2e");
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, download.suggestedFilename());
  await download.saveAs(filePath);
  return filePath;
}

async function createTinyVideoDataUrl(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 90;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context is unavailable");
    if (!("MediaRecorder" in window)) throw new Error("MediaRecorder is unavailable");
    if (typeof canvas.captureStream !== "function") {
      throw new Error("canvas.captureStream is unavailable");
    }

    const stream = canvas.captureStream(8);
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
      ? "video/webm;codecs=vp8"
      : "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];
    const done = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () =>
        reject(recorder.error ?? new Error("MediaRecorder failed"));
      recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
    });

    recorder.start();

    for (let index = 0; index < 16; index++) {
      const hue = (index * 24) % 360;
      const x = 12 + index * 8;

      ctx.fillStyle = `hsl(${hue}, 74%, 22%)`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = `hsl(${(hue + 120) % 360}, 82%, 54%)`;
      ctx.fillRect(x % canvas.width, 18, 44, 44);
      ctx.fillStyle = `hsl(${(hue + 240) % 360}, 85%, 62%)`;
      ctx.beginPath();
      ctx.arc(128 - ((index * 6) % 90), 58, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.78)";
      ctx.fillRect(0, index % 2 === 0 ? 0 : 82, canvas.width, 8);

      await new Promise((resolve) => setTimeout(resolve, 85));
    }

    recorder.stop();
    const blob = await done;
    stream.getTracks().forEach((track) => track.stop());

    if (blob.size === 0) throw new Error("Generated video blob is empty");

    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () =>
        reject(reader.error ?? new Error("Failed to read video blob"));
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(blob);
    });
  });
}

async function seedRealVideoWorkflow(
  page: Page,
  projectId: string,
  videoDataUrl: string,
): Promise<void> {
  await page.evaluate(
    ({ projectId, videoDataUrl, storedCanvas }) => {
      const storageKey = `startrails_canvas_p:${encodeURIComponent(projectId)}`;
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          ...storedCanvas,
          nodes: storedCanvas.nodes.map((node) => {
            if (node.id !== "e2e-real-video-source") return node;
            return {
              ...node,
              data: {
                ...(node.data as Record<string, unknown>),
                assetUrl: videoDataUrl,
                imageUrl: videoDataUrl,
              },
            };
          }),
        }),
      );
    },
    {
      projectId,
      videoDataUrl,
      storedCanvas: createStoredCanvas(videoDataUrl),
    },
  );
}

function createStoredCanvas(videoDataUrl: string): StoredCanvas {
  return {
    version: 2,
    savedAt: Date.now(),
    viewport: { x: 16, y: 80, zoom: 0.82 },
    nodes: [
      {
        id: SOURCE_VIDEO_NODE_ID,
        type: "workflow",
        position: { x: 80, y: 120 },
        width: 280,
        height: 160,
        measured: { width: 280, height: 160 },
        data: {
          title: "E2E 真实视频素材",
          nodeKind: "uploaded-video",
          workflowRole: "Video Asset",
          status: "ready",
          runMeta: { runStatus: "succeeded", progress: 100, message: "测试视频已上传" },
          summary: "浏览器现场生成的 WebM 视频素材。",
          assetUrl: videoDataUrl,
          imageUrl: videoDataUrl,
          mimeType: "video/webm",
          fileName: "e2e-real-video.webm",
          fileSize: Math.round(videoDataUrl.length * 0.75),
          videoDurationMs: 1500,
          videoWidth: 160,
          videoHeight: 90,
          outputs: [{ label: "视频素材", type: "video" }],
          createdAt: Date.now(),
        },
      },
      {
        id: SAMPLE_FRAMES_NODE_ID,
        type: "workflow",
        position: { x: 430, y: 120 },
        width: 280,
        height: 160,
        measured: { width: 280, height: 160 },
        data: {
          title: "E2E 视频抽帧",
          nodeKind: "video-sample-frames",
          workflowRole: "Frame Extractor",
          status: "ready",
          runMeta: { runStatus: "ready", message: "等待真实视频输入" },
          summary: "从上游真实视频中抽取关键帧。",
          inputs: [{ label: "视频输入", type: "video" }],
          outputs: [{ label: "抽帧结果", type: "image" }],
          createdAt: Date.now(),
        },
      },
      {
        id: VIDEO_ANALYZE_NODE_ID,
        type: "workflow",
        position: { x: 780, y: 120 },
        width: 280,
        height: 160,
        measured: { width: 280, height: 160 },
        data: {
          title: "E2E 视频分析",
          nodeKind: "video-analyze",
          workflowRole: "Video Analyzer",
          status: "ready",
          runMeta: { runStatus: "ready", message: "等待关键帧输入" },
          summary: "基于抽帧结果做本地像素分析。",
          inputs: [{ label: "关键帧", type: "image" }],
          outputs: [{ label: "分析结果", type: "text" }],
          createdAt: Date.now(),
        },
      },
    ],
    edges: [
      {
        id: "e2e-edge-video-to-sample",
        source: SOURCE_VIDEO_NODE_ID,
        target: SAMPLE_FRAMES_NODE_ID,
        type: "creative",
      },
      {
        id: "e2e-edge-sample-to-analyze",
        source: SAMPLE_FRAMES_NODE_ID,
        target: VIDEO_ANALYZE_NODE_ID,
        type: "creative",
      },
    ],
  };
}

async function runCurrentNode(page: Page, nodeId: string): Promise<void> {
  const node = page.locator(`[data-id='${nodeId}']`);
  await expect(node).toBeVisible();
  const inlineRunButton = node.getByRole("button", {
    name: /运行此节点|重新运行/,
  });
  if (await inlineRunButton.count()) {
    try {
      await inlineRunButton.first().click({ timeout: 5_000 });
    } catch {
      await inlineRunButton.first().dispatchEvent("click");
    }
    return;
  }

  await node.click({ button: "right", position: { x: 28, y: 28 } });
  await page.getByText("运行当前节点").click({ force: true });
}

async function readGenerationOutput(
  page: Page,
  nodeId: string,
): Promise<Record<string, unknown> | undefined> {
  return page.evaluate((nodeId) => {
    const e2eState = (window as Window & { __starcanvasE2E?: StarCanvasE2EState }).__starcanvasE2E;
    return e2eState?.getNodeData?.(nodeId)?.generationOutput as Record<string, unknown> | undefined;
  }, nodeId);
}

async function readNodeData(
  page: Page,
  nodeId: string,
): Promise<Record<string, unknown> | undefined> {
  return page.evaluate((nodeId) => {
    const e2eState = (window as Window & { __starcanvasE2E?: StarCanvasE2EState }).__starcanvasE2E;
    return e2eState?.getNodeData?.(nodeId);
  }, nodeId);
}

async function readCanvasSummary(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const e2eState = (window as Window & { __starcanvasE2E?: StarCanvasE2EState & {
      getEdges?: () => Array<Record<string, unknown>>;
      getNodes?: () => Array<{ id: string; data?: Record<string, unknown> }>;
    } }).__starcanvasE2E;
    const nodes = e2eState?.getNodes?.() ?? [];
    const edges = e2eState?.getEdges?.() ?? [];
    const uploadedVideoIds = new Set(
      nodes
        .filter((node) => node.data?.nodeKind === "uploaded-video")
        .map((node) => node.id),
    );
    const sampleIds = new Set(
      nodes
        .filter((node) => node.data?.nodeKind === "video-sample-frames")
        .map((node) => node.id),
    );
    const analyzeIds = new Set(
      nodes
        .filter((node) => node.data?.nodeKind === "video-analyze")
        .map((node) => node.id),
    );

    return {
      uploadedVideos: uploadedVideoIds.size,
      sampleFrames: sampleIds.size,
      videoAnalyze: analyzeIds.size,
      sourceToSampleEdges: edges.filter(
        (edge) =>
          typeof edge.source === "string" &&
          typeof edge.target === "string" &&
          uploadedVideoIds.has(edge.source) &&
          sampleIds.has(edge.target),
      ).length,
      sampleToAnalyzeEdges: edges.filter(
        (edge) =>
          typeof edge.source === "string" &&
          typeof edge.target === "string" &&
          sampleIds.has(edge.source) &&
          analyzeIds.has(edge.target),
      ).length,
    };
  });
}

async function readVideoAnalysisStoryboardSummary(
  page: Page,
  analyzeNodeId: string,
): Promise<Record<string, unknown>> {
  return page.evaluate((analyzeNodeId) => {
    const e2eState = (window as Window & { __starcanvasE2E?: StarCanvasE2EState & {
      getEdges?: () => Array<Record<string, unknown>>;
      getNodes?: () => Array<{ id: string; data?: Record<string, unknown> }>;
    } }).__starcanvasE2E;
    const nodes = e2eState?.getNodes?.() ?? [];
    const edges = e2eState?.getEdges?.() ?? [];
    const draftNodes = nodes.filter((node) => {
      const data = node.data ?? {};
      const sourceMeta = data.sourceMeta as Record<string, unknown> | undefined;
      return (
        node.type === "shot" &&
        data.nodeKind === "shot" &&
        data.role === "video-analysis-storyboard-draft" &&
        sourceMeta?.videoAnalysisNodeId === analyzeNodeId
      );
    });
    const draftIds = new Set(draftNodes.map((node) => node.id));
    const linkedEdges = edges.filter((edge) => edge.source === analyzeNodeId && draftIds.has(String(edge.target)));

    return {
      draftCount: draftNodes.length,
      edgeCount: linkedEdges.length,
      ready: draftNodes.length > 0 && linkedEdges.length === draftNodes.length,
      allFromAnalysis: draftNodes.every((node) => {
        const sourceMeta = node.data?.sourceMeta as Record<string, unknown> | undefined;
        return sourceMeta?.videoAnalysisNodeId === analyzeNodeId && typeof sourceMeta.timestampMs === "number";
      }),
      allProductionShots: draftNodes.every((node) => {
        const shot = node.data?.shot as Record<string, unknown> | undefined;
        return Boolean(shot?.description && shot?.visualPrompt && shot?.duration);
      }),
    };
  }, analyzeNodeId);
}

async function readVideoWorkflowNodeIds(page: Page): Promise<{
  sourceId?: string;
  sampleId?: string;
  analyzeId?: string;
}> {
  return page.evaluate(() => {
    const e2eState = (window as Window & { __starcanvasE2E?: StarCanvasE2EState & {
      getEdges?: () => Array<Record<string, unknown>>;
      getNodes?: () => Array<{ id: string; data?: Record<string, unknown> }>;
    } }).__starcanvasE2E;
    const nodes = e2eState?.getNodes?.() ?? [];
    const edges = e2eState?.getEdges?.() ?? [];
    const sourceId = nodes.find((node) => node.data?.nodeKind === "uploaded-video")?.id;
    const sourceToSample = edges.find(
      (edge) => edge.source === sourceId && typeof edge.target === "string",
    );
    const sampleId = String(sourceToSample?.target ?? "");
    const sampleToAnalyze = edges.find(
      (edge) => edge.source === sampleId && typeof edge.target === "string",
    );
    const analyzeId = String(sampleToAnalyze?.target ?? "");
    return {
      sourceId,
      sampleId: sampleId || undefined,
      analyzeId: analyzeId || undefined,
    };
  });
}
