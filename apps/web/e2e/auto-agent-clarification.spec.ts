import { expect, test, type Page } from "@playwright/test"

import { dismissOnboardingIfPresent, gotoCanvas, waitForCanvasSave } from "./utils"

const MOCK_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="

const MOCK_VIDEO =
  "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22320%22%20height%3D%22180%22%3E%3Crect%20width%3D%22320%22%20height%3D%22180%22%20fill%3D%22%231a1a2e%22/%3E%3Ctext%20x%3D%22160%22%20y%3D%2290%22%20text-anchor%3D%22middle%22%20fill%3D%22%23fff%22%3EMock%20Video%3C/text%3E%3C/svg%3E"

async function getE2EState(page: Page): Promise<{
  assets: Array<{ id?: string; name?: string; metadata?: { source?: string; assetId?: string } }>
  nodes: Array<{ id?: string; data?: { title?: string; nodeKind?: string; source?: string; assetId?: string; prompt?: string; sourcePromptId?: string } }>
}> {
  return page.evaluate(() => {
    const e2e = (window as Window & {
      __starcanvasE2E?: {
        getAssets: () => Array<{ id?: string; name?: string; metadata?: { source?: string; assetId?: string } }>
        getNodes: () => Array<{ id?: string; data?: { title?: string; nodeKind?: string; source?: string; assetId?: string; prompt?: string; sourcePromptId?: string } }>
      }
    }).__starcanvasE2E
    if (!e2e) throw new Error("__starcanvasE2E bridge is unavailable")
    return {
      assets: e2e.getAssets(),
      nodes: e2e.getNodes(),
    }
  })
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear()
    localStorage.setItem("startrails_use_mock", "true")
  })
})

test("vague creative chat asks for clarification instead of falling back to plain chat", async ({ page }) => {
  let chatStreamCalls = 0
  let imageRequests = 0

  await page.route("**/api/ai/chat/stream", async (route) => {
    chatStreamCalls += 1
    const body = route.request().postDataJSON() as { context?: { systemOverride?: string } }
    const isIntentDetection = Boolean(body.context?.systemOverride?.includes("Auto Agent"))
    const payload = isIntentDetection
      ? JSON.stringify({
          content: JSON.stringify({
            intent: "chat",
            params: { topic: "雨夜旧影院重逢短片创意" },
            description: "低置信度普通聊天",
            confidence: 0.4,
          }),
        })
      : JSON.stringify({ content: "普通聊天兜底不应该被触发" })

    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: `data: ${payload}\n\ndata: [DONE]\n\n`,
    })
  })

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
    imageRequests += 1
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ imageUrl: MOCK_IMAGE, requestId: "e2e-auto-agent-image" }),
    })
  })

  await page.route("**/api/ai/generate-video-vidu", async (route) => {
    const sseBody = [
      "event: progress\ndata: " + JSON.stringify({ stage: "queued", percent: 10, message: "queued" }) + "\n\n",
      "event: result\ndata: " + JSON.stringify({ videoUrl: MOCK_VIDEO, taskId: "e2e-auto-agent-video" }) + "\n\n",
    ].join("")
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: sseBody,
    })
  })

  await gotoCanvas(page, "auto-agent-clarification")
  await page.getByTestId("chat-toggle").click()
  const chatPanel = page.getByTestId("chat-panel")

  const chatInput = page.getByTestId("chat-input")
  await expect(chatInput).toBeVisible()
  await chatInput.fill("帮我把这个想法做成一个短片：雨夜里，女主林雾回到废弃电影院，男主周祁在放映室等她。")
  await chatInput.press("Enter")

  await expect(page.getByText("我先确认一下创作方向")).toBeVisible()
  await expect(page.getByText(/需要澄清：你想先走哪条主路径/)).toBeVisible()
  await expect(page.getByText(/导演\/叙事风格/)).toBeVisible()
  await expect(chatPanel.getByRole("button", { name: "生成分镜" })).toBeVisible()
  await expect(chatPanel.getByRole("button", { name: "拆成制作圣经" })).toBeVisible()
  await expect(page.getByText("执行 1 个操作")).toBeVisible()
  expect(chatStreamCalls).toBe(1)

  await chatPanel.getByRole("button", { name: "生成分镜" }).click()

  await expect(page.getByText("已选择：生成分镜")).toBeVisible()
  await expect(page.getByText(/已执行 3 个操作/)).toBeVisible()
  await expect(page.locator(".react-flow__node").filter({ hasText: "林雾" }).first()).toBeVisible({
    timeout: 10_000,
  })
  await expect(page.locator(".react-flow__node").filter({ hasText: "镜头 01" }).first()).toBeVisible({
    timeout: 10_000,
  })
  await expect(page.getByTestId("production-run-queue-toggle")).toContainText("生产队列", { timeout: 10_000 })
  await expect(page.getByTestId("production-run-queue-panel")).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId("production-preflight-summary")).toContainText("0 阻塞", { timeout: 10_000 })
  await expect(page.getByTestId("production-run-queue-start")).toBeEnabled({ timeout: 10_000 })

  await page.getByTestId("production-run-queue-start").click()
  await expect(page.getByText("生产任务执行中")).toBeVisible({ timeout: 10_000 })
  await expect.poll(() => imageRequests, { timeout: 15_000 }).toBeGreaterThanOrEqual(1)
  await expect(page.getByTestId("production-run-queue-progress")).toContainText("完成", { timeout: 30_000 })
})

test("stale failed real smoke blocks auto-agent image generation until settings save clears it", async ({ page }) => {
  let chatStreamCalls = 0
  let imageRequests = 0

  await page.route("**/api/ai/chat/stream", async (route) => {
    chatStreamCalls += 1
    const payload = JSON.stringify({
      content: JSON.stringify({
        intent: "generate-image",
        params: { prompt: "雨夜旧影院电影感剧照", aspectRatio: "1:1" },
        description: "生成图片",
        confidence: 0.95,
      }),
    })
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: `data: ${payload}\n\ndata: [DONE]\n\n`,
    })
  })

  await page.route("**/api/ai/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        baseUrl: "https://relay.example/v1",
        hasApiKey: true,
        defaultModel: "e2e-text-model",
        defaultImageModel: "e2e-image-model",
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

  await page.route("**/api/ai/generate-image", async (route) => {
    imageRequests += 1
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ imageUrl: MOCK_IMAGE, requestId: "e2e-auto-agent-image-after-clear" }),
    })
  })

  await gotoCanvas(page, "auto-agent-image-smoke-unblock")
  await page.evaluate(() => {
    window.localStorage.setItem(
      "startrails_provider_real_smoke_results",
      JSON.stringify({
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
      }),
    )
  })

  await page.getByTestId("chat-toggle").click()
  const chatInput = page.getByTestId("chat-input")
  await expect(chatInput).toBeVisible()

  await chatInput.fill("来一张雨夜旧影院的电影感剧照")
  await chatInput.press("Enter")

  await expect(page.getByText(/最近一次真实生图 smoke 失败：请求超时/)).toBeVisible()
  expect(imageRequests).toBe(0)

  await page.getByRole("button", { name: /模型设置/ }).click()
  await expect(page.getByTestId("provider-settings-save")).toBeVisible({ timeout: 5_000 })
  await page.getByTestId("provider-settings-save").click()

  if (!(await chatInput.isVisible().catch(() => false))) {
    await page.getByTestId("chat-toggle").click()
  }
  await expect(chatInput).toBeVisible()
  await chatInput.fill("来一张雨夜旧影院的电影感剧照")
  await chatInput.press("Enter")

  await expect(page.getByText("图片已生成，已自动添加到画布继续迭代。")).toBeVisible({ timeout: 10_000 })
  await expect.poll(async () => {
    const state = await getE2EState(page)
    return {
      generatedAssets: state.assets.filter((asset) =>
        asset.name?.startsWith("AI生成-") && asset.metadata?.source === "chat-generated"
      ).length,
      generatedNodes: state.nodes.filter((node) =>
        node.data?.nodeKind === "ai-generated-image" &&
        node.data?.source === "generated"
      ).length,
    }
  }).toEqual({
    generatedAssets: 1,
    generatedNodes: 1,
  })
  expect(chatStreamCalls).toBe(2)
  expect(imageRequests).toBe(1)
})

test("auto-agent generated image survives reload and can rerun reverse-prompt", async ({ page, context }) => {
  test.setTimeout(180_000)
  const projectId = "auto-agent-image-reload-reconsume"
  const reversePromptRequests: Array<Record<string, unknown>> = []

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
        defaultImageModel: "e2e-image-model",
        timeoutMs: 120000,
      }),
    })
  })

  await context.route("**/api/ai/generate-image", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ imageUrl: MOCK_IMAGE, requestId: "e2e-auto-agent-image-reload" }),
    })
  })

  await context.route("**/api/ai/reverse-prompt", async (route) => {
    reversePromptRequests.push(route.request().postDataJSON() as Record<string, unknown>)
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        prompt: "cinematic macro shot of a glowing pearl on black velvet",
        negativePrompt: "text, watermark, blurry",
        qualityScore: 0.88,
        language: "en",
      }),
    })
  })

  await gotoCanvas(page, projectId)
  await page.getByTestId("chat-toggle").click()
  const chatInput = page.getByTestId("chat-input")
  await expect(chatInput).toBeVisible()
  await chatInput.fill("来一张雨夜旧影院的电影感剧照")
  await chatInput.press("Enter")

  await expect(page.getByText("图片已生成，已自动添加到画布继续迭代。")).toBeVisible({ timeout: 10_000 })
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
    }, { timeout: 15_000 })
    .toMatchObject({
      nodeId: expect.any(String),
      nodeAssetId: expect.any(String),
      assetId: expect.any(String),
    })

  const initialState = await getE2EState(page)
  const generatedNode = initialState.nodes.find(
    (node) => node.data?.nodeKind === "ai-generated-image" && node.data?.source === "generated",
  )
  const generatedAsset = initialState.assets.find(
    (asset) => asset.name?.startsWith("AI生成-") && asset.metadata?.source === "chat-generated",
  )

  expect(generatedNode?.data?.assetId).toBeTruthy()
  expect(generatedAsset?.metadata?.assetId).toBe(generatedNode?.data?.assetId)

  await waitForCanvasSave(page)

  const restoredPage = await context.newPage()
  await gotoCanvas(restoredPage, projectId)
  await dismissOnboardingIfPresent(restoredPage)

  await expect
    .poll(async () => {
      const state = await getE2EState(restoredPage)
      const restoredGeneratedNode = state.nodes.find(
        (node) => node.data?.nodeKind === "ai-generated-image" && node.data?.source === "generated",
      )
      const restoredGeneratedAsset = state.assets.find(
        (asset) => asset.name?.startsWith("AI生成-") && asset.metadata?.source === "chat-generated",
      )
      return {
        nodeId: restoredGeneratedNode?.id ?? null,
        nodeAssetId: restoredGeneratedNode?.data?.assetId ?? null,
        assetId: restoredGeneratedAsset?.metadata?.assetId ?? null,
      }
    }, { timeout: 30_000 })
    .toMatchObject({
      nodeId: expect.any(String),
      nodeAssetId: generatedNode?.data?.assetId,
      assetId: generatedAsset?.metadata?.assetId,
    })

  const restoredCanvasState = await getE2EState(restoredPage)
  const restoredGeneratedNode = restoredCanvasState.nodes.find(
    (node) => node.data?.nodeKind === "ai-generated-image" && node.data?.source === "generated",
  )
  expect(restoredGeneratedNode?.id).toBeTruthy()

  const restoredNodeLocator = restoredPage.locator(`[data-id='${restoredGeneratedNode?.id}']`)
  await expect(restoredNodeLocator).toBeVisible({ timeout: 15_000 })
  await restoredNodeLocator.getByTestId("image-node-reverse-prompt").click()

  await expect.poll(() => reversePromptRequests.length, { timeout: 15_000 }).toBe(1)
  expect(reversePromptRequests[0]?.assetId).toBe(generatedNode?.data?.assetId)

  await expect
    .poll(async () => {
      const state = await getE2EState(restoredPage)
      return state.nodes.find(
        (node) =>
          node.data?.nodeKind === "prompt" &&
          node.data?.sourcePromptId === restoredGeneratedNode?.id &&
          node.data?.prompt === "cinematic macro shot of a glowing pearl on black velvet",
      )?.id ?? null
    }, { timeout: 15_000 })
    .toEqual(expect.any(String))

  await restoredPage.close()
})

test("auto-agent generated image survives reload and can be re-added from asset library for reverse-prompt", async ({ page, context }) => {
  test.setTimeout(180_000)
  const projectId = "auto-agent-image-asset-library-roundtrip"
  const reversePromptRequests: Array<Record<string, unknown>> = []

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
        defaultImageModel: "e2e-image-model",
        timeoutMs: 120000,
      }),
    })
  })

  await context.route("**/api/ai/generate-image", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ imageUrl: MOCK_IMAGE, requestId: "e2e-auto-agent-image-asset-library" }),
    })
  })

  await context.route("**/api/ai/reverse-prompt", async (route) => {
    reversePromptRequests.push(route.request().postDataJSON() as Record<string, unknown>)
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        prompt: "cinematic macro shot of a glowing pearl on black velvet",
        negativePrompt: "text, watermark, blurry",
        qualityScore: 0.88,
        language: "en",
      }),
    })
  })

  await gotoCanvas(page, projectId)
  await page.getByTestId("chat-toggle").click()
  const chatInput = page.getByTestId("chat-input")
  await expect(chatInput).toBeVisible()

  await chatInput.fill("来一张雨夜旧影院的电影感剧照")
  await chatInput.press("Enter")

  await expect(page.getByText("图片已生成，已自动添加到画布继续迭代。")).toBeVisible({ timeout: 10_000 })

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
        assetName: generatedAsset?.name ?? null,
      }
    }, { timeout: 15_000 })
    .toMatchObject({
      nodeId: expect.any(String),
      nodeAssetId: expect.any(String),
      assetId: expect.any(String),
      assetName: expect.stringMatching(/^AI生成-/),
    })

  await waitForCanvasSave(page)

  const restoredPage = await context.newPage()
  await gotoCanvas(restoredPage, projectId)
  await dismissOnboardingIfPresent(restoredPage)

  await expect
    .poll(async () => {
      const state = await getE2EState(restoredPage)
      const generatedNode = state.nodes.find(
        (node) => node.data?.nodeKind === "ai-generated-image" && node.data?.source === "generated",
      )
      const generatedAsset = state.assets.find(
        (asset) => asset.name?.startsWith("AI生成-") && asset.metadata?.source === "chat-generated",
      )

      return {
        nodeId: generatedNode?.id ?? null,
        assetId: generatedAsset?.metadata?.assetId ?? null,
        assetName: generatedAsset?.name ?? null,
      }
    }, { timeout: 15_000 })
    .toMatchObject({
      nodeId: expect.any(String),
      assetId: expect.any(String),
      assetName: expect.stringMatching(/^AI生成-/),
    })

  const restoredState = await getE2EState(restoredPage)
  const restoredGeneratedAsset = restoredState.assets.find(
    (asset) => asset.name?.startsWith("AI生成-") && asset.metadata?.source === "chat-generated",
  )

  expect(restoredGeneratedAsset?.metadata?.assetId).toEqual(expect.any(String))
  expect(restoredGeneratedAsset?.name).toEqual(expect.stringMatching(/^AI生成-/))

  await restoredPage.getByTitle("素材库").click()
  await expect(restoredPage.getByRole("heading", { name: "素材库" })).toBeVisible({ timeout: 15_000 })
  await restoredPage.getByText(restoredGeneratedAsset?.name ?? "", { exact: true }).click()

  await expect
    .poll(async () => {
      const state = await getE2EState(restoredPage)
      const sameAssetNodes = state.nodes.filter(
        (node) => node.data?.assetId === restoredGeneratedAsset?.metadata?.assetId,
      )
      return {
        sameAssetNodes: sameAssetNodes.length,
        uploadedImageNodes: sameAssetNodes.filter((node) => node.data?.nodeKind === "uploaded-image").length,
      }
    }, { timeout: 15_000 })
    .toEqual({
      sameAssetNodes: 2,
      uploadedImageNodes: 1,
    })

  const readdedState = await getE2EState(restoredPage)
  const readdedNode = readdedState.nodes.find(
    (node) =>
      node.data?.assetId === restoredGeneratedAsset?.metadata?.assetId &&
      node.data?.nodeKind === "uploaded-image",
  )

  expect(readdedNode?.id).toEqual(expect.any(String))

  await restoredPage.locator(`[data-id='${readdedNode?.id}']`).getByTestId("image-node-reverse-prompt").click()

  await expect.poll(() => reversePromptRequests.length, { timeout: 15_000 }).toBe(1)
  expect(reversePromptRequests[0]).toMatchObject({
    assetId: restoredGeneratedAsset?.metadata?.assetId,
  })

  await expect
    .poll(async () => {
      const state = await getE2EState(restoredPage)
      return state.nodes.find(
        (node) =>
          node.data?.nodeKind === "prompt" &&
          node.data?.sourcePromptId === readdedNode?.id &&
          node.data?.prompt === "cinematic macro shot of a glowing pearl on black velvet",
      )?.id ?? null
    }, { timeout: 15_000 })
    .toEqual(expect.any(String))

  await restoredPage.close()
})

test("retryable auto-agent image failures degrade into a prompt node instead of leaving the chat empty-handed", async ({ page, context }) => {
  test.setTimeout(180_000)
  const projectId = "auto-agent-image-timeout-fallback"
  let imageRequests = 0

  await page.addInitScript(() => {
    window.localStorage.setItem("startrails_use_mock", "false")
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
        defaultImageModel: "e2e-image-model",
        timeoutMs: 120000,
      }),
    })
  })

  await context.route("**/api/ai/generate-image", async (route) => {
    imageRequests += 1
    await route.fulfill({
      status: 524,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        requestId: "e2e-auto-agent-image-timeout",
        attempts: 2,
        error: {
          code: "PROVIDER_TIMEOUT",
          userMessage: "图片生成超时，请稍后重试。",
          detail: "上游服务返回 524 A Timeout Occurred，当前 provider 暂时未完成出图。",
          retryable: true,
          status: 524,
        },
      }),
    })
  })

  await gotoCanvas(page, projectId)
  await page.getByTestId("chat-toggle").click()
  const chatInput = page.getByTestId("chat-input")
  await expect(chatInput).toBeVisible()

  await chatInput.fill("来一张雨夜旧影院的电影感剧照")
  await chatInput.press("Enter")

  await expect.poll(() => imageRequests, { timeout: 10_000 }).toBe(1)
  await expect(page.getByText(/结果未知：上游可能已接受本次图片任务/)).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/先检查资产和账单/)).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/可重试 Prompt 节点/)).toBeVisible({ timeout: 10_000 })

  await expect
    .poll(async () => {
      const state = await getE2EState(page)
      const promptNode = state.nodes.find(
        (node) => node.data?.nodeKind === "prompt" && node.data?.title === "概念图待重试 Prompt",
      )
      const generatedAsset = state.assets.find(
        (asset) => asset.name?.startsWith("AI生成-") && asset.metadata?.source === "chat-generated",
      )
      return {
        prompt: promptNode?.data?.prompt ?? null,
        generatedAssetId: generatedAsset?.metadata?.assetId ?? null,
      }
    }, { timeout: 15_000 })
    .toMatchObject({
      prompt: "雨夜旧影院电影感剧照",
      generatedAssetId: null,
    })

  expect(imageRequests).toBe(1)
})

test("clarification answer can create a production bible skeleton and bridge into shot planning queue", async ({ page }) => {
  let chatStreamCalls = 0
  let imageRequests = 0

  await page.route("**/api/ai/chat/stream", async (route) => {
    chatStreamCalls += 1
    const body = route.request().postDataJSON() as { context?: { systemOverride?: string } }
    const isIntentDetection = Boolean(body.context?.systemOverride?.includes("Auto Agent"))
    const payload = isIntentDetection
      ? JSON.stringify({
          content: JSON.stringify({
            intent: "chat",
            params: { topic: "雨夜旧影院重逢短片创意" },
            description: "低置信度普通聊天",
            confidence: 0.4,
          }),
        })
      : JSON.stringify({ content: "普通聊天兜底不应该被触发" })

    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: `data: ${payload}\n\ndata: [DONE]\n\n`,
    })
  })

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
    imageRequests += 1
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ imageUrl: MOCK_IMAGE, requestId: `e2e-production-bible-${imageRequests}` }),
    })
  })

  await gotoCanvas(page, "auto-agent-production-bible")
  await page.getByTestId("chat-toggle").click()
  const chatPanel = page.getByTestId("chat-panel")

  const chatInput = page.getByTestId("chat-input")
  await expect(chatInput).toBeVisible()
  await chatInput.fill("帮我把这个想法做成一个短片：雨夜里，女主林雾回到废弃电影院，男主周祁在放映室等她。")
  await chatInput.press("Enter")

  await expect(page.getByText("我先确认一下创作方向")).toBeVisible()
  await chatPanel.getByRole("button", { name: "拆成制作圣经" }).click()

  await expect(page.getByText("已选择：拆成制作圣经")).toBeVisible()
  await expect(page.getByText(/已执行 \d+ 个操作/)).toBeVisible()
  await expect(page.getByTestId("project-bible-panel")).toBeVisible({ timeout: 10_000 })
  await expect(page.locator(".react-flow__node").filter({ hasText: "# Project Bible / 制作圣经总览" })).toBeVisible({
    timeout: 10_000,
  })
  await expect(page.locator(".react-flow__node").filter({ hasText: "角色资产 Bible" }).first()).toBeVisible({
    timeout: 10_000,
  })
  await expect(page.locator(".react-flow__node").filter({ hasText: "场景资产 Bible" }).first()).toBeVisible({
    timeout: 10_000,
  })
  await expect(page.locator(".react-flow__node").filter({ hasText: "分镜拆解任务" }).first()).toBeVisible({
    timeout: 10_000,
  })
  const projectBiblePanel = page.getByTestId("project-bible-panel")
  await expect(projectBiblePanel.getByRole("button", { name: /角色 2/ })).toBeVisible({ timeout: 10_000 })
  await expect(projectBiblePanel.getByRole("heading", { name: "林雾" })).toBeVisible({ timeout: 10_000 })
  await expect(projectBiblePanel.getByRole("heading", { name: "周祁" })).toBeVisible({ timeout: 10_000 })

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
  await expect(queuePanel).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId("production-preflight-summary")).toContainText("阻塞", { timeout: 10_000 })
  await expect(page.getByTestId("production-run-queue-start")).toBeEnabled()
  await expect(page.getByTestId("production-run-queue-start")).toContainText("一键开始生产")
  await expect(page.getByTestId("production-run-queue-blocked-action")).toHaveCount(3)
  await page.getByTestId("production-run-queue-start").click()
  await expect(page.getByTestId("production-run-queue-status")).toContainText("运行中", { timeout: 10_000 })
  await expect.poll(() => imageRequests, { timeout: 15_000 }).toBeGreaterThan(0)
  expect(chatStreamCalls).toBe(1)
})
