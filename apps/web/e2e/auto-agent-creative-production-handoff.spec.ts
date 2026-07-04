import { expect, test, type Page } from "@playwright/test"
import JSZip from "jszip"
import { readFile } from "node:fs/promises"

import { collectConsoleErrors, dismissOnboardingIfPresent, gotoCanvas, waitForCanvasReady } from "./utils"

type ChatStreamRequest = {
  message?: string
  model?: string
  context?: Record<string, unknown>
}

function streamText(content: string): string {
  return `data: ${JSON.stringify({ content })}\n\ndata: [DONE]\n\n`
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

async function openQueue(page: Page) {
  await page.keyboard.press("Escape")
  await page.waitForTimeout(200)
  await page.getByTestId("production-run-queue-toggle").click({ force: true })
  await expect(page.getByTestId("production-run-queue-panel")).toBeVisible({ timeout: 10_000 })
}

async function openExportPreflight(page: Page) {
  await page.getByTestId("export-dropdown-toggle").click()
  await page.getByRole("button", { name: "剪映兼容包 (ZIP)" }).click()
  await expect(page.getByText("导出预检")).toBeVisible({ timeout: 15_000 })
}

test.describe("Auto Agent creative -> production handoff", () => {
  test("can resume clarification after reload, continue to production, and export Jianying handoff", async ({ page }) => {
    test.setTimeout(240_000)
    const errors = collectConsoleErrors(page)
    const requests: ChatStreamRequest[] = []
    let imageRequests = 0

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
          intent: "generate-storyboard",
          params: {
            script: [
              "镜头 1",
              "画面内容：雨夜中，林雾走进废弃电影院门厅，霓虹倒影摇晃。",
              "景别：全景",
              "运镜：缓慢推进",
            ].join("\n"),
            genre: "剧情短片",
            style: "黑色电影",
          },
          description: "继续生成可直接进入生产队列的分镜草案",
          confidence: 0.91,
        })),
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
        body: JSON.stringify({
          imageUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
          requestId: `e2e-auto-agent-image-${imageRequests}`,
        }),
      })
    })

    await page.route("**/api/ai/generate-video-vidu", async (route) => {
      const sseBody = [
        "event: progress\ndata: " + JSON.stringify({ stage: "queued", percent: 10, message: "queued" }) + "\n\n",
        "event: result\ndata: " + JSON.stringify({
          videoUrl: "data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc282bXA0MQAAAAhmcmVlAAAAGm1kYXQAAAGzABAHAAABthDAAAAAAAA=",
          taskId: "e2e-auto-agent-video",
        }) + "\n\n",
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
          body: JSON.stringify({ event_id: "e2e-auto-agent-tts-event" }),
        })
        return
      }
      await route.fallback()
    })

    await page.route("**/k2-fsa-omnivoice.hf.space/call/generate/e2e-auto-agent-tts-event", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          stage: "complete",
          output: {
            data: [{ url: "/file=/tmp/e2e-auto-agent-tts.wav", name: "e2e-auto-agent-tts.wav" }],
          },
        }),
      })
    })

    await page.route("**/k2-fsa-omnivoice.hf.space/file=/tmp/e2e-auto-agent-tts.wav", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "audio/wav",
        body: Buffer.from(
          "UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=",
          "base64",
        ),
      })
    })

    await gotoCanvas(page, "auto-agent-creative-production-handoff")
    await dismissOnboardingIfPresent(page)
    await page.evaluate(() => {
      window.localStorage.clear()
      window.sessionStorage.clear()
      window.localStorage.setItem("startrails_use_mock", "true")
    })
    await gotoCanvas(page, "auto-agent-creative-production-handoff")
    await dismissOnboardingIfPresent(page)
    await openChatPanel(page)

    const panel = page.getByTestId("chat-panel")
    const input = page.getByTestId("chat-input")
    await input.fill("帮我把这个想法做成短片：雨夜旧影院里两个人重逢。")
    await input.press("Enter")

    await expect(panel).toContainText("我先确认一下创作方向", { timeout: 20_000 })
    await expect(panel).toContainText("需要澄清：你想把它推进到哪一步", { timeout: 20_000 })
    await panel.getByRole("button", { name: "执行 1 个操作" }).click()

    await page.reload({ waitUntil: "domcontentloaded" })
    await waitForCanvasReady(page)
    await dismissOnboardingIfPresent(page)
    await openChatPanel(page)

    const reloadedPanel = page.getByTestId("chat-panel")
    await expect(reloadedPanel.getByTestId("pending-clarification-banner")).toContainText("你想把它推进到哪一步？")
    await reloadedPanel.getByRole("button", { name: "生成分镜" }).click()

    const reloadedInput = page.getByTestId("chat-input")
    await expect(reloadedInput).toHaveValue("生成分镜")
    await reloadedInput.fill("生成分镜，竖屏 9:16，直接进入生产。")
    await reloadedInput.press("Enter")

    await expect.poll(() => requests.length, { timeout: 20_000 }).toBe(2)
    await expect(reloadedPanel).toContainText("即将执行以下画布操作", { timeout: 20_000 })
    await reloadedPanel.getByRole("button", { name: /执行 \d+ 个操作/ }).click()

    await expect(reloadedPanel.getByText(/已执行 \d+ 个操作/)).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId("production-run-queue-panel")).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId("production-preflight-summary")).toContainText("0 阻塞", { timeout: 20_000 })
    await expect(page.getByTestId("production-run-queue-start")).toBeEnabled({ timeout: 20_000 })

    await page.getByTestId("production-run-queue-start").click()
    await expect(page.getByTestId("production-run-queue-status")).toContainText("已完成", { timeout: 60_000 })
    await expect(page.getByTestId("production-run-queue-progress")).toContainText("完成", { timeout: 60_000 })
    await expect.poll(() => imageRequests, { timeout: 20_000 }).toBeGreaterThanOrEqual(1)

    await openExportPreflight(page)
    const downloadPromise = page.waitForEvent("download")
    await page.getByRole("button", { name: /导出 ZIP 兼容包|仍导出/ }).click()

    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe("星轨画布导出_JianYingCompatible.zip")
    const filePath = await download.path()
    if (!filePath) {
      throw new Error("zip download path unavailable")
    }

    const zipBuffer = await readFile(filePath)
    const zip = await JSZip.loadAsync(zipBuffer)
    const entryNames = Object.keys(zip.files).sort()

    expect(entryNames).toContain("JianYingCompatible/README.txt")
    expect(entryNames).toContain("JianYingCompatible/subtitles.srt")
    expect(entryNames).toContain("JianYingCompatible/draft_content.json")
    await expect(page.getByText("导出成功")).toBeVisible({ timeout: 15_000 })

    expect(errors.pageErrors).toEqual([])
    expect(errors.consoleErrors).toEqual([])
  })
})
