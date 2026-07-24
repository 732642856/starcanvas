import { expect, test, type Page } from "@playwright/test"

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

type StarCanvasE2EState = {
  getNodeData?: (nodeId: string) => Record<string, unknown> | undefined
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
          shot: {
            id: "e2e-shot",
            order: 1,
            title: "角色参考动效预演",
            description: "赵珩回身，镜头缓慢推进。",
            visualPrompt: "period palace interior, restrained dramatic movement",
            characterIdentities: [
              {
                id: "e2e-prince",
                name: "赵珩",
                frontViewUrl: "https://e2e.invalid/prince-front.png",
                sideViewUrl: "https://e2e.invalid/prince-side.png",
              },
            ],
          },
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

function createUnreadableReferenceCanvas(): StoredCanvas {
  const canvas = createStoredCanvas()
  const videoNode = canvas.nodes.find((node) => node.id === "e2e-video-generation")
  if (videoNode?.data?.shot?.characterIdentities?.[0]) {
    videoNode.data.shot.characterIdentities[0] = {
      ...videoNode.data.shot.characterIdentities[0],
      frontViewUrl: "blob:http://localhost/unrestored-prince-front",
      sideViewUrl: undefined,
    }
  }
  return canvas
}

test("full pipeline: image-result → video-generation → Vidu SSE → done", async ({ page }) => {
  const videoRequests: Array<any> = []

  // ── Mock AI config ──
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

  let viduConnectionAttempts = 0

  // ── Mock Vidu video generation (SSE) ──
  await page.route("**/api/ai/generate-video-vidu", async (route) => {
    videoRequests.push(route.request().postDataJSON())
    viduConnectionAttempts += 1

    if (viduConnectionAttempts === 1) {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: "event: progress\ndata: " + JSON.stringify({ stage: "queued", percent: 10, message: "任务已创建，连接中断" }) + "\n\n",
      })
      return
    }

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
  await page.route(MOCK_VIDEO_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "video/mp4",
      body: Buffer.from("fake-mp4-binary"),
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
  expect(videoRequests, "Vidu API should reconnect once after an incomplete SSE response").toHaveLength(2)
  const req = videoRequests[0]
  expect(videoRequests[1].requestId).toBe(req.requestId)
  expect(req.mode).toBe("r2v")
  expect(req.referenceImageUrls).toEqual([
    "https://e2e.invalid/prince-front.png",
    "https://e2e.invalid/prince-side.png",
  ])
  expect(req).not.toHaveProperty("imageUrl")
  expect(req.prompt).toBeTruthy()
  expect(req.duration).toBe(5)
  expect(req._providerOverrides?.sessionApiKey).toBe("sk-e2e-dashscope-session")

  // ── 6) Wait for completion and verify node data was updated ──
  // Node data update may take a few seconds
  await page.waitForTimeout(3000)

  await expect(page.getByText("Workflow Run")).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/成功/)).toBeVisible()
  await expect(page.getByText("1/1 完成")).toBeVisible()
  await expect
    .poll(async () => {
      const nodeData = await readNodeData(page, "e2e-video-generation")
      return {
        hasAssetId: Boolean(nodeData?.assetId),
        hasBlobResultUrl:
          typeof nodeData?.resultUrl === "string" && nodeData.resultUrl.startsWith("blob:"),
        persistence: nodeData?.persistence,
      }
    }, {
      timeout: 15_000,
      message: "generated video should be recovered into a local asset-backed blob url",
    })
    .toMatchObject({
      hasAssetId: true,
      hasBlobResultUrl: true,
      persistence: "indexeddb",
    })
})

test("full pipeline blocks an unreadable configured character reference before Vidu", async ({ page }) => {
  const videoRequests: Array<any> = []
  await page.route("**/api/ai/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        baseUrl: "https://dashscope/v1",
        hasApiKey: true,
        defaultModel: "e2e-text-model",
        defaultImageModel: "e2e-image-model",
      }),
    })
  })
  await page.route("**/api/ai/generate-video-vidu", async (route) => {
    videoRequests.push(route.request().postDataJSON())
    await route.abort()
  })
  await page.addInitScript((storedCanvas) => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    window.localStorage.setItem("startrails_canvas", JSON.stringify(storedCanvas))
    window.sessionStorage.setItem("startrails_session_api_key", "sk-e2e-dashscope-session")
  }, createUnreadableReferenceCanvas())

  await page.goto("/canvas", { waitUntil: "domcontentloaded", timeout: 180_000 })
  const videoNode = page.locator("[data-id='e2e-video-generation']")
  await expect(videoNode).toBeVisible({ timeout: 15_000 })
  await videoNode.click({ button: "right" })
  await page.getByText("运行当前节点").click()

  const message = "已绑定的 1 张角色参考图均无法读取。请等待本地素材恢复或重新上传后再生成视频。"
  await expect(page.getByText(message).first()).toBeVisible({ timeout: 15_000 })
  expect(videoRequests).toHaveLength(0)
})

async function readNodeData(
  page: Page,
  nodeId: string,
): Promise<Record<string, unknown> | undefined> {
  return page.evaluate((targetNodeId) => {
    const e2eState = (window as Window & { __starcanvasE2E?: StarCanvasE2EState }).__starcanvasE2E
    return e2eState?.getNodeData?.(targetNodeId)
  }, nodeId)
}
