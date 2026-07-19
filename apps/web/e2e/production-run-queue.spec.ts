import { expect, test, type Page } from "@playwright/test"

type StoredCanvas = {
  version: 1
  savedAt: number
  nodes: Array<Record<string, any>>
  edges: Array<Record<string, any>>
}

type StarCanvasE2EBridge = {
  getNodeData: (nodeId: string) => Record<string, any> | undefined
  getNodes: () => Array<{ id: string; data: Record<string, any> }>
}

async function hasGeneratedNode(page: Page, criteria: { nodeKind: string; title: string }) {
  return page.evaluate(({ nodeKind, title }) => {
    const e2e = (window as Window & { __starcanvasE2E?: StarCanvasE2EBridge }).__starcanvasE2E
    return e2e?.getNodes().some((node) => node.data.nodeKind === nodeKind && node.data.title === title) ?? false
  }, criteria)
}

async function hasGeneratedImageForShot(page: Page, shotNodeId: string) {
  return page.evaluate((targetShotNodeId) => {
    const e2e = (window as Window & { __starcanvasE2E?: StarCanvasE2EBridge }).__starcanvasE2E
    const imageNodeId = e2e?.getNodeData(targetShotNodeId)?.shot?.generatedImageNodeId
    if (!imageNodeId) return false
    return e2e?.getNodes().some((node) => node.id === imageNodeId && node.data.nodeKind === "ai-generated-image") ?? false
  }, shotNodeId)
}

const MOCK_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="

const MOCK_AUDIO =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA="

const MOCK_VIDEO =
  "data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc282bXA0MQAAAAhmcmVlAAAAGm1kYXQAAAGzABAHAAABthDAAAAAAAA="

const FAILED_IMAGE_SMOKE = {
  image: {
    target: "image",
    status: "failed",
    message: "图片生成超时，请稍后重试。",
    details: ["上游服务响应时间过长，可能是服务繁忙或当前图片处理耗时过高。"],
    updatedAt: Date.now(),
    summaryCategory: "timeout",
    summarySeverity: "error",
    summaryTitle: "请求超时",
  },
}

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function createStoredCanvas(shotCount = 3, includeCharacterReferences = false): StoredCanvas {
  const sourceId = "e2e-pq-source"
  const shotIds = ["e2e-pq-shot-1", "e2e-pq-shot-2", "e2e-pq-shot-3"].slice(0, shotCount)

  return {
    version: 1,
    savedAt: Date.now(),
    nodes: [
      {
        id: sourceId,
        type: "content",
        position: { x: 120, y: 120 },
        width: 760,
        height: 620,
        measured: { width: 760, height: 620 },
        data: {
          title: "E2E 生产队列测试",
          nodeKind: "storyboard",
          content: "三镜头短剧：测试生产运行队列。",
          prompt: "三镜头短剧：测试生产运行队列。",
          storyboardAssistantStage: "storyboard-text",
          autoSizeMode: "fixed-width-height-grows",
          displayWidth: 760,
          displayHeight: 620,
          generatedShotNodeIds: shotIds,
          storyboardProcessVisible: true,
        },
      },
      ...shotIds.map((id, index) => ({
        id,
        type: "shot",
        position: { x: 980, y: 120 + index * 360 },
        width: 340,
        height: 260,
        measured: { width: 340, height: 260 },
        data: {
          title: `PQ镜头 ${index + 1}`,
          nodeKind: "shot",
          sourceStoryboardNodeId: sourceId,
          shot: {
            id,
            order: index + 1,
            title: `PQ镜头 ${index + 1}`,
            shotType: index === 0 ? "wide" : index === 1 ? "close-up" : "medium",
            cameraMovement: "static",
            duration: "3s",
            subtitleTimeline: {
              startTimeSeconds: index === 0 ? 12.28 : index * 3,
              durationSeconds: 3,
              segments: [],
            },
            description: [
              "女主站在窗前，阳光洒落。",
              "女主回头望向门口。",
              "门缓缓打开，黑影显现。",
            ][index],
            visualPrompt: [
              "cinematic wide shot, woman standing by window, warm sunlight",
              "cinematic close-up, woman turning to look at door, suspenseful lighting",
              "cinematic medium shot, door slowly opening, dark shadow emerging",
            ][index],
            dialogue: [
              "今天的阳光真好。",
              "谁在那里？",
              "原来是你。",
            ][index],
            voiceConfig: {
              mode: "auto",
              backend: "mock",
              text: [
                "今天的阳光真好。",
                "谁在那里？",
                "原来是你。",
              ][index],
            },
            sourceStoryboardNodeId: sourceId,
            status: "ready",
            ...(includeCharacterReferences
              ? {
                  characterIdentities: [
                    {
                      id: "e2e-prince",
                      name: "赵珩",
                      frontViewUrl: "https://e2e.invalid/prince-front.png",
                      sideViewUrl: "https://e2e.invalid/prince-side.png",
                    },
                  ],
                }
              : {}),
          },
          prompt: [
            "cinematic wide shot, woman standing by window, warm sunlight",
            "cinematic close-up, woman turning to look at door, suspenseful lighting",
            "cinematic medium shot, door slowly opening, dark shadow emerging",
          ][index],
        },
      })),
    ],
    edges: [],
  }
}

test.describe("生产运行队列面板", () => {
  test("真实模式缺少生图 API Key 时在启动前阻塞队列", async ({ page }) => {
    await page.route("**/api/ai/config", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          baseUrl: "https://e2e.invalid/v1",
          hasApiKey: false,
          defaultModel: "e2e-text-model",
          defaultImageModel: "e2e-image-model",
          videoModel: "vidu",
          timeoutMs: 120000,
          providers: [],
        }),
      })
    })

    await page.addInitScript((storedCanvas) => {
      window.localStorage.clear()
      window.sessionStorage.clear()
      window.localStorage.setItem("startrails_canvas", JSON.stringify(storedCanvas))
      window.localStorage.setItem("startrails_use_mock", "false")
    }, createStoredCanvas())

    await page.goto("/canvas")
    await expect(page.getByText("三镜头短剧：测试生产运行队列。").first()).toBeVisible({ timeout: 15_000 })

    await page.keyboard.press("Escape")
    await page.waitForTimeout(200)
    await page.getByTestId("production-run-queue-toggle").click({ force: true })
    await expect(page.getByTestId("production-run-queue-panel")).toBeVisible({ timeout: 5_000 })

    await expect(page.getByTestId("production-provider-health-summary")).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId("production-task-readiness")).toContainText("完整生产队列")
    await expect(page.getByTestId("production-task-readiness")).toContainText("阻塞")
    await expect(page.getByTestId("production-task-readiness")).toContainText("缺少 API Key")
    await expect(page.getByTestId("production-provider-health-summary")).toContainText("2 阻塞")
    await expect(page.getByTestId("production-provider-health-summary")).toContainText("图片生成")
    await expect(page.getByTestId("production-provider-health-summary")).toContainText("缺少 API Key")
    await expect(page.getByTestId("production-provider-health-summary")).toContainText("DashScope / 百炼专用路由")
    await expect(page.getByTestId("production-provider-fix-hint")).toContainText("缺少 API Key")
    await expect(page.getByTestId("production-run-queue-start")).toBeDisabled()
    await expect(page.getByTestId("production-run-queue-start")).toContainText("缺少 API Key")

    await page.getByTestId("production-provider-open-settings").click()
    await expect(page.getByTestId("provider-health-summary")).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId("provider-health-summary")).toContainText("运行前健康摘要")
  })

  test("真实模式显式路由 + 会话 Key 可解除生图阻塞并将视频降级为注意", async ({ page }) => {
    await page.route("**/api/ai/config", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          baseUrl: "https://e2e.invalid/v1",
          hasApiKey: false,
          defaultModel: "e2e-text-model",
          defaultImageModel: "e2e-image-model",
          videoModel: "vidu",
          timeoutMs: 120000,
          providers: [],
        }),
      })
    })

    await page.addInitScript((storedCanvas) => {
      window.localStorage.clear()
      window.sessionStorage.clear()
      window.localStorage.setItem("startrails_canvas", JSON.stringify(storedCanvas))
      window.localStorage.setItem("startrails_use_mock", "false")
      window.localStorage.setItem("startrails_api_base_url", "https://e2e.invalid/v1")
      window.sessionStorage.setItem("startrails_session_api_key", "sk-e2e-dashscope-session")
    }, createStoredCanvas())

    await page.goto("/canvas")
    await expect(page.getByText("三镜头短剧：测试生产运行队列。").first()).toBeVisible({ timeout: 15_000 })

    await page.keyboard.press("Escape")
    await page.waitForTimeout(200)
    await page.getByTestId("production-run-queue-toggle").click({ force: true })
    await expect(page.getByTestId("production-run-queue-panel")).toBeVisible({ timeout: 5_000 })

    const providerSummary = page.getByTestId("production-provider-health-summary")
    await expect(providerSummary).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId("production-task-readiness")).toContainText("完整生产队列")
    await expect(page.getByTestId("production-task-readiness")).toContainText("注意")
    await expect(providerSummary).toContainText("0 阻塞")
    await expect(providerSummary).toContainText("图片生成")
    await expect(providerSummary).toContainText("可用")
    await expect(providerSummary).toContainText("视频生成")
    await expect(providerSummary).toContainText("注意")
    await expect(providerSummary).toContainText("如果它是 DashScope Key")
    await expect(page.getByTestId("production-run-queue-start")).toBeEnabled()
  })

  test("最近一次失败的真实生图 smoke 会持续阻塞生产队列直到修复", async ({ page }) => {
    await page.route("**/api/ai/config", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          baseUrl: "https://e2e.invalid/v1",
          hasApiKey: true,
          defaultModel: "e2e-text-model",
          defaultImageModel: "e2e-image-model",
          videoModel: "vidu",
          timeoutMs: 120000,
          providers: [],
        }),
      })
    })

    await page.addInitScript(
      (data) => {
        window.localStorage.clear()
        window.sessionStorage.clear()
        window.localStorage.setItem("startrails_canvas", JSON.stringify(data.storedCanvas))
        window.localStorage.setItem("startrails_use_mock", "false")
        window.localStorage.setItem("startrails_provider_real_smoke_results", JSON.stringify(data.storedSmoke))
        window.sessionStorage.setItem("startrails_session_api_key", "sk-e2e-dashscope-session")
      },
      {
        storedCanvas: createStoredCanvas(1),
        storedSmoke: FAILED_IMAGE_SMOKE,
      },
    )

    await page.goto("/canvas")
    await expect(page.getByText("三镜头短剧：测试生产运行队列。").first()).toBeVisible({ timeout: 15_000 })
    await page.keyboard.press("Escape")
    await page.waitForTimeout(200)
    await page.getByTestId("production-run-queue-toggle").click({ force: true })
    await expect(page.getByTestId("production-run-queue-panel")).toBeVisible({ timeout: 5_000 })

    await expect(page.getByTestId("production-task-readiness")).toContainText("完整生产队列")
    await expect(page.getByTestId("production-task-readiness")).toContainText("阻塞")
    await expect(page.getByTestId("production-task-readiness")).toContainText("请求超时")
    await expect(page.getByTestId("production-provider-fix-hint")).toContainText("最近一次真实 smoke")
    await expect(page.getByTestId("production-run-queue-start")).toBeDisabled()
    await expect(page.getByTestId("production-run-queue-start")).toContainText("最近一次真实 smoke")

    await page.getByTestId("production-provider-open-settings").click()
    await expect(page.getByTestId("provider-health-summary")).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId("task-readiness-item-image-production")).toContainText("请求超时")
    await expect(page.getByTestId("task-readiness-item-production-run")).toContainText("请求超时")
  })

  test("从生产队列打开设置并保存后，会清掉陈旧 smoke 阻塞并恢复开始按钮", async ({ page }) => {
    await page.route("**/api/ai/config", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          baseUrl: "https://e2e.invalid/v1",
          hasApiKey: true,
          defaultModel: "e2e-text-model",
          defaultImageModel: "e2e-image-model",
          videoModel: "vidu",
          timeoutMs: 120000,
          providers: [],
        }),
      })
    })

    await page.addInitScript(
      (data) => {
        window.localStorage.clear()
        window.sessionStorage.clear()
        window.localStorage.setItem("startrails_canvas", JSON.stringify(data.storedCanvas))
        window.localStorage.setItem("startrails_use_mock", "false")
        window.localStorage.setItem("startrails_provider_real_smoke_results", JSON.stringify(data.storedSmoke))
        window.sessionStorage.setItem("startrails_session_api_key", "sk-e2e-dashscope-session")
      },
      {
        storedCanvas: createStoredCanvas(),
        storedSmoke: FAILED_IMAGE_SMOKE,
      },
    )

    await page.goto("/canvas")
    await expect(page.getByText("三镜头短剧：测试生产运行队列。").first()).toBeVisible({ timeout: 15_000 })
    await page.keyboard.press("Escape")
    await page.waitForTimeout(200)
    await page.getByTestId("production-run-queue-toggle").click({ force: true })
    await expect(page.getByTestId("production-run-queue-panel")).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId("production-run-queue-start")).toBeDisabled()

    await page.getByTestId("production-provider-open-settings").click()
    await expect(page.getByTestId("provider-settings-save")).toBeVisible({ timeout: 5_000 })
    await page.getByTestId("provider-settings-save").click()

    await expect(page.getByTestId("production-provider-health-summary")).toContainText("0 阻塞")
    await expect(page.getByTestId("production-run-queue-start")).toBeEnabled()
    await expect(page.getByTestId("production-run-queue-start")).toContainText("一键开始生产")
  })

  test("面板开关/任务列表/开始执行/进度更新", async ({ page }) => {
    const imageRequests: Array<any> = []
    const videoRequests: Array<any> = []
    let shouldDelayFirstImage = false

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
          videoModel: "vidu",
          timeoutMs: 120000,
          providers: [],
        }),
      })
    })

    // ── Mock image generation ──
    await page.route("**/api/ai/generate-image", async (route) => {
      imageRequests.push(route.request().postDataJSON())
      if (shouldDelayFirstImage) {
        shouldDelayFirstImage = false
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ imageUrl: MOCK_IMAGE, requestId: "e2e-pq-image" }),
      })
    })

    // ── Mock video generation, should stay unused in mock mode but guards accidental real calls ──
    await page.route("**/api/ai/generate-video-vidu", async (route) => {
      videoRequests.push(route.request().postDataJSON())
      const sseBody = [
        "event: progress\ndata: " + JSON.stringify({ stage: "queued", percent: 10, message: "queued" }) + "\n\n",
        "event: result\ndata: " + JSON.stringify({ videoUrl: MOCK_VIDEO, taskId: "e2e-pq-video" }) + "\n\n",
      ].join("")
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sseBody,
      })
    })

    // ── Mock TTS HF Space ──
    await page.route("**/k2-fsa-omnivoice.hf.space/call/generate", async (route) => {
      // First call: POST /call/generate returns event_id
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ event_id: "e2e-tts-event" }),
        })
      }
    })

    // ── Mock TTS result polling (matches /call/generate/<event_id>) ──
    await page.route("**/k2-fsa-omnivoice.hf.space/call/generate/e2e-tts-event", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          stage: "complete",
          output: {
            data: [{ url: "/file=/tmp/e2e-tts.wav", name: "e2e-tts.wav" }],
          },
        }),
      })
    })

    // ── Mock TTS audio file fetch ──
    await page.route("**/k2-fsa-omnivoice.hf.space/file=/tmp/e2e-tts.wav", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "audio/wav",
        body: Buffer.from(
          "UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=",
          "base64",
        ),
      })
    })

    // ── Inject localStorage ──
    await page.addInitScript(
      (data) => {
        window.localStorage.clear()
        window.sessionStorage.clear()
        window.localStorage.setItem("startrails_canvas", JSON.stringify(data.storedCanvas))
        window.localStorage.setItem("startrails_use_mock", "false")
        window.sessionStorage.setItem("startrails_session_api_key", "sk-e2e-dashscope-session")
      },
      {
        storedCanvas: createStoredCanvas(1, true),
      },
    )

    // ── Navigate ──
    await page.goto("/canvas")

    // 等待画布加载（使用 content 文本定位，节点 title 不显示在 UI 上）
    await expect(page.getByText("三镜头短剧：测试生产运行队列。").first()).toBeVisible({ timeout: 15_000 })

    // 关闭可能遮挡的其他面板
    await page.keyboard.press("Escape")
    await page.waitForTimeout(200)

    // ── 1) 面板未打开时不可见 ──
    await expect(page.getByTestId("production-run-queue-panel")).toHaveCount(0)

    // ── 2) 点击切换按钮打开面板（force 以绕过可能的面板遮挡）──
    await page.getByTestId("production-run-queue-toggle").click({ force: true })
    await expect(page.getByTestId("production-run-queue-panel")).toBeVisible({ timeout: 5_000 })

    // ── 3) 状态和进度可见 ──
    await expect(page.getByTestId("production-run-queue-status")).toBeVisible()
    await expect(page.getByTestId("production-run-queue-progress")).toBeVisible()
    await expect(page.getByTestId("video-provider-dry-run-summary")).toContainText("Vidu", { timeout: 5_000 })
    await expect(page.getByTestId("video-provider-dry-run-summary")).toContainText("0 阻塞")

    // ── 4) 任务列表有正确数量的任务 ──
    // 1 个 shot：image + video + voice + subtitle + character-reference handoff review
    const tasks = page.getByTestId("production-run-queue-task")
    await expect(tasks.first()).toBeVisible({ timeout: 5_000 })

    // ── 5) 开始按钮可见 ──
    const startBtn = page.getByTestId("production-run-queue-start")
    await expect(startBtn).toBeVisible()

    // ── 6) 点击开始执行 ──
    await startBtn.click()

    // 按钮应变灰/消失或变为执行中状态
    await expect(page.getByText("生产任务执行中")).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId("production-run-queue-status")).toContainText("运行中", { timeout: 10_000 })

    // ── 7) 验证生产执行链路至少触发了首个图像任务并最终完成 ──
    await expect.poll(() => imageRequests.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1)
    await expect(page.getByTestId("production-run-queue-progress")).toContainText("5/5 完成", { timeout: 60_000 })
    await expect(page.getByTestId("production-run-queue-status")).toContainText("已完成", { timeout: 30_000 })
    await expect.poll(
      () => hasGeneratedNode(page, { nodeKind: "video-result", title: "PQ镜头 1 视频" }),
      { timeout: 10_000 },
    ).toBeTruthy()
    expect(videoRequests).toEqual([
      expect.objectContaining({
        mode: "r2v",
        referenceImageUrls: [
          "https://e2e.invalid/prince-front.png",
          "https://e2e.invalid/prince-side.png",
        ],
      }),
    ])
    expect(videoRequests[0]).not.toHaveProperty("imageUrl")
    await expect.poll(
      () => hasGeneratedNode(page, { nodeKind: "tts-audio", title: "PQ镜头 1 配音" }),
      { timeout: 10_000 },
    ).toBeTruthy()
    await expect.poll(
      () => page.evaluate(() => {
        const e2e = (window as Window & { __starcanvasE2E?: StarCanvasE2EBridge }).__starcanvasE2E
        return e2e?.getNodes().find((node) => node.data.title === "PQ镜头 1 配音")?.data.startOffsetSeconds
      }),
      { timeout: 10_000 },
    ).toBe(12.28)
    await expect.poll(
      () => hasGeneratedNode(page, { nodeKind: "subtitle-srt", title: "PQ镜头 1 字幕" }),
      { timeout: 10_000 },
    ).toBeTruthy()
    await expect(page.locator(".react-flow__node").filter({ hasText: "SRT 内容" }).first()).toBeVisible({ timeout: 10_000 })
    for (const req of imageRequests) {
      expect(req).toHaveProperty("prompt")
      expect(req).toHaveProperty("requestId")
      expect(typeof req.prompt).toBe("string")
      expect(req.prompt.length).toBeGreaterThan(0)
      expect(typeof req.requestId).toBe("string")
      expect(req.requestId.length).toBeGreaterThan(0)
    }

    // ── 9) 再次点击开关关闭面板 ──
    await page.getByTestId("production-run-queue-toggle").click()
    await expect(page.getByTestId("production-run-queue-panel")).toHaveCount(0)
  })

  test("失败任务可重试，并在重试期间锁定队列控制", async ({ page }) => {
    const imageRequests: Array<any> = []
    const retryImageRequest = createDeferred()
    const retryImageResponseGate = createDeferred()
    let firstShotImageAttempts = 0

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

    await page.route("**/api/ai/generate-image", async (route) => {
      const body = route.request().postDataJSON()
      imageRequests.push(body)
      const prompt = typeof body?.prompt === "string" ? body.prompt : ""
      if (prompt.includes("woman standing by window")) {
        firstShotImageAttempts += 1
        if (firstShotImageAttempts <= 3) {
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: "e2e image failed once" }),
          })
          return
        }
        if (firstShotImageAttempts === 4) {
          retryImageRequest.resolve()
          await retryImageResponseGate.promise
        }
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ imageUrl: MOCK_IMAGE, requestId: "e2e-pq-image" }),
      })
    })

    await page.route("**/api/ai/generate-video-vidu", async (route) => {
      const sseBody = [
        "event: progress\ndata: " + JSON.stringify({ stage: "queued", percent: 10, message: "queued" }) + "\n\n",
        "event: result\ndata: " + JSON.stringify({ videoUrl: MOCK_VIDEO, taskId: "e2e-pq-video" }) + "\n\n",
      ].join("")
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sseBody,
      })
    })

    await page.route("**/k2-fsa-omnivoice.hf.space/call/generate", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ event_id: "e2e-tts-event" }),
        })
      }
    })

    await page.route("**/k2-fsa-omnivoice.hf.space/call/generate/e2e-tts-event", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          stage: "complete",
          output: {
            data: [{ url: "/file=/tmp/e2e-tts.wav", name: "e2e-tts.wav" }],
          },
        }),
      })
    })

    await page.route("**/k2-fsa-omnivoice.hf.space/file=/tmp/e2e-tts.wav", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "audio/wav",
        body: Buffer.from(
          "UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=",
          "base64",
        ),
      })
    })

    await page.addInitScript((storedCanvas) => {
      window.localStorage.clear()
      window.localStorage.setItem("startrails_canvas", JSON.stringify(storedCanvas))
      window.localStorage.setItem("startrails_use_mock", "false")
      window.localStorage.setItem("startrails_api_base_url", "https://dashscope/v1")
      window.localStorage.setItem("startrails_provider_baseUrl", "https://dashscope/v1")
      window.localStorage.setItem("startrails_provider_defaultModel", "e2e-text-model")
      window.localStorage.setItem("startrails_provider_imageModel", "e2e-image-model")
      window.localStorage.setItem("startrails_provider_videoModel", "vidu")
      window.sessionStorage.setItem("startrails_session_api_key", "sk-e2e-production-retry")
    }, createStoredCanvas())

    await page.goto("/canvas")
    await expect(page.getByText("三镜头短剧：测试生产运行队列。").first()).toBeVisible({ timeout: 15_000 })

    await page.keyboard.press("Escape")
    await page.waitForTimeout(200)
    await page.getByTestId("production-run-queue-toggle").click({ force: true })
    await expect(page.getByTestId("production-run-queue-panel")).toBeVisible({ timeout: 5_000 })

    await page.getByTestId("production-run-queue-start").click()
    await expect(page.getByTestId("production-run-queue-status")).toContainText("部分失败", { timeout: 45_000 })
    await expect(page.getByTestId("production-run-queue-progress")).toContainText("1 失败", { timeout: 10_000 })

    const firstImageTask = page
      .getByTestId("production-run-queue-task")
      .filter({ hasText: "PQ镜头 1 · 生成分镜图" })
    await expect(firstImageTask).toContainText("失败")

    await expect(page.getByTestId("production-run-queue-start")).toBeVisible({ timeout: 45_000 })
    await expect(page.getByText("生产任务执行中")).toHaveCount(0)

    const retryImageButton = firstImageTask.getByTestId("production-run-queue-retry")
    await expect(retryImageButton).toBeVisible({ timeout: 20_000 })
    await retryImageButton.scrollIntoViewIfNeeded()
    await retryImageButton.click()
    await retryImageRequest.promise
    await expect(page.getByText("生产任务执行中")).toBeVisible({ timeout: 3_000 })
    await expect(page.getByTestId("production-run-queue-start")).toHaveCount(0)

    retryImageResponseGate.resolve()
    await expect(firstImageTask).toContainText("完成", { timeout: 10_000 })
    await expect.poll(
      () => hasGeneratedImageForShot(page, "e2e-pq-shot-1"),
      { timeout: 10_000 },
    ).toBeTruthy()

    await expect(page.getByTestId("production-run-queue-start")).toBeVisible({ timeout: 10_000 })

    await page.getByTestId("production-run-queue-start").click()
    await expect(page.getByTestId("production-run-queue-progress")).toContainText("12/12 完成", { timeout: 45_000 })
    await expect(page.getByTestId("production-run-queue-status")).toContainText("已完成", { timeout: 10_000 })
    expect(firstShotImageAttempts).toBe(4)
    expect(imageRequests.length).toBeGreaterThanOrEqual(6)
  })

  test("blocked action 展示", async ({ page }) => {
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

    // ── Mock image gen ──
    await page.route("**/api/ai/generate-image", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ imageUrl: MOCK_IMAGE }),
      })
    })

    // ── Canvas with ONE shot that has NO visualPrompt (triggers blocked action) ──
    const canvas: StoredCanvas = {
      version: 1,
      savedAt: Date.now(),
      nodes: [
        {
          id: "e2e-ba-source",
          type: "content",
          position: { x: 120, y: 120 },
          width: 760,
          height: 620,
          measured: { width: 760, height: 620 },
          data: {
            title: "E2E Blocked 测试",
            nodeKind: "storyboard",
            content: "测试缺少 visual prompt 的阻塞操作。",
            prompt: "测试缺少 visual prompt 的阻塞操作。",
            autoSizeMode: "fixed-width-height-grows",
            displayWidth: 760,
            displayHeight: 620,
            generatedShotNodeIds: ["e2e-ba-shot"],
            storyboardProcessVisible: true,
          },
        },
        {
          id: "e2e-ba-shot",
          type: "shot",
          position: { x: 980, y: 120 },
          width: 340,
          height: 260,
          measured: { width: 340, height: 260 },
          data: {
            title: "Blocked 镜头",
            nodeKind: "shot",
            sourceStoryboardNodeId: "e2e-ba-source",
            shot: {
              id: "e2e-ba-shot",
              order: 1,
              title: "Blocked 镜头",
              shotType: "wide",
              cameraMovement: "static",
              duration: "3s",
              description: "没有 visual prompt 的镜头。",
              // No visualPrompt → triggers add-visual-prompt blocked action
              dialogue: "你好吗？",
              sourceStoryboardNodeId: "e2e-ba-source",
              status: "ready",
            },
            // No prompt either → blocked
          },
        },
      ],
      edges: [],
    }

    await page.addInitScript((data) => {
      window.localStorage.clear()
      window.localStorage.setItem("startrails_canvas", JSON.stringify(data))
      window.localStorage.setItem("startrails_use_mock", "true")
    }, canvas)

    await page.goto("/canvas")
    await expect(page.getByText("测试缺少 visual prompt 的阻塞操作。").first()).toBeVisible({ timeout: 15_000 })

    // 关闭可能遮挡的其他面板
    await page.keyboard.press("Escape")
    await page.waitForTimeout(200)

    // Open panel（force 以绕过可能的面板遮挡）
    await page.getByTestId("production-run-queue-toggle").click({ force: true })
    await expect(page.getByTestId("production-run-queue-panel")).toBeVisible({ timeout: 5_000 })

    // Blocked actions should be visible
    const blocked = page.getByTestId("production-run-queue-blocked-action")
    await expect(blocked.first()).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId("video-provider-dry-run-summary")).toBeVisible()

    await page.getByTestId("production-run-queue-apply-fix").first().click()
    await expect(page.getByText("阻塞已解除，仍需复核")).toBeVisible({ timeout: 5_000 })
    await expect(page.locator(".react-flow__node").filter({ hasText: "cinematic lighting" })).toBeVisible({ timeout: 5_000 })

    await expect(page.getByTestId("production-run-queue-panel")).toBeVisible({ timeout: 5_000 })
    await expect.poll(async () => page.getByTestId("production-run-queue-blocked-action").count()).toBeGreaterThanOrEqual(2)
    await expect(page.getByTestId("video-provider-dry-run-summary")).toContainText("0 阻塞")
    await expect(page.getByTestId("production-run-queue-start")).toBeEnabled()
    await expect(page.getByTestId("production-preflight-summary")).toContainText("0 阻塞")
    await expect(page.locator(".react-flow__node").filter({ hasText: "cinematic lighting" })).toBeVisible({ timeout: 5_000 })
  })
})
