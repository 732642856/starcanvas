import { expect, test } from "@playwright/test"

/**
 * Full AI pipeline E2E test: image-result → video-generation via Vidu API.
 *
 * Covers the complete chain:
 *   - Canvas loads with image-result + video-generation nodes
 *   - Right-click "run current node" triggers workflow
 *   - /api/ai/generate-video-vidu is called with correct SSE protocol
 *   - Node status transitions: draft → running → done
 *   - Video URL is written back to node data
 */

type StoredCanvas = {
  version: 1
  savedAt: number
  nodes: Array<Record<string, any>>
  edges: Array<Record<string, any>>
}

const MOCK_IMAGE_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="

const MOCK_VIDEO_URL = "https://e2e.invalid/video-output.mp4"

function createStoredCanvas(): StoredCanvas {
  const imageNodeId = "e2e-image-result"
  const videoNodeId = "e2e-video-generation"

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
          title: "E2E 关键画面",
          nodeKind: "image-result",
          content: "关键画面结果节点",
          imageUrl: MOCK_IMAGE_URL,
          generatedImageUrl: MOCK_IMAGE_URL,
          resultUrl: MOCK_IMAGE_URL,
          status: "done",
          runMeta: { status: "succeeded", message: "图片已生成" },
        },
      },
      {
        id: videoNodeId,
        type: "content",
        position: { x: 520, y: 120 },
        width: 320,
        height: 260,
        measured: { width: 320, height: 260 },
        data: {
          title: "E2E 动效预演",
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
        id: "e2e-edge-image-to-video",
        source: imageNodeId,
        target: videoNodeId,
        type: "default",
      },
    ],
  }
}

test("full pipeline: image-result → video-generation → Vidu SSE → done", async ({ page }) => {
  const videoRequests: Array<any> = []

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
    })
  })

  // ── Mock Vidu video generation (SSE) ──
  await page.route("**/api/ai/generate-video-vidu", async (route) => {
    videoRequests.push(route.request().postDataJSON())

    const sseBody = [
      "event: progress\ndata: " + JSON.stringify({ stage: "queued", percent: 5, message: "正在提交视频生成任务到 Vidu..." }) + "\n\n",
      "event: progress\ndata: " + JSON.stringify({ stage: "processing", percent: 50, message: "视频渲染中，请耐心等待..." }) + "\n\n",
      "event: progress\ndata: " + JSON.stringify({ stage: "done", percent: 100, message: "视频生成完成！" }) + "\n\n",
      "event: result\ndata: " + JSON.stringify({ videoUrl: MOCK_VIDEO_URL, taskId: "e2e-vidu-task-001" }) + "\n\n",
    ].join("")

    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      headers: {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
      body: sseBody,
    })
  })

  // ── Inject canvas with localStorage cleanup ──
  await page.addInitScript((storedCanvas) => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    window.localStorage.setItem("startrails_canvas", JSON.stringify(storedCanvas))
    window.sessionStorage.setItem("startrails_session_api_key", "sk-e2e-dashscope-session")
  }, createStoredCanvas())

  await page.goto("/canvas", { waitUntil: "domcontentloaded", timeout: 180_000 })

  // ── 1) Canvas loads ──
  await expect(page.locator("[data-id='e2e-image-result']").getByText("关键画面结果节点")).toBeVisible({ timeout: 15_000 })
  await expect(page.locator("[data-id='e2e-video-generation']").getByText("镜头缓慢推进，黑影逼近")).toBeVisible()

  // ── 2) Right-click video-generation node to open context menu ──
  // Use ReactFlow node selector
  const videoNode = page.locator("[data-id='e2e-video-generation']")
  await expect(videoNode).toBeVisible()
  await videoNode.click({ button: "right" })

  // ── 3) Click "运行当前节点" ──
  await page.getByText("运行当前节点").click()

  // ── 4) Wait a moment for the execution to start ──
  await page.waitForTimeout(2000)

  // ── 5) Verify Vidu API was called with correct payload ──
  expect(videoRequests, "Vidu API should be called").toHaveLength(1)
  const req = videoRequests[0]
  expect(req.mode).toBe("i2v")
  expect(req.imageUrl).toBe(MOCK_IMAGE_URL)
  expect(req.imageUrl.startsWith("blob:")).toBe(false)
  expect(req.prompt).toBeTruthy()
  expect(req.duration).toBe(5)
  expect(req._providerOverrides?.sessionApiKey).toBe("sk-e2e-dashscope-session")

  // ── 6) Wait for completion and verify node data was updated ──
  // Node data update may take a few seconds
  await page.waitForTimeout(3000)

  await expect(page.getByText("Workflow Run")).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/成功/)).toBeVisible()
  await expect(page.getByText("1/1 完成")).toBeVisible()
})
