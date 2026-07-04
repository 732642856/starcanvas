import { expect, test, type Page } from "@playwright/test"

type StoredCanvas = {
  version: 1
  savedAt: number
  nodes: Array<Record<string, any>>
  edges: Array<Record<string, any>>
}

type StarCanvasE2EBridge = {
  getNodes: () => Array<{ data: Record<string, any> }>
}

async function hasGeneratedNode(page: Page, criteria: { nodeKind: string; title: string }) {
  return page.evaluate(({ nodeKind, title }) => {
    const e2e = (window as Window & { __starcanvasE2E?: StarCanvasE2EBridge }).__starcanvasE2E
    return e2e?.getNodes().some((node) => node.data.nodeKind === nodeKind && node.data.title === title) ?? false
  }, criteria)
}

const MOCK_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="

const MOCK_AUDIO =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA="

const MOCK_VIDEO =
  "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22320%22%20height%3D%22180%22%3E%3Crect%20width%3D%22320%22%20height%3D%22180%22%20fill%3D%22%231a1a2e%22/%3E%3Ctext%20x%3D%22160%22%20y%3D%2290%22%20text-anchor%3D%22middle%22%20fill%3D%22%23fff%22%3EMock%20Video%3C/text%3E%3C/svg%3E"

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function createStoredCanvas(): StoredCanvas {
  const sourceId = "e2e-pq-source"
  const shotIds = ["e2e-pq-shot-1", "e2e-pq-shot-2", "e2e-pq-shot-3"]

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
            sourceStoryboardNodeId: sourceId,
            status: "ready",
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

  test("真实模式会话 Key 可解除生图阻塞并将视频降级为注意", async ({ page }) => {
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

  test("面板开关/任务列表/开始执行/进度更新", async ({ page }) => {
    const imageRequests: Array<any> = []
    const firstImageRequest = createDeferred()
    const firstImageResponseGate = createDeferred()
    let shouldDelayFirstImage = true

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

    // ── Mock image generation ──
    await page.route("**/api/ai/generate-image", async (route) => {
      imageRequests.push(route.request().postDataJSON())
      if (shouldDelayFirstImage) {
        shouldDelayFirstImage = false
        firstImageRequest.resolve()
        await firstImageResponseGate.promise
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ imageUrl: MOCK_IMAGE, requestId: "e2e-pq-image" }),
      })
    })

    // ── Mock video generation, should stay unused in mock mode but guards accidental real calls ──
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
    await page.addInitScript((storedCanvas) => {
      window.localStorage.clear()
      window.localStorage.setItem("startrails_canvas", JSON.stringify(storedCanvas))
      window.localStorage.setItem("startrails_use_mock", "true")
    }, createStoredCanvas())

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
    // 3 个 shot × 4 个动作 (image + video + voice + subtitle)
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

    // ── 7) 生产中可暂停，并能从暂停点继续 ──
    await firstImageRequest.promise
    await page.getByTestId("production-run-queue-pause").click()
    await expect(page.getByTestId("production-run-queue-resume")).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId("production-run-queue-status")).toContainText("已暂停", { timeout: 10_000 })
    firstImageResponseGate.resolve()
    await page.getByTestId("production-run-queue-resume").click()
    await expect(page.getByText("生产任务执行中")).toBeVisible({ timeout: 10_000 })

    // ── 8) 验证生产执行链路至少触发了首个图像任务并最终完成 ──
    await expect.poll(() => imageRequests.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1)
    await expect(page.getByTestId("production-run-queue-progress")).toContainText("12/12 完成", { timeout: 45_000 })
    await expect(page.getByTestId("production-run-queue-status")).toContainText("已完成", { timeout: 30_000 })
    await expect.poll(
      () => hasGeneratedNode(page, { nodeKind: "video-result", title: "PQ镜头 1 视频" }),
      { timeout: 10_000 },
    ).toBeTruthy()
    await expect.poll(
      () => hasGeneratedNode(page, { nodeKind: "tts-audio", title: "PQ镜头 1 配音" }),
      { timeout: 10_000 },
    ).toBeTruthy()
    await expect.poll(
      () => hasGeneratedNode(page, { nodeKind: "subtitle-srt", title: "PQ镜头 1 字幕" }),
      { timeout: 10_000 },
    ).toBeTruthy()
    await expect(page.locator(".react-flow__node").filter({ hasText: "SRT 内容" }).first()).toBeVisible({ timeout: 10_000 })
    for (const req of imageRequests) {
      expect(req).toHaveProperty("prompt")
      expect(typeof req.prompt).toBe("string")
      expect(req.prompt.length).toBeGreaterThan(0)
    }

    // ── 9) 再次点击开关关闭面板 ──
    await page.getByTestId("production-run-queue-toggle").click()
    await expect(page.getByTestId("production-run-queue-panel")).toHaveCount(0)
  })

  test("失败任务可重试或跳过，并在重试期间锁定队列控制", async ({ page }) => {
    const imageRequests: Array<any> = []
    const retryImageRequest = createDeferred()
    const retryImageResponseGate = createDeferred()
    let firstShotImageAttempts = 0

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

    await page.route("**/api/ai/generate-image", async (route) => {
      const body = route.request().postDataJSON()
      imageRequests.push(body)
      const prompt = typeof body?.prompt === "string" ? body.prompt : ""
      if (prompt.includes("woman standing by window")) {
        firstShotImageAttempts += 1
        if (firstShotImageAttempts === 1) {
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: "e2e image failed once" }),
          })
          return
        }
        if (firstShotImageAttempts === 2) {
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
      window.localStorage.setItem("startrails_use_mock", "true")
    }, createStoredCanvas())

    await page.goto("/canvas")
    await expect(page.getByText("三镜头短剧：测试生产运行队列。").first()).toBeVisible({ timeout: 15_000 })

    await page.keyboard.press("Escape")
    await page.waitForTimeout(200)
    await page.getByTestId("production-run-queue-toggle").click({ force: true })
    await expect(page.getByTestId("production-run-queue-panel")).toBeVisible({ timeout: 5_000 })

    await page.getByTestId("production-run-queue-start").click()
    await expect(page.getByTestId("production-run-queue-status")).toContainText("部分失败", { timeout: 45_000 })
    await expect(page.getByTestId("production-run-queue-progress")).toContainText("2 失败", { timeout: 10_000 })

    const firstImageTask = page
      .getByTestId("production-run-queue-task")
      .filter({ hasText: "PQ镜头 1 · 生成分镜图" })
    const firstVideoTask = page
      .getByTestId("production-run-queue-task")
      .filter({ hasText: "PQ镜头 1 · 生成视频" })

    await expect(firstImageTask).toContainText("失败")
    await expect(firstVideoTask).toContainText("失败")

    await firstImageTask.getByTestId("production-run-queue-retry").click()
    await retryImageRequest.promise
    await expect(page.getByText("生产任务执行中")).toBeVisible({ timeout: 3_000 })
    await expect(page.getByTestId("production-run-queue-start")).toHaveCount(0)

    retryImageResponseGate.resolve()
    await expect(firstImageTask).toContainText("完成", { timeout: 10_000 })
    await expect.poll(
      () => hasGeneratedNode(page, { nodeKind: "ai-generated-image", title: "PQ镜头 1 图" }),
      { timeout: 10_000 },
    ).toBeTruthy()

    await firstVideoTask.getByTestId("production-run-queue-skip").click()
    await expect(firstVideoTask).toContainText("跳过", { timeout: 5_000 })
    await expect(page.getByTestId("production-run-queue-progress")).toContainText("11/12 完成", { timeout: 10_000 })
    await expect(page.getByTestId("production-run-queue-progress")).toContainText("1 跳过")
    await expect(page.getByTestId("production-run-queue-status")).toContainText("已完成", { timeout: 10_000 })
    expect(firstShotImageAttempts).toBe(2)
    expect(imageRequests.length).toBeGreaterThanOrEqual(4)
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
