import { expect, test, type Page } from "@playwright/test"

import { collectConsoleErrors, dismissOnboardingIfPresent, gotoCanvas } from "./utils"
import { createTestProjectId } from "./utils/project"

const REAL_UI_SMOKE_ENABLED = process.env.STARCANVAS_REAL_PROVIDER_AUTO_AGENT_UI_SMOKE === "1"
const REAL_UI_IMAGE_SMOKE_ENABLED = process.env.STARCANVAS_REAL_PROVIDER_AUTO_AGENT_IMAGE_UI_SMOKE === "1"
const REAL_UI_QUEUE_IMAGE_SMOKE_ENABLED =
  process.env.STARCANVAS_REAL_PROVIDER_QUEUE_IMAGE_UI_SMOKE === "1"
const REAL_UI_PROJECT_BIBLE_IMAGE_WRITEBACK_ENABLED =
  process.env.STARCANVAS_REAL_PROVIDER_PROJECT_BIBLE_IMAGE_WRITEBACK_SMOKE === "1"
const REAL_UI_SESSION_API_KEY = (process.env.STARCANVAS_REAL_PROVIDER_SESSION_API_KEY || "").trim()
const REAL_UI_PROVIDER_OVERRIDE_BASE_URL =
  (process.env.STARCANVAS_REAL_PROVIDER_OVERRIDE_BASE_URL || "").trim()
const REAL_UI_PROVIDER_OVERRIDE_DEFAULT_MODEL =
  (process.env.STARCANVAS_REAL_PROVIDER_OVERRIDE_DEFAULT_MODEL || "").trim()
const REAL_UI_PROVIDER_OVERRIDE_IMAGE_MODEL =
  (process.env.STARCANVAS_REAL_PROVIDER_OVERRIDE_IMAGE_MODEL || "").trim()
const REAL_UI_PROVIDER_OVERRIDE_VIDEO_MODEL =
  (process.env.STARCANVAS_REAL_PROVIDER_OVERRIDE_VIDEO_MODEL || "").trim()
const REAL_UI_PROVIDER_OVERRIDE_TIMEOUT_MS_RAW =
  (process.env.STARCANVAS_REAL_PROVIDER_OVERRIDE_TIMEOUT_MS || "").trim()
const REAL_UI_PROVIDER_OVERRIDE_TIMEOUT_MS = (() => {
  if (!REAL_UI_PROVIDER_OVERRIDE_TIMEOUT_MS_RAW) return null
  const parsed = Number(REAL_UI_PROVIDER_OVERRIDE_TIMEOUT_MS_RAW)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
})()
const REAL_UI_PROVIDER_OVERRIDES = {
  ...(REAL_UI_PROVIDER_OVERRIDE_BASE_URL ? { baseUrl: REAL_UI_PROVIDER_OVERRIDE_BASE_URL } : {}),
  ...(REAL_UI_PROVIDER_OVERRIDE_DEFAULT_MODEL
    ? { defaultModel: REAL_UI_PROVIDER_OVERRIDE_DEFAULT_MODEL }
    : {}),
  ...(REAL_UI_PROVIDER_OVERRIDE_IMAGE_MODEL ? { imageModel: REAL_UI_PROVIDER_OVERRIDE_IMAGE_MODEL } : {}),
  ...(REAL_UI_PROVIDER_OVERRIDE_VIDEO_MODEL ? { videoModel: REAL_UI_PROVIDER_OVERRIDE_VIDEO_MODEL } : {}),
  ...(REAL_UI_PROVIDER_OVERRIDE_TIMEOUT_MS ? { timeoutMs: REAL_UI_PROVIDER_OVERRIDE_TIMEOUT_MS } : {}),
}
const PROJECT_BIBLE_SMOKE_TIMEOUT_MS = REAL_UI_PROJECT_BIBLE_IMAGE_WRITEBACK_ENABLED ? 540_000 : 240_000
const PROJECT_BIBLE_WRITEBACK_POLL_TIMEOUT_MS = 360_000

const PROJECT_BIBLE_SMOKE_PROMPT =
  "把这个短片想法拆成制作圣经，不要生成图片或视频，只先输出角色、场景和分镜任务：雨夜里，女主林雾回到废弃电影院，男主周祁在放映室等她。"

const IMAGE_SMOKE_PROMPT =
  "Please generate an image: minimal smoke test poster, simple geometric shapes, monochrome, no text."
const MOCK_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="

function createSingleShotQueueCanvas() {
  const shotNodeId = "e2e-real-queue-shot-1"
  return {
    version: 2,
    savedAt: Date.now(),
    nodes: [
      {
        id: shotNodeId,
        type: "shot",
        position: { x: 280, y: 180 },
        width: 340,
        height: 260,
        measured: { width: 340, height: 260 },
        data: {
          title: "Real Queue 镜头 1",
          nodeKind: "shot",
          prompt: "minimal monochrome storyboard frame, geometric hallway, cinematic lighting, no text",
          shot: {
            id: shotNodeId,
            order: 1,
            title: "Real Queue 镜头 1",
            shotType: "wide",
            cameraMovement: "static",
            duration: "3s",
            description: "一个极简走廊镜头，用于真实生产队列首图回写 smoke。",
            visualPrompt: "minimal monochrome storyboard frame, geometric hallway, cinematic lighting, no text",
            dialogue: "",
            status: "ready",
          },
        },
      },
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  }
}

async function getE2EState(page: Page): Promise<{
  assets: Array<{ id?: string; name?: string; metadata?: { source?: string; assetId?: string } }>
  nodes: Array<{
    id?: string
    data?: {
      title?: string
      nodeKind?: string
      source?: string
      assetId?: string
      prompt?: string
      imageGenerationDeferred?: boolean
      shot?: {
        generatedImageAssetId?: string
        generatedImageNodeId?: string
      }
      projectVisualBible?: { stylePrompt?: string }
      compositeSettings?: { stylePrompt?: string }
    }
  }>
}> {
  return page.evaluate(() => {
    const e2e = (window as Window & {
      __starcanvasE2E?: {
        getAssets: () => Array<{ id?: string; name?: string; metadata?: { source?: string; assetId?: string } }>
        getNodes: () => Array<{
          id?: string
          data?: {
            title?: string
            nodeKind?: string
            source?: string
            assetId?: string
            prompt?: string
            imageGenerationDeferred?: boolean
            shot?: {
              generatedImageAssetId?: string
              generatedImageNodeId?: string
            }
            projectVisualBible?: { stylePrompt?: string }
            compositeSettings?: { stylePrompt?: string }
          }
        }>
      }
    }).__starcanvasE2E
    if (!e2e) throw new Error("__starcanvasE2E bridge is unavailable")
    return {
      assets: e2e.getAssets(),
      nodes: e2e.getNodes(),
    }
  })
}

async function seedRealProviderState(page: Page): Promise<void> {
  await page.addInitScript(({ sessionApiKey, providerOverrides }) => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    if (sessionApiKey) {
      window.sessionStorage.setItem("startrails_session_api_key", sessionApiKey)
    }
    if (providerOverrides.baseUrl) {
      window.localStorage.setItem("startrails_provider_baseUrl", providerOverrides.baseUrl)
    }
    if (providerOverrides.defaultModel) {
      window.localStorage.setItem("startrails_provider_defaultModel", providerOverrides.defaultModel)
    }
    if (providerOverrides.imageModel) {
      window.localStorage.setItem("startrails_provider_imageModel", providerOverrides.imageModel)
    }
    if (providerOverrides.videoModel) {
      window.localStorage.setItem("startrails_provider_videoModel", providerOverrides.videoModel)
    }
    if (typeof providerOverrides.timeoutMs === "number" && Number.isFinite(providerOverrides.timeoutMs)) {
      window.localStorage.setItem("startrails_provider_timeoutMs", String(providerOverrides.timeoutMs))
    }
  }, {
    sessionApiKey: REAL_UI_SESSION_API_KEY,
    providerOverrides: REAL_UI_PROVIDER_OVERRIDES,
  })
}

async function seedProjectCanvas(page: Page, projectId: string, storedCanvas: Record<string, unknown>): Promise<void> {
  const storageKey = `startrails_canvas_p:${encodeURIComponent(projectId)}`
  await page.addInitScript(({ targetStorageKey, snapshot }) => {
    window.localStorage.setItem(targetStorageKey, JSON.stringify(snapshot))
  }, { targetStorageKey: storageKey, snapshot: storedCanvas })
}

test("real provider UI smoke can bootstrap a project bible from one sentence", async ({ page }) => {
  test.skip(!REAL_UI_SMOKE_ENABLED, "set STARCANVAS_REAL_PROVIDER_AUTO_AGENT_UI_SMOKE=1 to run real provider UI smoke")
  test.setTimeout(PROJECT_BIBLE_SMOKE_TIMEOUT_MS)

  const errors = collectConsoleErrors(page)
  const projectId = createTestProjectId("auto-agent-real-provider-project-bible")
  await seedRealProviderState(page)
  await gotoCanvas(page, projectId)
  await dismissOnboardingIfPresent(page)

  await page.getByTestId("chat-toggle").click()
  const chatPanel = page.getByTestId("chat-panel")
  const chatInput = page.getByTestId("chat-input")
  const projectBiblePanel = page.getByTestId("project-bible-panel")
  const clarificationButton = chatPanel.getByRole("button", { name: "拆成制作圣经" })
  const applyActionsButton = chatPanel.getByRole("button", { name: /执行 \d+ 个操作/ })

  await expect(chatInput).toBeVisible({ timeout: 15_000 })
  await chatInput.fill(PROJECT_BIBLE_SMOKE_PROMPT)
  await chatInput.press("Enter")

  const bootstrapResolution = await Promise.race([
    clarificationButton.waitFor({ state: "visible", timeout: 120_000 }).then(() => "clarification" as const),
    applyActionsButton.waitFor({ state: "visible", timeout: 120_000 }).then(() => "apply" as const),
    projectBiblePanel.waitFor({ state: "visible", timeout: 120_000 }).then(() => "ready" as const),
  ])

  if (bootstrapResolution === "clarification") {
    await clarificationButton.click()
    await expect(page.getByText("已选择：拆成制作圣经")).toBeVisible({ timeout: 15_000 })
  } else if (bootstrapResolution === "apply") {
    await applyActionsButton.click()
  }

  await expect(projectBiblePanel).toBeVisible({ timeout: 120_000 })
  await expect(
    page.locator(".react-flow__node").filter({ hasText: "# Project Bible / 制作圣经总览" }).first(),
  ).toBeVisible({ timeout: 120_000 })
  await expect(page.locator(".react-flow__node").filter({ hasText: "角色资产 Bible" }).first()).toBeVisible({
    timeout: 120_000,
  })
  await expect(page.locator(".react-flow__node").filter({ hasText: "场景资产 Bible" }).first()).toBeVisible({
    timeout: 120_000,
  })
  await expect(page.locator(".react-flow__node").filter({ hasText: "分镜拆解任务" }).first()).toBeVisible({
    timeout: 120_000,
  })

  await expect(projectBiblePanel.getByRole("button", { name: /角色 \d+/ })).toBeVisible({ timeout: 30_000 })
  await expect(projectBiblePanel.getByRole("button", { name: /场景 \d+/ })).toBeVisible({ timeout: 30_000 })
  await expect(projectBiblePanel.getByRole("heading", { name: "林雾" })).toBeVisible({ timeout: 30_000 })
  await expect(projectBiblePanel.getByRole("heading", { name: "周祁" })).toBeVisible({ timeout: 30_000 })
  const linwuHeading = projectBiblePanel.getByRole("heading", { name: "林雾" })
  const linwuCharacterCard = linwuHeading.locator("xpath=ancestor::article[1]")
  await expect(linwuHeading).toBeVisible({ timeout: 15_000 })
  await linwuCharacterCard.scrollIntoViewIfNeeded()
  await linwuCharacterCard.getByTestId("project-bible-open-character-view").click()
  await expect(page.getByText("角色三视图生成")).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText("— 林雾")).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId("character-view-generate-button")).toBeVisible({ timeout: 15_000 })
  await page.getByRole("button", { name: "关闭三视图生成面板" }).click()
  await expect(page.getByText("角色三视图生成")).toHaveCount(0)
  const visualStyle = "e2e real provider bible visual style"
  await projectBiblePanel.getByRole("button", { name: /视觉/ }).click()
  await projectBiblePanel.getByPlaceholder("追加到分镜合成图的全局风格 Prompt").fill(visualStyle)
  await projectBiblePanel.getByRole("button", { name: /同步到分镜源节点和合成设置/ }).click()
  await expect
    .poll(async () => {
      const state = await getE2EState(page)
      return state.nodes.some(
        (node) =>
          node.data?.projectVisualBible?.stylePrompt === visualStyle ||
          node.data?.compositeSettings?.stylePrompt === visualStyle,
      )
    }, { timeout: 15_000 })
    .toBe(true)
  await expect
    .poll(async () => {
      const state = await getE2EState(page)
      return state.nodes.filter((node) => node.data?.nodeKind === "shot").length
    }, { timeout: 15_000 })
    .toBeGreaterThan(0)
  await projectBiblePanel.getByTitle("收起").click()
  await expect(projectBiblePanel).toHaveCount(0)
  await page.getByTestId("shot-planning-toggle").click()
  const shotPlanningPanel = page.getByTestId("shot-planning-panel")
  await expect(shotPlanningPanel).toBeVisible({ timeout: 10_000 })
  await page.getByTestId("shot-planning-generate").click()
  await expect
    .poll(async () => await shotPlanningPanel.locator("[data-planning-item]").count(), { timeout: 15_000 })
    .toBeGreaterThan(0)
  await shotPlanningPanel.locator("[data-planning-item]").first().locator("select").selectOption("ready")
  await expect(page.getByTestId("shot-planning-create-queue")).toBeEnabled({ timeout: 10_000 })
  await page.getByTestId("shot-planning-create-queue").click()
  await expect(shotPlanningPanel).toContainText(/Created \d+ queue task/, { timeout: 10_000 })
  const queuePanel = page.getByTestId("production-run-queue-panel")
  const startButton = page.getByTestId("production-run-queue-start")
  await expect(queuePanel).toBeVisible({ timeout: 10_000 })
  if (REAL_UI_SESSION_API_KEY) {
    const stateBeforeStart = await getE2EState(page)
    const assetCountBeforeStart = stateBeforeStart.assets.length
    await expect(page.getByTestId("production-provider-open-settings")).toBeVisible()
    await page.getByTestId("production-provider-open-settings").click()
    await expect(page.getByTestId("provider-health-summary")).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId("provider-settings-save")).toBeVisible({ timeout: 5_000 })
    await page.getByTestId("provider-settings-save").click()
    await expect(page.getByTestId("production-provider-health-summary")).toContainText("0 阻塞", { timeout: 10_000 })
    await expect(startButton).toBeEnabled({ timeout: 10_000 })
    await expect(startButton).toContainText("一键开始生产")
    await startButton.click()
    await expect(page.getByText("生产任务执行中")).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId("production-run-queue-status")).toContainText("运行中", { timeout: 15_000 })
    await expect(page.getByText(/🖼️ (准备中\.\.\.|\d+\/\d+ 生成中\.\.\.)/)).toBeVisible({ timeout: 30_000 })
    if (REAL_UI_PROJECT_BIBLE_IMAGE_WRITEBACK_ENABLED) {
      await expect
        .poll(async () => {
          const stateAfterStart = await getE2EState(page)
          return {
            shotImageLinked: stateAfterStart.nodes.some(
              (node) =>
                Boolean(node.data?.shot?.generatedImageAssetId) &&
                Boolean(node.data?.shot?.generatedImageNodeId),
            ),
            assetCountIncreased: stateAfterStart.assets.length > assetCountBeforeStart,
          }
        }, {
          timeout: PROJECT_BIBLE_WRITEBACK_POLL_TIMEOUT_MS,
          message: "first real production image should link back into a shot node and add a new asset",
        })
        .toEqual({
          shotImageLinked: true,
          assetCountIncreased: true,
        })
    }
  } else {
    await expect(page.getByTestId("production-preflight-summary")).toContainText("阻塞", { timeout: 10_000 })
    await expect(startButton).toBeDisabled()
    await expect(startButton).toContainText("先处理：")
    await expect(page.getByTestId("production-provider-fix-hint")).toContainText("先修：")
    await expect
      .poll(async () => await page.getByTestId("production-run-queue-blocked-action").count(), { timeout: 10_000 })
      .toBeGreaterThan(0)
    await expect(page.getByTestId("production-provider-open-settings")).toBeVisible()
    await page.getByTestId("production-provider-open-settings").click()
    await expect(page.getByTestId("provider-health-summary")).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId("provider-settings-save")).toBeVisible({ timeout: 5_000 })
  }
  expect(errors.consoleErrors).toEqual([])
  expect(errors.pageErrors).toEqual([])
})

test("real provider UI smoke can generate an image and auto-write it into canvas + asset library", async ({ page }) => {
  test.skip(
    !REAL_UI_IMAGE_SMOKE_ENABLED,
    "set STARCANVAS_REAL_PROVIDER_AUTO_AGENT_IMAGE_UI_SMOKE=1 to run real provider image UI smoke",
  )
  test.setTimeout(420_000)

  const errors = collectConsoleErrors(page)
  const projectId = createTestProjectId("auto-agent-real-provider-image")
  await seedRealProviderState(page)
  await gotoCanvas(page, projectId)
  await dismissOnboardingIfPresent(page)

  await page.getByTestId("chat-toggle").click()
  const chatInput = page.getByTestId("chat-input")
  await expect(chatInput).toBeVisible({ timeout: 15_000 })
  await chatInput.fill(IMAGE_SMOKE_PROMPT)
  await chatInput.press("Enter")

  await expect
    .poll(async () => {
      const state = await getE2EState(page)
      const generatedNode = state.nodes.find(
        (node) => node.data?.nodeKind === "ai-generated-image" && node.data?.source === "generated",
      )
      const generatedAsset = state.assets.find(
        (asset) => asset.name?.startsWith("AI生成-") && asset.metadata?.source === "chat-generated",
      )
      return {
        nodeId: generatedNode?.id ?? null,
        nodeAssetId: generatedNode?.data?.assetId ?? null,
        assetId: generatedAsset?.metadata?.assetId ?? null,
      }
    }, { timeout: 360_000 })
    .toMatchObject({
      nodeId: expect.any(String),
      nodeAssetId: expect.any(String),
      assetId: expect.any(String),
    })

  const finalState = await getE2EState(page)
  const finalNode = finalState.nodes.find(
    (node) => node.data?.nodeKind === "ai-generated-image" && node.data?.source === "generated",
  )
  const finalAsset = finalState.assets.find(
    (asset) => asset.name?.startsWith("AI生成-") && asset.metadata?.source === "chat-generated",
  )

  expect(finalNode?.data?.assetId).toBe(finalAsset?.metadata?.assetId)
  expect(errors.consoleErrors).toEqual([])
  expect(errors.pageErrors).toEqual([])
})

test("real provider queue smoke writes first storyboard image back into shot node + asset library", async ({ page }) => {
  test.skip(
    !REAL_UI_QUEUE_IMAGE_SMOKE_ENABLED,
    "set STARCANVAS_REAL_PROVIDER_QUEUE_IMAGE_UI_SMOKE=1 to run real provider queue image UI smoke",
  )
  test.setTimeout(480_000)

  const errors = collectConsoleErrors(page)
  const projectId = createTestProjectId("real-queue-image-writeback")

  await seedRealProviderState(page)
  await seedProjectCanvas(page, projectId, createSingleShotQueueCanvas())
  await gotoCanvas(page, projectId)
  await dismissOnboardingIfPresent(page)

  await page.getByTestId("shot-planning-toggle").click()
  const panel = page.getByTestId("shot-planning-panel")
  await expect(panel).toBeVisible({ timeout: 10_000 })

  await page.getByTestId("shot-planning-generate").click()
  await expect(panel.locator("[data-planning-item]")).toHaveCount(1, { timeout: 10_000 })
  await panel.locator("[data-planning-item]").first().locator("select").selectOption("ready")

  const createQueueBtn = page.getByTestId("shot-planning-create-queue")
  await expect(createQueueBtn).toBeEnabled({ timeout: 10_000 })
  await createQueueBtn.click()
  await page.getByTestId("shot-planning-close").click()
  await expect(panel).not.toBeVisible({ timeout: 5_000 })

  const queuePanel = page.getByTestId("production-run-queue-panel")
  const startButton = page.getByTestId("production-run-queue-start")
  await expect(queuePanel).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId("production-provider-open-settings")).toBeVisible({ timeout: 10_000 })
  await page.getByTestId("production-provider-open-settings").click()
  await expect(page.getByTestId("provider-settings-save")).toBeVisible({ timeout: 5_000 })
  await page.getByTestId("provider-settings-save").click()
  await expect(startButton).toBeEnabled({ timeout: 15_000 })

  await startButton.click()
  await expect(page.getByTestId("production-run-queue-status")).toContainText("运行中", { timeout: 20_000 })

  await expect
    .poll(async () => {
      const state = await getE2EState(page)
      const shotNode = state.nodes.find((node) => node.id === "e2e-real-queue-shot-1")
      const generatedImageNodeId = shotNode?.data?.shot?.generatedImageNodeId
      const generatedImageAssetId = shotNode?.data?.shot?.generatedImageAssetId
      const generatedImageNode = state.nodes.find((node) => node.id === generatedImageNodeId)
      const generatedAsset = state.assets.find(
        (asset) => asset.id === generatedImageAssetId || asset.metadata?.assetId === generatedImageAssetId,
      )

      return {
        shotImageLinked: Boolean(generatedImageNodeId && generatedImageAssetId),
        imageNodePresent: Boolean(
          generatedImageNode &&
            generatedImageNode.data?.nodeKind === "ai-generated-image" &&
            generatedImageNode.data?.assetId === generatedImageAssetId,
        ),
        assetPresent: Boolean(generatedAsset),
      }
    }, {
      timeout: 360_000,
      message: "real production queue should write first storyboard image back into the shot node and asset library",
    })
    .toEqual({
      shotImageLinked: true,
      imageNodePresent: true,
      assetPresent: true,
    })

  expect(errors.pageErrors).toEqual([])
})

test("browser fallback prompt can rerun into a generated image", async ({ page, context }) => {
  test.setTimeout(180_000)
  const errors = collectConsoleErrors(page)
  const projectId = createTestProjectId("auto-agent-fallback-rerun")
  let imageRequests = 0

  await page.addInitScript(() => {
    window.localStorage.clear()
    localStorage.setItem("startrails_use_mock", "true")
  })

  await context.route("**/api/ai/chat/stream", async (route) => {
    const body = route.request().postDataJSON() as { context?: { systemOverride?: string } }
    const isIntentDetection = Boolean(body.context?.systemOverride?.includes("Auto Agent"))
    const payload = isIntentDetection
      ? JSON.stringify({
          content: JSON.stringify({
            intent: "generate-image",
            params: { prompt: "雨夜旧影院电影感剧照", aspectRatio: "1:1" },
            description: "生成图片",
            confidence: 0.95,
          }),
        })
      : JSON.stringify({ content: "普通聊天兜底不应该被触发" })

    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: `data: ${payload}\n\ndata: [DONE]\n\n`,
    })
  })

  await context.route("**/api/ai/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        baseUrl: "https://e2e.invalid/v1",
        hasApiKey: true,
        defaultModel: "e2e-text-model",
        defaultImageModel: "gpt-image-2",
        videoModel: "vidu",
        timeoutMs: 120000,
      }),
    })
  })

  await context.route("**/api/ai/generate-image", async (route) => {
    imageRequests += 1
    if (imageRequests === 1) {
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({
          requestId: "e2e-auto-agent-image-timeout",
          attempts: 1,
          error: {
            code: "PROVIDER_TIMEOUT",
            userMessage: "图片生成超时，请稍后重试。",
            detail: "上游服务返回 524 A Timeout Occurred，当前 provider 暂时未完成出图。",
            retryable: true,
          },
        }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        imageUrl: MOCK_IMAGE,
        model: "gpt-image-2",
        prompt: "雨夜旧影院电影感剧照",
        revisedPrompt: "雨夜旧影院电影感剧照",
      }),
    })
  })

  await gotoCanvas(page, projectId)
  await dismissOnboardingIfPresent(page)
  await page.getByTestId("chat-toggle").click()
  const chatInput = page.getByTestId("chat-input")
  await expect(chatInput).toBeVisible()
  await chatInput.fill("来一张雨夜旧影院的电影感剧照")
  await chatInput.press("Enter")

  await expect(page.getByText(/图片生成超时，请稍后重试/)).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/可重试 Prompt 节点/)).toBeVisible({ timeout: 10_000 })

  let promptNodeId: string | null = null
  await expect.poll(async () => {
    const state = await getE2EState(page)
    const promptNode = state.nodes.find(
      (node) => node.data?.nodeKind === "prompt" && node.data?.title === "概念图待重试 Prompt",
    )
    promptNodeId = promptNode?.id ?? null
    return promptNodeId
  }, { timeout: 15_000 }).toBeTruthy()

  const promptNode = page.locator(`[data-id='${String(promptNodeId)}']`)
  await expect(promptNode).toBeVisible({ timeout: 15_000 })
  await promptNode.click({ button: "right" })
  await page.getByText("运行当前节点").click()
  await expect.poll(() => imageRequests, { timeout: 15_000 }).toBe(2)

  await expect.poll(async () => {
    const state = await getE2EState(page)
    const generatedNode = state.nodes.find(
      (node) => node.data?.nodeKind === "ai-generated-image" && node.data?.source === "generated",
    )
    const restoredPromptNode = state.nodes.find((node) => node.id === String(promptNodeId))
    return {
      generatedAssetId: generatedNode?.data?.assetId ?? null,
      generatedNodeKind: generatedNode?.data?.nodeKind ?? null,
      generatedNodeSource: generatedNode?.data?.source ?? null,
      promptStillDeferred: restoredPromptNode?.data?.imageGenerationDeferred ?? null,
    }
  }, { timeout: 15_000 }).toMatchObject({
    generatedAssetId: expect.any(String),
    generatedNodeKind: "ai-generated-image",
    generatedNodeSource: "generated",
    promptStillDeferred: false,
  })

  const unexpectedConsoleErrors = errors.consoleErrors.filter(
    (entry) => !entry.text.includes("HTTP 502: http://127.0.0.1:3172/api/ai/generate-image"),
  )
  expect(unexpectedConsoleErrors).toEqual([])
  expect(errors.pageErrors).toEqual([])
})
