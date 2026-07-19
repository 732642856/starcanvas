import { expect, test, type Page, type Download } from "@playwright/test"
import JSZip from "jszip"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
  collectConsoleErrors,
  dismissOnboardingIfPresent,
  gotoCanvas,
  waitForCanvasSave,
} from "./utils"
import { createTestProjectId } from "./utils/project"

type StarCanvasE2EBridge = {
  getEdges: () => Array<{ id: string; source: string; target: string }>
  getNodes: () => Array<{ id: string; data: Record<string, unknown> }>
  getNodeData?: (nodeId: string) => Record<string, unknown> | undefined
}

type DownloadedProjectPackage = {
  schema: string
  projectName?: string
  canvas?: {
    nodes?: Array<{ id: string; data?: { title?: string; nodeKind?: string } }>
    edges?: Array<{ id: string; source: string; target: string }>
  }
}

type StoredCanvas = {
  version: number
  savedAt: number
  viewport?: { x: number; y: number; zoom: number }
  nodes: Array<Record<string, any>>
  edges: Array<Record<string, any>>
}

const MOCK_IMAGE_URL = "https://e2e.invalid/project-package-roundtrip-input.png"
const MOCK_VIDEO_URL = "https://e2e.invalid/project-package-roundtrip-video.mp4"

function createRoundtripCanvas(): StoredCanvas {
  const now = new Date().toISOString()
  return {
    version: 2,
    savedAt: Date.now(),
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: "roundtrip-script",
        type: "content",
        position: { x: 140, y: 120 },
        data: {
          title: "Roundtrip 剧本",
          nodeKind: "script",
          content: "这是项目包 roundtrip 导出的剧本节点。",
          createdAt: now,
        },
      },
      {
        id: "roundtrip-video",
        type: "video",
        position: { x: 540, y: 120 },
        data: {
          title: "Roundtrip 视频线索",
          nodeKind: "uploaded-video",
          assetId: "roundtrip-video-asset",
          persistence: "missing",
          loadError: "asset-not-found",
          createdAt: now,
        },
      },
    ],
    edges: [
      {
        id: "roundtrip-edge",
        source: "roundtrip-script",
        target: "roundtrip-video",
        type: "smoothstep",
        animated: true,
      },
    ],
  }
}

function createVideoWorkflowRoundtripCanvas(): StoredCanvas {
  return {
    version: 2,
    savedAt: Date.now(),
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: "roundtrip-image-result",
        type: "content",
        position: { x: 140, y: 120 },
        data: {
          title: "Roundtrip 关键画面",
          nodeKind: "image-result",
          content: "项目包恢复后的关键画面节点。",
          imageUrl: MOCK_IMAGE_URL,
          generatedImageUrl: MOCK_IMAGE_URL,
          resultUrl: MOCK_IMAGE_URL,
          assetId: "roundtrip-image-asset",
          status: "done",
          runMeta: { status: "succeeded", message: "图片已生成" },
        },
      },
      {
        id: "roundtrip-video-generation",
        type: "workflow",
        position: { x: 540, y: 120 },
        data: {
          title: "Roundtrip 动效预演",
          nodeKind: "video-generation",
          content: "镜头缓慢推进，黑影逼近",
          prompt: "镜头缓慢推进，黑影逼近",
          status: "draft",
          runMeta: { status: "idle", message: "等待运行" },
          duration: "5s",
          model: "Vidu",
        },
      },
    ],
    edges: [
      {
        id: "roundtrip-image-to-video",
        source: "roundtrip-image-result",
        target: "roundtrip-video-generation",
        type: "default",
      },
    ],
  }
}


function createImportedVideoWorkflowCanvas(): StoredCanvas {
  return {
    version: 2,
    savedAt: Date.now(),
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: "roundtrip-uploaded-video",
        type: "video",
        position: { x: 120, y: 120 },
        data: {
          title: "Roundtrip 视频素材",
          nodeKind: "uploaded-video",
          assetId: "roundtrip-video-asset",
          assetUrl: "https://e2e.invalid/stale-video.webm",
          resultUrl: "https://e2e.invalid/stale-video.webm",
          mimeType: "video/webm",
          fileName: "roundtrip-video.webm",
          persistence: "indexeddb",
          status: "ready",
        },
      },
      {
        id: "roundtrip-sample-frames",
        type: "workflow",
        position: { x: 520, y: 120 },
        data: {
          title: "Roundtrip 抽帧",
          nodeKind: "video-sample-frames",
          status: "draft",
          runMeta: { status: "idle", message: "等待运行" },
        },
      },
      {
        id: "roundtrip-video-analyze",
        type: "workflow",
        position: { x: 920, y: 120 },
        data: {
          title: "Roundtrip 视频分析",
          nodeKind: "video-analyze",
          status: "draft",
          runMeta: { status: "idle", message: "等待运行" },
        },
      },
    ],
    edges: [
      {
        id: "roundtrip-video-to-sample",
        source: "roundtrip-uploaded-video",
        target: "roundtrip-sample-frames",
        type: "default",
      },
      {
        id: "roundtrip-sample-to-analyze",
        source: "roundtrip-sample-frames",
        target: "roundtrip-video-analyze",
        type: "default",
      },
    ],
  }
}

function createImportedAudioHandoffCanvas(): StoredCanvas {
  return {
    version: 2,
    savedAt: Date.now(),
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: "roundtrip-audio-node",
        type: "audio",
        position: { x: 160, y: 160 },
        data: {
          title: "Roundtrip 恢复音频",
          nodeKind: "tts-audio",
          audioAssetId: "roundtrip-audio-asset",
          audioUrl: "https://e2e.invalid/stale-audio.mp3",
          durationSeconds: 3,
          fileName: "roundtrip-audio.mp3",
          timelineStartTimeSeconds: 0,
          timelineDurationSeconds: 3,
        },
      },
      {
        id: "roundtrip-subtitle-node",
        type: "content",
        position: { x: 560, y: 160 },
        data: {
          title: "Roundtrip 字幕",
          nodeKind: "subtitle-srt",
          srtContent: "1\n00:00:00,000 --> 00:00:03,000\n恢复后的音频可以交接。",
          segments: [{ index: 1, start: 0, end: 3, text: "恢复后的音频可以交接。" }],
        },
      },
    ],
    edges: [],
  }
}

async function seedCanvasForExport(page: Page, projectId: string, storedCanvas: StoredCanvas) {
  await page.evaluate(({ activeProjectId, canvas }) => {
    const e2e = (window as Window & { __starcanvasE2E?: StarCanvasE2EBridge }).__starcanvasE2E
    if (!e2e) throw new Error("__starcanvasE2E bridge is unavailable")

    const storageKey = activeProjectId?.trim()
      ? `startrails_canvas_p:${encodeURIComponent(activeProjectId.trim())}`
      : "startrails_canvas"
    window.localStorage.setItem(storageKey, JSON.stringify(canvas))
  }, { activeProjectId: projectId, canvas: storedCanvas })
}

async function readCanvasSummary(page: Page) {
  return page.evaluate(() => {
    const e2e = (window as Window & { __starcanvasE2E?: StarCanvasE2EBridge }).__starcanvasE2E
    const nodes = e2e?.getNodes() ?? []
    const edges = e2e?.getEdges() ?? []
    return {
      nodeIds: nodes.map((node) => node.id).sort(),
      titles: nodes.map((node) => String(node.data.title || "")).sort(),
      nodeKinds: nodes.map((node) => String(node.data.nodeKind || "")).sort(),
      edgeCount: edges.length,
      hasRoundtripEdge: edges.some(
        (edge) => edge.source === "roundtrip-script" && edge.target === "roundtrip-video",
      ),
    }
  })
}

async function readNodeData(
  page: Page,
  nodeId: string,
): Promise<Record<string, unknown> | undefined> {
  return page.evaluate((targetNodeId) => {
    const e2e = (window as Window & { __starcanvasE2E?: StarCanvasE2EBridge }).__starcanvasE2E
    return e2e?.getNodeData?.(targetNodeId)
  }, nodeId)
}

async function openFileUploadPanel(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          Boolean((window as Window & { __starcanvasE2E?: StarCanvasE2EBridge }).__starcanvasE2E),
        ),
      { timeout: 30_000 },
    )
    .toBe(true)

  const panelTitle = page.getByText("文件上传")
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.getByTestId("toolbar-file-upload").click({ force: true })
    if (await panelTitle.isVisible({ timeout: 5_000 }).catch(() => false)) return
  }
  await expect(panelTitle).toBeVisible({ timeout: 15_000 })
}

async function createTinyVideoDataUrl(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const canvas = document.createElement("canvas")
    canvas.width = 160
    canvas.height = 90
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Canvas 2D context is unavailable")
    if (!("MediaRecorder" in window)) throw new Error("MediaRecorder is unavailable")
    if (typeof canvas.captureStream !== "function") {
      throw new Error("canvas.captureStream is unavailable")
    }

    const stream = canvas.captureStream(8)
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
      ? "video/webm;codecs=vp8"
      : "video/webm"
    const recorder = new MediaRecorder(stream, { mimeType })
    const chunks: Blob[] = []
    const done = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      }
      recorder.onerror = () => reject(recorder.error ?? new Error("MediaRecorder failed"))
      recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }))
    })

    recorder.start()
    for (let index = 0; index < 8; index += 1) {
      const hue = (index * 24) % 360
      ctx.fillStyle = `hsl(${hue}, 74%, 22%)`
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = `hsl(${(hue + 120) % 360}, 82%, 54%)`
      ctx.fillRect((12 + index * 8) % canvas.width, 18, 44, 44)
      ctx.fillStyle = `hsl(${(hue + 240) % 360}, 85%, 62%)`
      ctx.beginPath()
      ctx.arc(128 - ((index * 6) % 90), 58, 16, 0, Math.PI * 2)
      ctx.fill()
      await new Promise((resolve) => setTimeout(resolve, 85))
    }
    recorder.stop()
    const blob = await done
    stream.getTracks().forEach((track) => track.stop())
    if (blob.size === 0) throw new Error("Generated video blob is empty")
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(reader.error ?? new Error("Failed to read video blob"))
      reader.onload = () => resolve(String(reader.result))
      reader.readAsDataURL(blob)
    })
  })
}

async function runNodeByEvent(page: Page, nodeId: string): Promise<void> {
  await page.evaluate((targetNodeId) => {
    window.dispatchEvent(
      new CustomEvent("startrails-run-node", {
        detail: { nodeId: targetNodeId },
      }),
    )
  }, nodeId)
}

async function readGenerationOutput(
  page: Page,
  nodeId: string,
): Promise<Record<string, unknown> | undefined> {
  return page.evaluate((targetNodeId) => {
    const e2e = (window as Window & { __starcanvasE2E?: StarCanvasE2EBridge }).__starcanvasE2E
    return e2e?.getNodeData?.(targetNodeId)?.generationOutput as Record<string, unknown> | undefined
  }, nodeId)
}

async function openJianyingCompatibleExport(page: Page): Promise<void> {
  await page.getByTestId("export-dropdown-toggle").click()
  await page.getByRole("button", { name: "剪映兼容包 (ZIP)" }).click()
  await expect(page.getByText("导出预检")).toBeVisible({ timeout: 15_000 })
}

async function closeFileUploadPanel(page: Page): Promise<void> {
  const panelTitle = page.getByText("文件上传")
  if (!(await panelTitle.isVisible().catch(() => false))) return
  await panelTitle.locator("xpath=ancestor::div[contains(@class,'border-b')][1]").locator("button").last().click()
  await expect(panelTitle).toBeHidden({ timeout: 10_000 })
}

async function downloadProjectPackage(page: Page): Promise<{ download: Download; parsed: DownloadedProjectPackage }> {
  await page.getByTestId("export-dropdown-toggle").click()

  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: "导出项目包" }).click()
  const download = await downloadPromise
  const filePath = await download.path()

  if (!filePath) {
    throw new Error("Playwright download path is unavailable")
  }

  const raw = await readFile(filePath, "utf8")
  const parsed = JSON.parse(raw) as DownloadedProjectPackage
  return { download, parsed }
}

async function materializeDownloadedProjectPackage(download: Download): Promise<string> {
  const dir = path.join(os.tmpdir(), "starcanvas-e2e-roundtrip")
  await mkdir(dir, { recursive: true })
  const targetPath = path.join(dir, download.suggestedFilename())
  await download.saveAs(targetPath)
  return targetPath
}

async function writeProjectPackageFixture(
  projectName: string,
  canvas: StoredCanvas,
  assets: Array<{ id: string; dataUrl: string }> = [],
): Promise<string> {
  const dir = path.join(os.tmpdir(), "starcanvas-e2e-roundtrip")
  await mkdir(dir, { recursive: true })
  const targetPath = path.join(dir, `startrails-project-fixture-${Date.now()}.json`)
  await writeFile(
    targetPath,
    JSON.stringify(
      {
        schema: "startrails-project-package/v1",
        projectName,
        assets,
        canvas,
      },
      null,
      2,
    ),
    "utf8",
  )
  return targetPath
}

test.describe("project package roundtrip", () => {
  test("user can export a project package and import it back into a new canvas", async ({ page }) => {
    test.setTimeout(240_000)

    const exportProjectId = createTestProjectId("project-package-export")
    const importProjectId = createTestProjectId("project-package-roundtrip")
    const errors = collectConsoleErrors(page)

    await gotoCanvas(page, exportProjectId)
    await dismissOnboardingIfPresent(page)
    await seedCanvasForExport(page, exportProjectId, createRoundtripCanvas())
    await page.reload({ waitUntil: "domcontentloaded" })
    await dismissOnboardingIfPresent(page)

    await expect
      .poll(() => readCanvasSummary(page), {
        timeout: 30_000,
        message: "seeded export canvas should be restored before downloading",
      })
      .toMatchObject({
        nodeIds: ["roundtrip-script", "roundtrip-video"],
        titles: ["Roundtrip 剧本", "Roundtrip 视频线索"],
        edgeCount: 1,
        hasRoundtripEdge: true,
      })

    const { download, parsed } = await downloadProjectPackage(page)
    const importableProjectPackagePath = await materializeDownloadedProjectPackage(download)
    expect(download.suggestedFilename()).toMatch(/^startrails-project-\d{4}-\d{2}-\d{2}\.json$/)
    expect(parsed.schema).toBe("startrails-project-package/v1")
    expect(parsed.canvas?.nodes?.map((node) => node.id).sort()).toEqual(["roundtrip-script", "roundtrip-video"])
    expect(parsed.canvas?.edges?.map((edge) => edge.id)).toContain("roundtrip-edge")

    await gotoCanvas(page, importProjectId)
    await dismissOnboardingIfPresent(page)

    await openFileUploadPanel(page)

    const chooserPromise = page.waitForEvent("filechooser")
    await page.getByText("拖拽文件到此处").click()
    const chooser = await chooserPromise
    await chooser.setFiles(importableProjectPackagePath)

    await expect
      .poll(() => readCanvasSummary(page), {
        timeout: 30_000,
        message: "roundtrip import should restore exported nodes and edges",
      })
      .toMatchObject({
        nodeIds: ["roundtrip-script", "roundtrip-video"],
        titles: ["Roundtrip 剧本", "Roundtrip 视频线索"],
        nodeKinds: ["script", "uploaded-video"],
        edgeCount: 1,
        hasRoundtripEdge: true,
      })
    await expect(page.getByText("项目包 · 2 节点 · 1 连线")).toBeVisible({ timeout: 15_000 })

    await waitForCanvasSave(page)
    await gotoCanvas(page, importProjectId)
    await dismissOnboardingIfPresent(page)
    await expect
      .poll(() => readCanvasSummary(page), {
        timeout: 30_000,
        message: "roundtrip imported canvas should persist after reload",
      })
      .toMatchObject({
        nodeIds: ["roundtrip-script", "roundtrip-video"],
        titles: ["Roundtrip 剧本", "Roundtrip 视频线索"],
        edgeCount: 1,
        hasRoundtripEdge: true,
      })

    expect(errors.pageErrors).toEqual([])
    expect(errors.consoleErrors).toEqual([])
  })

  test("imported project package can rerun restored image-result -> video-generation workflow", async ({ page }) => {
    test.setTimeout(240_000)
    const importProjectId = createTestProjectId("project-package-video-rerun")
    const errors = collectConsoleErrors(page)
    const videoRequests: Array<Record<string, unknown>> = []

    await page.route("**/api/ai/config", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          baseUrl: "https://dashscope/v1",
          hasApiKey: true,
          defaultModel: "e2e-text-model",
          defaultImageModel: "e2e-image-model",
          timeoutMs: 120000,
        }),
      })
    })

    await page.route(MOCK_IMAGE_URL, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
          "base64",
        ),
      })
    })

    await page.route("**/api/ai/generate-video-vidu", async (route) => {
      videoRequests.push(route.request().postDataJSON())
      const sseBody = [
        "event: progress\ndata: " + JSON.stringify({ stage: "queued", percent: 5, message: "正在提交视频生成任务到 Vidu..." }) + "\n\n",
        "event: progress\ndata: " + JSON.stringify({ stage: "processing", percent: 50, message: "视频渲染中，请耐心等待..." }) + "\n\n",
        "event: progress\ndata: " + JSON.stringify({ stage: "done", percent: 100, message: "视频生成完成！" }) + "\n\n",
        "event: result\ndata: " + JSON.stringify({ videoUrl: MOCK_VIDEO_URL, taskId: "e2e-roundtrip-vidu-task-001" }) + "\n\n",
      ].join("")

      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: {
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
        body: sseBody,
      })
    })

    await page.route(MOCK_VIDEO_URL, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "video/mp4",
        body: Buffer.from("fake-mp4-binary"),
      })
    })

    const importableProjectPackagePath = await writeProjectPackageFixture(
      "E2E 恢复后继续视频工作流",
      createVideoWorkflowRoundtripCanvas(),
      [{ id: "roundtrip-image-asset", dataUrl: "data:image/png;base64,AAAA" }],
    )

    await gotoCanvas(page, importProjectId)
    await dismissOnboardingIfPresent(page)
    await openFileUploadPanel(page)
    const chooserPromise = page.waitForEvent("filechooser")
    await page.getByText("拖拽文件到此处").click()
    const chooser = await chooserPromise
    await chooser.setFiles(importableProjectPackagePath)
    await expect
      .poll(() => readCanvasSummary(page), {
        timeout: 30_000,
        message: "roundtrip import should restore the video workflow nodes and edge",
      })
      .toMatchObject({
        nodeIds: ["roundtrip-image-result", "roundtrip-video-generation"],
        nodeKinds: ["image-result", "video-generation"],
        edgeCount: 1,
      })
    expect((await readCanvasSummary(page)).titles).toEqual(
      expect.arrayContaining(["Roundtrip 动效预演", "Roundtrip 关键画面"]),
    )
    await expect(page.getByText("项目包 · 2 节点 · 1 连线")).toBeVisible({ timeout: 15_000 })
    await waitForCanvasSave(page)
    await gotoCanvas(page, importProjectId)
    await dismissOnboardingIfPresent(page)
    await page.evaluate(() => {
      window.sessionStorage.setItem("startrails_session_api_key", "sk-e2e-dashscope-session")
    })

    await expect(page.locator("[data-id='roundtrip-video-generation']")).toBeVisible({ timeout: 15_000 })
    await expect
      .poll(async () => {
        const nodeData = await readNodeData(page, "roundtrip-image-result")
        return typeof nodeData?.imageUrl === "string" && nodeData.imageUrl.startsWith("blob:")
      }, {
        timeout: 15_000,
        message: "imported project package should restore packaged image bytes into a local blob before rerunning video",
      })
      .toBe(true)
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent("startrails-run-node", {
          detail: { nodeId: "roundtrip-video-generation" },
        }),
      )
    })
    await expect
      .poll(() => videoRequests.length, {
        timeout: 15_000,
        message: "restored video-generation node should rerun after import",
      })
      .toBe(1)
    expect(videoRequests, "restored video-generation node should rerun after import").toHaveLength(1)
    const req = videoRequests[0] as {
      mode?: string
      imageUrl?: string
      prompt?: string
      duration?: number
      _providerOverrides?: { sessionApiKey?: string }
    }
    expect(req.mode).toBe("i2v")
    expect(req.imageUrl).toBe("data:image/png;base64,AAAA")
    expect(req.imageUrl?.startsWith("blob:")).toBe(false)
    expect(req.prompt).toBeTruthy()
    expect(req.duration).toBe(5)
    expect(req._providerOverrides?.sessionApiKey).toBe("sk-e2e-dashscope-session")

    await expect(page.getByText("Workflow Run")).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText("1/1 完成")).toBeVisible()
    await expect
      .poll(async () => {
        const nodeData = await readNodeData(page, "roundtrip-video-generation")
        return {
          hasAssetId: Boolean(nodeData?.assetId),
          hasBlobResultUrl:
            typeof nodeData?.resultUrl === "string" && nodeData.resultUrl.startsWith("blob:"),
          persistence: nodeData?.persistence,
        }
      }, {
        timeout: 15_000,
        message: "restored video-generation node should recover result into a local asset-backed blob url",
      })
      .toMatchObject({
        hasAssetId: true,
        hasBlobResultUrl: true,
        persistence: "indexeddb",
      })

    expect(errors.pageErrors).toEqual([])
    expect(errors.consoleErrors).toEqual([])
  })

  test("imported project package can rerun restored uploaded-video -> sample -> analyze workflow", async ({ page }) => {
    test.setTimeout(240_000)
    const importProjectId = createTestProjectId("project-package-video-consume")
    const errors = collectConsoleErrors(page)

    await page.route("**/api/ai/config", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          baseUrl: "https://dashscope/v1",
          hasApiKey: true,
          defaultModel: "e2e-text-model",
          defaultImageModel: "e2e-image-model",
          timeoutMs: 120000,
        }),
      })
    })

    await gotoCanvas(page, importProjectId)
    const videoDataUrl = await createTinyVideoDataUrl(page)
    await dismissOnboardingIfPresent(page)

    const importableProjectPackagePath = await writeProjectPackageFixture(
      "E2E 恢复后继续视频抽帧分析",
      createImportedVideoWorkflowCanvas(),
      [{ id: "roundtrip-video-asset", dataUrl: videoDataUrl }],
    )

    await openFileUploadPanel(page)
    const chooserPromise = page.waitForEvent("filechooser")
    await page.getByText("拖拽文件到此处").click()
    const chooser = await chooserPromise
    await chooser.setFiles(importableProjectPackagePath)
    await expect
      .poll(() => readCanvasSummary(page), {
        timeout: 30_000,
        message: "roundtrip import should restore uploaded-video sample/analyze chain",
      })
      .toMatchObject({
        nodeIds: [
          "roundtrip-sample-frames",
          "roundtrip-uploaded-video",
          "roundtrip-video-analyze",
        ],
        nodeKinds: ["uploaded-video", "video-analyze", "video-sample-frames"],
        edgeCount: 2,
      })

    await expect(page.locator("[data-id='roundtrip-sample-frames']")).toBeVisible({ timeout: 15_000 })

    await expect
      .poll(async () => {
        const nodeData = await readNodeData(page, "roundtrip-uploaded-video")
        return {
          assetUrlIsBlob: typeof nodeData?.assetUrl === "string" && nodeData.assetUrl.startsWith("blob:"),
          resultUrlIsBlob: typeof nodeData?.resultUrl === "string" && nodeData.resultUrl.startsWith("blob:"),
          persistence: nodeData?.persistence,
        }
      }, {
        timeout: 30_000,
        message: "imported uploaded-video should hydrate packaged video bytes before rerunning workflow",
      })
      .toMatchObject({
        assetUrlIsBlob: true,
        resultUrlIsBlob: true,
        persistence: "indexeddb",
      })

    await runNodeByEvent(page, "roundtrip-sample-frames")
    await expect
      .poll(() => readGenerationOutput(page, "roundtrip-sample-frames"), {
        timeout: 60_000,
        message: "restored uploaded-video should rerun real frame extraction",
      })
      .toMatchObject({
        mode: "real-browser-extraction",
        sourceVideo: { nodeId: "roundtrip-uploaded-video" },
      })

    await runNodeByEvent(page, "roundtrip-video-analyze")
    await expect
      .poll(async () => {
        const output = await readGenerationOutput(page, "roundtrip-video-analyze")
        const raw = output?.raw as Record<string, unknown> | undefined
        const metrics = raw?.metrics as Record<string, unknown> | undefined
        return {
          keyframes: Array.isArray(output?.keyframes) ? output.keyframes.length : 0,
          frameCount: raw?.frameCount,
          hasMetrics: Boolean(metrics?.averageLuma !== undefined),
        }
      }, {
        timeout: 60_000,
        message: "restored uploaded-video keyframes should rerun local video analysis",
      })
      .toMatchObject({
        keyframes: 1,
        frameCount: 1,
        hasMetrics: true,
      })

    expect(errors.pageErrors).toEqual([])
    expect(errors.consoleErrors).toEqual([])
  })

  test("imported project package can export restored audio into Jianying handoff zip", async ({ page }) => {
    test.setTimeout(120_000)
    const importProjectId = createTestProjectId("project-package-audio-handoff")
    const errors = collectConsoleErrors(page)
    const importableProjectPackagePath = await writeProjectPackageFixture(
      "E2E 恢复后继续音频交接",
      createImportedAudioHandoffCanvas(),
      [{
        id: "roundtrip-audio-asset",
        dataUrl:
          "data:audio/mpeg;base64,SUQzAwAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjMyLjEwMAAAAAAAAAAAAAAA//tQxAADBzQAPgAAGFhYWFhYWFhY",
      }],
    )

    await gotoCanvas(page, importProjectId)
    await dismissOnboardingIfPresent(page)
    await openFileUploadPanel(page)
    const chooserPromise = page.waitForEvent("filechooser")
    await page.getByText("拖拽文件到此处").click()
    const chooser = await chooserPromise
    await chooser.setFiles(importableProjectPackagePath)
    await expect
      .poll(async () => {
        const nodeData = await readNodeData(page, "roundtrip-audio-node")
        return {
          audioUrlIsBlob: typeof nodeData?.audioUrl === "string" && nodeData.audioUrl.startsWith("blob:"),
          audioAssetId: nodeData?.audioAssetId,
        }
      }, {
        timeout: 30_000,
        message: "imported audio should hydrate packaged audio bytes",
      })
      .toMatchObject({
        audioUrlIsBlob: true,
        audioAssetId: "roundtrip-audio-asset",
      })
    await closeFileUploadPanel(page)

    await openJianyingCompatibleExport(page)
    const downloadPromise = page.waitForEvent("download")
    await page.getByRole("button", { name: /导出 ZIP 兼容包|仍导出/ }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe("星轨画布导出_JianYingCompatible.zip")
    const filePath = await download.path()
    if (!filePath) throw new Error("zip download path unavailable")
    const zip = await JSZip.loadAsync(await readFile(filePath))
    const entryNames = Object.keys(zip.files).sort()
    expect(entryNames).toContain("JianYingCompatible/audios/roundtrip-audio.mp3")
    expect(entryNames).toContain("JianYingCompatible/subtitles.srt")
    expect(await zip.file("JianYingCompatible/subtitles.srt")?.async("string")).toContain("恢复后的音频可以交接。")
    const audioBytes = await zip.file("JianYingCompatible/audios/roundtrip-audio.mp3")?.async("uint8array")
    expect(audioBytes?.length).toBeGreaterThan(0)

    expect(errors.pageErrors).toEqual([])
    expect(errors.consoleErrors).toEqual([])
  })
})
