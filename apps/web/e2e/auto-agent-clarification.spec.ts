import { expect, test } from "@playwright/test"

import { gotoCanvas } from "./utils"

const MOCK_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="

const MOCK_VIDEO =
  "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22320%22%20height%3D%22180%22%3E%3Crect%20width%3D%22320%22%20height%3D%22180%22%20fill%3D%22%231a1a2e%22/%3E%3Ctext%20x%3D%22160%22%20y%3D%2290%22%20text-anchor%3D%22middle%22%20fill%3D%22%23fff%22%3EMock%20Video%3C/text%3E%3C/svg%3E"

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

  const chatInput = page.getByTestId("chat-input")
  await expect(chatInput).toBeVisible()
  await chatInput.fill("帮我把这个想法做成一个短片：雨夜里，女主林雾回到废弃电影院，男主周祁在放映室等她。")
  await chatInput.press("Enter")

  await expect(page.getByText("我先确认一下创作方向")).toBeVisible()
  await expect(page.getByText(/需要澄清：你想把它推进到哪一步/)).toBeVisible()
  await expect(page.getByRole("button", { name: "生成分镜" })).toBeVisible()
  await expect(page.getByRole("button", { name: "拆成制作圣经" })).toBeVisible()
  await expect(page.getByText("执行 1 个操作")).toBeVisible()
  expect(chatStreamCalls).toBe(1)

  await page.getByRole("button", { name: "生成分镜" }).click()

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

test("clarification answer can create a production bible project skeleton", async ({ page }) => {
  let chatStreamCalls = 0

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

  await gotoCanvas(page, "auto-agent-production-bible")
  await page.getByTestId("chat-toggle").click()

  const chatInput = page.getByTestId("chat-input")
  await expect(chatInput).toBeVisible()
  await chatInput.fill("帮我把这个想法做成一个短片：雨夜里，女主林雾回到废弃电影院，男主周祁在放映室等她。")
  await chatInput.press("Enter")

  await expect(page.getByText("我先确认一下创作方向")).toBeVisible()
  await page.getByRole("button", { name: "拆成制作圣经" }).click()

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
  expect(chatStreamCalls).toBe(1)
})
