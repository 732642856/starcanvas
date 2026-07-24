import { expect, test, type Page } from "@playwright/test"

import { gotoCanvas, waitForCanvasReady } from "./utils"
import { createTestProjectId } from "./utils/project"

type ChatStreamRequest = {
  message?: string
  model?: string
  context?: Record<string, unknown>
}

function streamText(content: string): string {
  return `data: ${JSON.stringify({ content })}\n\ndata: [DONE]\n\n`
}

async function readClarificationStorage(page: Page) {
  return page.evaluate(() => ({
    href: window.location.href,
    sessionKeys: Object.keys(window.sessionStorage),
    currentConversationEntries: Object.entries(window.sessionStorage).filter(([key]) =>
      key.includes("chat-current-conversation"),
    ),
    pendingClarificationEntries: Object.entries(window.sessionStorage).filter(([key]) =>
      key.includes("pending-clarification"),
    ),
  }))
}

async function waitForE2EBridge(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          () => Boolean((window as Window & { __starcanvasE2E?: unknown }).__starcanvasE2E),
        ),
      { timeout: 30_000 },
    )
    .toBe(true)
}

async function openChatPanel(page: Page): Promise<void> {
  await waitForE2EBridge(page)
  const panel = page.getByTestId("chat-panel")
  if (await panel.isVisible().catch(() => false)) {
    await expect(page.getByTestId("chat-input")).toBeVisible({ timeout: 15_000 })
    return
  }

  const floatingOpenButton = page.getByRole("button", { name: "打开星轨Ai" })
  if (await floatingOpenButton.isVisible().catch(() => false)) {
    await floatingOpenButton.click()
  } else {
    await page.getByTestId("chat-toggle").click()
  }

  await expect(panel).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId("chat-input")).toBeVisible({ timeout: 15_000 })
}

async function mockAutoAgentClarificationResume(page: Page, requests: ChatStreamRequest[]): Promise<void> {
  await page.route("**/api/ai/chat/stream", async (route) => {
    const requestBody = route.request().postDataJSON() as ChatStreamRequest
    requests.push(requestBody)

    const isIntentDetection = Boolean(
      (requestBody.context as { systemOverride?: string } | undefined)?.systemOverride?.includes("Auto Agent"),
    )

    if (!isIntentDetection) {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream; charset=utf-8",
        body: streamText("普通聊天兜底不应该在这条 Auto Agent 主链路里被触发。"),
      })
      return
    }

    const resumedFromClarification = requestBody.message?.includes("【用户正在回答上一轮澄清问题】")

    if (!resumedFromClarification) {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream; charset=utf-8",
        body: streamText(JSON.stringify({
          intent: "chat",
          params: { topic: "雨夜旧影院重逢短片创意" },
          description: "低置信度创作请求，先进入澄清",
          confidence: 0.4,
        })),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: "text/event-stream; charset=utf-8",
      body: streamText(JSON.stringify({
        intent: "extract-production-assets",
        params: {
          script: "雨夜旧影院里两个人重逢，拆成一个可继续生产的短片项目结构。",
          goal: "一句话创意制作资产拆解",
          genre: "剧情短片",
          style: "cinematic visual bible",
          targetPlatform: "short-drama",
        },
        description: "继续生成项目圣经与制作资产结构",
        confidence: 0.96,
      })),
    })
  })
}

test("auto agent clarification survives refresh and resumes into a project skeleton", async ({ page }) => {
  const requests: ChatStreamRequest[] = []
  const projectId = createTestProjectId("chat-clarification-resume")

  await mockAutoAgentClarificationResume(page, requests)
  await gotoCanvas(page, projectId)
  await openChatPanel(page)

  const panel = page.getByTestId("chat-panel")
  const input = page.getByTestId("chat-input")
  await expect(input).toBeVisible()
  await input.fill("帮我把这个想法做成短片：雨夜旧影院里两个人重逢。")
  await input.press("Enter")

  await expect(panel).toContainText("我先确认一下创作方向", { timeout: 20_000 })
  await expect(panel).toContainText("需要澄清：你想先走哪条主路径", { timeout: 20_000 })
  await expect(panel).toContainText("导演/叙事风格", { timeout: 20_000 })
  await panel.getByRole("button", { name: "执行 1 个操作" }).click()

  await page.reload({ waitUntil: "domcontentloaded" })
  await waitForCanvasReady(page)
  const clarificationStorage = await readClarificationStorage(page)
  expect(clarificationStorage.pendingClarificationEntries.length).toBeGreaterThan(0)
  await openChatPanel(page)

  const reloadedPanel = page.getByTestId("chat-panel")
  await expect(reloadedPanel.getByTestId("pending-clarification-banner")).toContainText(
    "你想先走哪条主路径？",
  )
  await reloadedPanel.getByRole("button", { name: "拆成制作圣经" }).click()

  const reloadedInput = page.getByTestId("chat-input")
  await expect(reloadedInput).toHaveValue("拆成制作圣经")
  await reloadedInput.fill("拆成制作圣经，竖屏 9:16，节奏偏剧情短片。")
  await reloadedInput.press("Enter")

  await expect.poll(() => requests.length, { timeout: 20_000 }).toBe(2)

  expect(requests[0].message).toContain("帮我把这个想法做成短片：雨夜旧影院里两个人重逢。")
  expect(requests[1].message).toContain("【用户正在回答上一轮澄清问题】")
  expect(requests[1].message).toContain("澄清ID：auto-agent-creative-")
  expect(requests[1].message).toContain("线程ID：")
  expect(requests[1].message).toContain("问题：你想先走哪条主路径？")
  expect(requests[1].message).toContain("导演/叙事风格")
  expect(requests[1].message).toContain("这场戏的故事功能")
  expect(requests[1].message).toContain("希望观众感受到的情绪")
  expect(requests[1].message).toContain("用户回答：拆成制作圣经，竖屏 9:16，节奏偏剧情短片。")

  await expect(reloadedPanel).toContainText("即将执行以下画布操作", { timeout: 20_000 })
  await reloadedPanel.getByRole("button", { name: /执行 \d+ 个操作/ }).click()

  await expect(reloadedPanel.getByText(/已执行 \d+ 个操作/)).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId("project-bible-panel")).toBeVisible({ timeout: 20_000 })
  await expect(page.locator(".react-flow__node").filter({ hasText: "# Project Bible / 制作圣经总览" })).toBeVisible({
    timeout: 20_000,
  })
  await expect(page.locator(".react-flow__node").filter({ hasText: "角色资产 Bible" }).first()).toBeVisible({
    timeout: 20_000,
  })
  await expect(page.locator(".react-flow__node").filter({ hasText: "场景资产 Bible" }).first()).toBeVisible({
    timeout: 20_000,
  })
  await expect(page.locator(".react-flow__node").filter({ hasText: "分镜拆解任务" }).first()).toBeVisible({
    timeout: 20_000,
  })
})
