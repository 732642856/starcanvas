import { expect, test } from "@playwright/test"
import { createTestProjectId } from "./utils/project"
import { clearBrowserStorage } from "./utils/storage"

test.setTimeout(180_000)

test.describe("Provider health summary", () => {
  async function getE2EState(page: Parameters<typeof test>[0]["page"]) {
    return page.evaluate(() => {
      const e2e = (window as Window & {
        __starcanvasE2E?: {
          getAssets?: () => Array<Record<string, unknown>>
          getNodes?: () => Array<{ id: string; type: string; data: Record<string, unknown> }>
        }
      }).__starcanvasE2E

      return {
        assets: e2e?.getAssets?.() ?? [],
        nodes: e2e?.getNodes?.() ?? [],
      }
    })
  }

  async function openProviderSmokePanel(page: Parameters<typeof test>[0]["page"], projectId: string) {
    await page.goto(`/canvas?projectId=${encodeURIComponent(projectId)}`, {
      waitUntil: "domcontentloaded",
      timeout: 180_000,
    })
    await expect(page.locator(".react-flow").first()).toBeVisible({ timeout: 90_000 })
    await page.waitForFunction(
      () => Boolean((window as typeof window & { __starcanvasE2E?: unknown }).__starcanvasE2E),
      undefined,
      { timeout: 90_000 },
    )

    await page.getByRole("button", { name: /模型设置/ }).click()
    await page.getByRole("button", { name: "检查生产能力" }).click()
    await expect(page.getByText("生产能力预检")).toBeVisible()
  }

  test.beforeEach(async ({ page }) => {
    await clearBrowserStorage(page)
  })

  test("settings panel shows run-readiness summary for AI capabilities", async ({ page }) => {
    const projectId = createTestProjectId("provider-health")

    await page.route("**/api/ai/provider-smoke", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          mode: "dry-run",
          overallStatus: "warning",
          readyCount: 2,
          warningCount: 2,
          blockedCount: 1,
          items: [
            {
              target: "text",
              label: "文本 / Chat",
              status: "ready",
              summary: "已检测到文本模型 gpt-5.5。",
              details: ["当前基座地址：https://relay.example/v1"],
              realSmokeSupported: true,
              realSmokeRequiresConsent: true,
              mayConsumeQuota: true,
            },
            {
              target: "image",
              label: "图片生成",
              status: "blocked",
              summary: "图片生成尚未就绪。",
              details: ["缺少默认图片模型，请在设置面板填写 Image Model。"],
              realSmokeSupported: false,
              realSmokeRequiresConsent: true,
              mayConsumeQuota: true,
            },
            {
              target: "video",
              label: "视频生成（Vidu / DashScope）",
              status: "warning",
              summary: "已检测到会话 Key，但未检测到服务端 DashScope 视频 Provider。",
              details: ["真实生视频 smoke 必须显式授权，因为会消耗视频额度。"],
              realSmokeSupported: true,
              realSmokeRequiresConsent: true,
              mayConsumeQuota: true,
            },
            {
              target: "tts-browser",
              label: "TTS（浏览器本地 Kokoro）",
              status: "ready",
              summary: "浏览器本地 TTS 可作为零 Key 兜底方案。",
              details: ["Kokoro 在浏览器本地运行，不依赖服务端 API Key。"],
              realSmokeSupported: false,
              realSmokeRequiresConsent: false,
              mayConsumeQuota: false,
            },
            {
              target: "tts-server",
              label: "TTS（VoxCPM 服务端）",
              status: "warning",
              summary: "未检测到服务端 TTS，但你仍可使用浏览器本地 Kokoro。",
              details: ["如果你需要服务器侧 TTS / 更稳定批量配音，请配置 VOXCPM_BASE_URL。"],
              realSmokeSupported: true,
              realSmokeRequiresConsent: true,
              mayConsumeQuota: true,
            },
          ],
        }),
      })
    })

    await openProviderSmokePanel(page, projectId)

    const summary = page.getByTestId("provider-health-summary")
    await expect(summary).toBeVisible({ timeout: 30_000 })
    await expect(summary).toContainText("运行前健康摘要")
    await expect(summary).toContainText("图片生成")
    await expect(summary).toContainText("视频生成")
    await expect(summary).toContainText("配音")
    await expect(page.getByTestId("task-readiness-summary")).toContainText("正式开工判定")
    await expect(page.getByTestId("task-readiness-item-chat-create")).toContainText("可开始")
    await expect(page.getByTestId("task-readiness-item-image-production")).toContainText("仍被阻塞")
    await expect(page.getByTestId("task-readiness-item-production-run")).toContainText("仍被阻塞")
    await expect(page.getByTestId("task-readiness-fix-hint-image-production")).toContainText("缺少默认图片模型")
    await expect(page.getByText("文本 / Chat")).toBeVisible()
    await expect(page.getByTestId("task-readiness-item-image-production")).toContainText("图片生成尚未就绪。")
    await expect(page.getByRole("button", { name: "真实试跑" })).toHaveCount(3)

    const videoCard = page.getByTestId("provider-smoke-item-video")
    await videoCard.scrollIntoViewIfNeeded()
    await videoCard.getByRole("button", { name: "真实试跑" }).click()

    const confirmationDialog = page.getByTestId("provider-real-smoke-confirm-dialog")
    await expect(confirmationDialog).toBeVisible()
    await expect(confirmationDialog).toContainText("RUN_VIDEO_SMOKE")
    await expect(page.getByTestId("provider-real-smoke-confirm-submit")).toBeDisabled()

    await page.getByTestId("provider-real-smoke-confirm-input").fill("WRONG_TEXT")
    await expect(page.getByTestId("provider-real-smoke-confirm-submit")).toBeDisabled()
  })

  test("settings panel shows 'ready to start' when health and smoke summaries are fully ready", async ({ page }) => {
    const projectId = createTestProjectId("provider-health-ready")

    await page.route("**/api/ai/config", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          baseUrl: "https://relay.example/v1",
          hasApiKey: true,
          defaultModel: "gpt-5.5",
          defaultImageModel: "gpt-image-2",
          videoModel: "vidu",
          timeoutMs: 120000,
          providers: [
            {
              id: "dashscope",
              name: "DashScope",
              hasApiKey: true,
              capabilities: ["text", "image", "video"],
            },
          ],
        }),
      })
    })

    await page.route("**/api/ai/provider-smoke", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          mode: "dry-run",
          overallStatus: "ready",
          readyCount: 5,
          warningCount: 0,
          blockedCount: 0,
          items: [
            {
              target: "text",
              label: "文本 / Chat",
              status: "ready",
              summary: "文本 smoke 已通过。",
              details: ["当前文本链路可用于一句话创意与剧本生成。"],
              realSmokeSupported: true,
              realSmokeRequiresConsent: true,
              mayConsumeQuota: true,
            },
            {
              target: "image",
              label: "图片生成",
              status: "ready",
              summary: "图片 smoke 已通过。",
              details: ["当前图片链路可用于分镜图生成。"],
              realSmokeSupported: true,
              realSmokeRequiresConsent: true,
              mayConsumeQuota: true,
            },
            {
              target: "video",
              label: "视频生成（Vidu / DashScope）",
              status: "ready",
              summary: "视频 smoke 已通过。",
              details: ["当前视频链路可用于生产队列的生视频任务。"],
              realSmokeSupported: true,
              realSmokeRequiresConsent: true,
              mayConsumeQuota: true,
            },
            {
              target: "tts-browser",
              label: "TTS（浏览器本地 Kokoro）",
              status: "ready",
              summary: "浏览器本地 TTS 可用。",
              details: ["当前环境可直接本地配音。"],
              realSmokeSupported: false,
              realSmokeRequiresConsent: false,
              mayConsumeQuota: false,
            },
            {
              target: "tts-server",
              label: "TTS（VoxCPM 服务端）",
              status: "ready",
              summary: "服务端 TTS 可用。",
              details: ["当前环境可进行更稳定的批量配音。"],
              realSmokeSupported: true,
              realSmokeRequiresConsent: true,
              mayConsumeQuota: true,
            },
          ],
        }),
      })
    })

    await openProviderSmokePanel(page, projectId)

    const readiness = page.getByTestId("task-readiness-summary")
    await expect(readiness).toContainText("正式开工判定")
    await expect(readiness).toContainText("可正式开工")
    await expect(page.getByTestId("task-readiness-item-chat-create")).toContainText("可开始")
    await expect(page.getByTestId("task-readiness-item-auto-agent-project-bootstrap")).toContainText("可开始")
    await expect(page.getByTestId("task-readiness-item-image-production")).toContainText("可开始")
    await expect(page.getByTestId("task-readiness-item-production-run")).toContainText("可开始")
    await expect(page.getByTestId("provider-health-summary")).toContainText("已按专用路由解析到真实模型")
  })

  test("video real smoke submits the request after entering the required confirmation text", async ({ page }) => {
    const projectId = createTestProjectId("provider-health-video-run")
    const requests: Array<Record<string, unknown>> = []

    await page.route("**/api/ai/provider-smoke", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          mode: "dry-run",
          overallStatus: "warning",
          readyCount: 1,
          warningCount: 1,
          blockedCount: 0,
          items: [
            {
              target: "video",
              label: "视频生成（Vidu / DashScope）",
              status: "warning",
              summary: "已检测到会话 Key，但未检测到服务端 DashScope 视频 Provider。",
              details: ["真实生视频 smoke 必须显式授权，因为会消耗视频额度。"],
              realSmokeSupported: true,
              realSmokeRequiresConsent: true,
              mayConsumeQuota: true,
            },
          ],
        }),
      })
    })

    await page.route("**/api/ai/provider-smoke/run", async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>
      requests.push(body)
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          target: "video",
          status: "passed",
          message: "视频 smoke 已通过（已拿到最终 Vidu 视频结果）。",
          details: [
            "任务 ID：vidu-task-e2e-001",
            "最终视频地址：https://e2e.invalid/final-video.mp4",
            "这是一次最小时长真实视频请求，通常会消耗少量视频额度。",
          ],
          artifact: {
            type: "video",
            url: "https://e2e.invalid/final-video.mp4",
          },
        }),
      })
    })

    await openProviderSmokePanel(page, projectId)

    const videoCard = page.getByTestId("provider-smoke-item-video")
    await videoCard.scrollIntoViewIfNeeded()
    await videoCard.getByRole("button", { name: "真实试跑" }).click()
    await page.getByTestId("provider-real-smoke-confirm-input").fill("RUN_VIDEO_SMOKE")
    await page.getByTestId("provider-real-smoke-confirm-submit").click()

    await expect(videoCard).toContainText("视频 smoke 已通过（已拿到最终 Vidu 视频结果）。")
    await expect(page.getByTestId("provider-smoke-result-video")).toContainText("试跑通过")
    await expect(page.getByTestId("provider-smoke-result-video")).toContainText("最终视频地址：https://e2e.invalid/final-video.mp4")
    await expect(page.getByTestId("provider-smoke-result-video")).toContainText("最小时长真实视频请求")
    await expect(page.getByTestId("provider-smoke-artifact-video")).toContainText("https://e2e.invalid/final-video.mp4")
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({
      target: "video",
      confirmCost: true,
      confirmationText: "RUN_VIDEO_SMOKE",
      waitForResult: true,
    })
  })

  test("image real smoke submits the request after entering the required confirmation text", async ({ page }) => {
    const projectId = createTestProjectId("provider-health-image-run")
    const requests: Array<Record<string, unknown>> = []

    await page.route("**/api/ai/provider-smoke", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          mode: "dry-run",
          overallStatus: "ready",
          readyCount: 1,
          warningCount: 0,
          blockedCount: 0,
          items: [
            {
              target: "image",
              label: "图片生成",
              status: "ready",
              summary: "已检测到图片模型 gpt-image-2。",
              details: ["真实生图 smoke 需要显式授权，因为会消耗图片额度。"],
              realSmokeSupported: true,
              realSmokeRequiresConsent: true,
              mayConsumeQuota: true,
            },
          ],
        }),
      })
    })

    await page.route("**/api/ai/provider-smoke/run", async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>
      requests.push(body)
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          target: "image",
          status: "passed",
          message: "图片 smoke 已通过（gpt-image-2）。",
          details: ["这是一次单张最小规格真实生图请求，会消耗少量图片额度。"],
          artifact: {
            type: "image",
            url: "data:image/png;base64,ZmFrZQ==",
            mimeType: "image/png",
          },
        }),
      })
    })

    await openProviderSmokePanel(page, projectId)

    const imageCard = page.getByTestId("provider-smoke-item-image")
    await imageCard.scrollIntoViewIfNeeded()
    await imageCard.getByRole("button", { name: "真实试跑" }).click()

    const confirmationDialog = page.getByTestId("provider-real-smoke-confirm-dialog")
    await expect(confirmationDialog).toBeVisible()
    await expect(confirmationDialog).toContainText("RUN_IMAGE_SMOKE")

    await page.getByTestId("provider-real-smoke-confirm-input").fill("RUN_IMAGE_SMOKE")
    await page.getByTestId("provider-real-smoke-confirm-submit").click()

    await expect(imageCard).toContainText("图片 smoke 已通过（gpt-image-2）。")
    await expect(page.getByTestId("provider-smoke-result-image")).toContainText("试跑通过")
    await expect(page.getByTestId("provider-smoke-result-image")).toContainText("单张最小规格真实生图请求")
    await expect(page.getByTestId("provider-smoke-artifact-image")).toBeVisible()
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({
      target: "image",
      confirmCost: true,
      confirmationText: "RUN_IMAGE_SMOKE",
    })
  })

  test("reference image edit requires independent confirmation without sending a request", async ({ page }) => {
    const projectId = createTestProjectId("provider-health-reference-edit-confirm")
    await openProviderSmokePanel(page, projectId)

    const card = page.getByTestId("provider-smoke-item-image-edit")
    await card.scrollIntoViewIfNeeded()
    await expect(card).toContainText("普通生图通过不代表该路径可生产")
    await card.getByRole("button", { name: "真实试跑" }).click()

    await expect(page.getByTestId("provider-real-smoke-confirm-dialog")).toContainText("确认参考图编辑 smoke")
    await expect(page.getByTestId("provider-real-smoke-confirm-input")).toHaveValue("")
    await expect(page.getByTestId("provider-real-smoke-confirm-submit")).toBeDisabled()
  })

  test("failed image real smoke keeps image workflows blocked after reload", async ({
    page,
  }) => {
    const projectId = createTestProjectId("provider-health-image-failed-persisted")
    const context = page.context()
    const requests: Array<Record<string, unknown>> = []

    await context.route("**/api/ai/config", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          baseUrl: "https://e2e.invalid/v1",
          hasApiKey: true,
          defaultModel: "gpt-5.5",
          defaultImageModel: "gpt-image-2",
          videoModel: "vidu",
          timeoutMs: 120000,
          providers: [],
        }),
      })
    })

    await context.route("**/api/ai/provider-smoke", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          mode: "dry-run",
          overallStatus: "ready",
          readyCount: 3,
          warningCount: 0,
          blockedCount: 0,
          items: [
            {
              target: "text",
              label: "文本 / Chat",
              status: "ready",
              summary: "已检测到文本模型 gpt-5.5。",
              details: ["当前基座地址：https://e2e.invalid/v1"],
              realSmokeSupported: true,
              realSmokeRequiresConsent: false,
              mayConsumeQuota: false,
            },
            {
              target: "image",
              label: "图片生成",
              status: "ready",
              summary: "已检测到图片模型 gpt-image-2。",
              details: ["真实生图 smoke 需要显式授权，因为会消耗图片额度。"],
              realSmokeSupported: true,
              realSmokeRequiresConsent: true,
              mayConsumeQuota: true,
            },
            {
              target: "video",
              label: "视频生成（Vidu / DashScope）",
              status: "ready",
              summary: "已检测到视频模型 vidu。",
              details: ["真实生视频 smoke 必须显式授权，因为会消耗视频额度。"],
              realSmokeSupported: true,
              realSmokeRequiresConsent: true,
              mayConsumeQuota: true,
            },
          ],
        }),
      })
    })

    await context.route("**/api/ai/provider-smoke/run", async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>
      requests.push(body)

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          target: "image",
          status: "failed",
          message: "图片生成超时，请稍后重试。",
          details: ["上游服务响应时间过长，可能是服务繁忙或当前图片处理耗时过高。"],
        }),
      })
    })

    await openProviderSmokePanel(page, projectId)

    const imageCard = page.getByTestId("provider-smoke-item-image")
    await imageCard.scrollIntoViewIfNeeded()
    await imageCard.getByRole("button", { name: "真实试跑" }).click()
    await page.getByTestId("provider-real-smoke-confirm-input").fill("RUN_IMAGE_SMOKE")
    await page.getByTestId("provider-real-smoke-confirm-submit").click()

    await expect(page.getByTestId("provider-smoke-result-image")).toContainText("请求超时")
    await expect(page.getByTestId("provider-smoke-result-image")).toContainText("图片生成超时，请稍后重试。")
    await expect(page.getByTestId("task-readiness-item-image-production")).toContainText("请求超时")
    await expect(page.getByTestId("task-readiness-item-production-run")).toContainText("请求超时")
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({
      target: "image",
      confirmCost: true,
      confirmationText: "RUN_IMAGE_SMOKE",
    })

    const reloadedPage = await context.newPage()
    await openProviderSmokePanel(reloadedPage, projectId)

    await expect(reloadedPage.getByTestId("task-readiness-item-image-production")).toContainText("请求超时")
    await expect(reloadedPage.getByTestId("task-readiness-item-production-run")).toContainText("请求超时")
    await reloadedPage.close()
  })

  test("saving settings clears stale failed real smoke and restores ready-state guidance", async ({ page }) => {
    const projectId = createTestProjectId("provider-health-image-failed-cleared")

    await page.route("**/api/ai/config", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          baseUrl: "https://relay.example/v1",
          hasApiKey: true,
          defaultModel: "gpt-5.5",
          defaultImageModel: "gpt-image-2",
          videoModel: "vidu",
          timeoutMs: 120000,
          providers: [
            {
              id: "dashscope",
              name: "DashScope",
              hasApiKey: true,
              capabilities: ["text", "image", "video"],
            },
          ],
        }),
      })
    })

    await page.route("**/api/ai/provider-smoke", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          mode: "dry-run",
          overallStatus: "ready",
          readyCount: 3,
          warningCount: 0,
          blockedCount: 0,
          items: [
            {
              target: "text",
              label: "文本 / Chat",
              status: "ready",
              summary: "已检测到文本模型 gpt-5.5。",
              details: ["当前基座地址：https://e2e.invalid/v1"],
              realSmokeSupported: true,
              realSmokeRequiresConsent: false,
              mayConsumeQuota: false,
            },
            {
              target: "image",
              label: "图片生成",
              status: "ready",
              summary: "已检测到图片模型 gpt-image-2。",
              details: ["真实生图 smoke 需要显式授权，因为会消耗图片额度。"],
              realSmokeSupported: true,
              realSmokeRequiresConsent: true,
              mayConsumeQuota: true,
            },
            {
              target: "video",
              label: "视频生成（Vidu / DashScope）",
              status: "ready",
              summary: "已检测到视频模型 vidu。",
              details: ["真实生视频 smoke 必须显式授权，因为会消耗视频额度。"],
              realSmokeSupported: true,
              realSmokeRequiresConsent: true,
              mayConsumeQuota: true,
            },
          ],
        }),
      })
    })

    await page.route("**/api/ai/provider-smoke/run", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          target: "image",
          status: "failed",
          message: "图片生成超时，请稍后重试。",
          details: ["上游服务响应时间过长，可能是服务繁忙或当前图片处理耗时过高。"],
        }),
      })
    })

    await openProviderSmokePanel(page, projectId)

    const imageCard = page.getByTestId("provider-smoke-item-image")
    await imageCard.scrollIntoViewIfNeeded()
    await imageCard.getByRole("button", { name: "真实试跑" }).click()
    await page.getByTestId("provider-real-smoke-confirm-input").fill("RUN_IMAGE_SMOKE")
    await page.getByTestId("provider-real-smoke-confirm-submit").click()

    await expect(page.getByTestId("task-readiness-item-image-production")).toContainText("请求超时")
    await page.getByTestId("provider-settings-save").click()

    await openProviderSmokePanel(page, projectId)

    await expect(page.getByTestId("task-readiness-item-image-production")).toContainText("可开始")
    await expect(page.getByTestId("task-readiness-item-production-run")).toContainText("可开始")
    await expect(page.getByTestId("provider-smoke-result-image")).toHaveCount(0)
  })

  test("smoke artifacts can be imported back into canvas and asset library for continued workflow use", async ({ page }) => {
    const projectId = createTestProjectId("provider-smoke-import")

    await page.route("**/api/ai/provider-smoke", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          mode: "dry-run",
          overallStatus: "ready",
          readyCount: 2,
          warningCount: 0,
          blockedCount: 0,
          items: [
            {
              target: "image",
              label: "图片生成",
              status: "ready",
              summary: "已检测到图片模型 gpt-image-2。",
              details: ["真实生图 smoke 需要显式授权，因为会消耗图片额度。"],
              realSmokeSupported: true,
              realSmokeRequiresConsent: true,
              mayConsumeQuota: true,
            },
            {
              target: "video",
              label: "视频生成（Vidu / DashScope）",
              status: "ready",
              summary: "已检测到视频模型 vidu。",
              details: ["真实生视频 smoke 必须显式授权，因为会消耗视频额度。"],
              realSmokeSupported: true,
              realSmokeRequiresConsent: true,
              mayConsumeQuota: true,
            },
          ],
        }),
      })
    })

    await page.route("**/api/ai/provider-smoke/run", async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>
      const target = String(body.target ?? "")

      if (target === "image") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            target: "image",
            status: "passed",
            message: "图片 smoke 已通过（gpt-image-2）。",
            details: ["这是一次单张最小规格真实生图请求，会消耗少量图片额度。"],
            artifact: {
              type: "image",
              url: "data:image/png;base64,ZmFrZQ==",
              mimeType: "image/png",
            },
          }),
        })
        return
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          target: "video",
          status: "passed",
          message: "视频 smoke 已通过（已拿到最终 Vidu 视频结果）。",
          details: [
            "任务 ID：vidu-task-e2e-import",
            "最终视频地址：https://e2e.invalid/final-video.mp4",
          ],
          artifact: {
            type: "video",
            url: "https://e2e.invalid/final-video.mp4",
          },
        }),
      })
    })

    await page.route("https://e2e.invalid/final-video.mp4", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "video/mp4",
        body: Buffer.from("fake-video-binary"),
      })
    })

    await openProviderSmokePanel(page, projectId)

    const imageCard = page.getByTestId("provider-smoke-item-image")
    await imageCard.getByRole("button", { name: "真实试跑" }).click()
    await page.getByTestId("provider-real-smoke-confirm-input").fill("RUN_IMAGE_SMOKE")
    await page.getByTestId("provider-real-smoke-confirm-submit").click()
    await page.getByTestId("provider-smoke-import-image").click()

    await expect.poll(async () => {
      const state = await getE2EState(page)
      return {
        assetCount: state.assets.filter((asset) => asset.name === "Provider Smoke 图像").length,
        nodeCount: state.nodes.filter((node) => node.data?.title === "Provider Smoke 图像").length,
      }
    }).toEqual({
      assetCount: 1,
      nodeCount: 1,
    })

    const videoCard = page.getByTestId("provider-smoke-item-video")
    await videoCard.getByRole("button", { name: "真实试跑" }).click()
    await page.getByTestId("provider-real-smoke-confirm-input").fill("RUN_VIDEO_SMOKE")
    await page.getByTestId("provider-real-smoke-confirm-submit").click()
    await page.getByTestId("provider-smoke-import-video").click()

    await expect.poll(async () => {
      const state = await getE2EState(page)
      return {
        videoAssets: state.assets.filter((asset) => asset.name === "Provider Smoke 视频").length,
        videoNodeKinds: state.nodes
          .filter((node) => typeof node.data?.nodeKind === "string")
          .map((node) => String(node.data?.nodeKind)),
      }
    }).toEqual({
      videoAssets: 1,
      videoNodeKinds: expect.arrayContaining([
        "uploaded-video",
        "video-sample-frames",
        "video-analyze",
      ]),
    })
  })
})
