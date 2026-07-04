import { expect, test, type Page } from "@playwright/test"
import JSZip from "jszip"
import { readFile } from "node:fs/promises"

import {
  collectConsoleErrors,
  dismissOnboardingIfPresent,
  gotoCanvas,
} from "./utils"
import { createTestProjectId } from "./utils/project"

type StoredCanvas = {
  version: number
  savedAt: number
  nodes: Array<Record<string, any>>
  edges: Array<Record<string, any>>
}

type StarCanvasE2EBridge = {
  getNodes: () => Array<{ data: Record<string, any> }>
}

const MOCK_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
const MOCK_AUDIO =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA="
const MOCK_VIDEO =
  "data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc282bXA0MQAAAAhmcmVlAAAAGm1kYXQAAAGzABAHAAABthDAAAAAAAA="

function createStoredCanvas(): StoredCanvas {
  const sourceId = "e2e-prje-source"
  const shotIds = ["e2e-prje-shot-1", "e2e-prje-shot-2", "e2e-prje-shot-3"]

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
          title: "E2E 生产队列剪映交接测试",
          nodeKind: "storyboard",
          content: "三镜头短剧：测试生产完成后直接导出剪映交接物。",
          prompt: "三镜头短剧：测试生产完成后直接导出剪映交接物。",
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

async function hasGeneratedNode(page: Page, criteria: { nodeKind: string; title: string }) {
  return page.evaluate(({ nodeKind, title }) => {
    const e2e = (window as Window & { __starcanvasE2E?: StarCanvasE2EBridge }).__starcanvasE2E
    return e2e?.getNodes().some((node) => node.data.nodeKind === nodeKind && node.data.title === title) ?? false
  }, criteria)
}

async function seedCanvasForProject(page: Page, projectId: string) {
  const storageKey = `startrails_canvas_p:${encodeURIComponent(projectId)}`
  await page.evaluate(
    ({ key, data }) => {
      window.localStorage.setItem(key, JSON.stringify(data))
    },
    { key: storageKey, data: createStoredCanvas() },
  )
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

test.describe("production run -> Jianying export handoff", () => {
  test("completed production run can export a real Jianying compatible zip", async ({ page }) => {
    test.setTimeout(240_000)
    const projectId = createTestProjectId("production-run-jianying-export")
    const errors = collectConsoleErrors(page)

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
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ imageUrl: MOCK_IMAGE, requestId: "e2e-prje-image" }),
      })
    })

    await page.route("**/api/ai/generate-video-vidu", async (route) => {
      const sseBody = [
        "event: progress\ndata: " + JSON.stringify({ stage: "queued", percent: 10, message: "queued" }) + "\n\n",
        "event: result\ndata: " + JSON.stringify({ videoUrl: MOCK_VIDEO, taskId: "e2e-prje-video" }) + "\n\n",
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
          body: JSON.stringify({ event_id: "e2e-prje-tts-event" }),
        })
      }
    })

    await page.route("**/k2-fsa-omnivoice.hf.space/call/generate/e2e-prje-tts-event", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          stage: "complete",
          output: {
            data: [{ url: "/file=/tmp/e2e-prje-tts.wav", name: "e2e-prje-tts.wav" }],
          },
        }),
      })
    })

    await page.route("**/k2-fsa-omnivoice.hf.space/file=/tmp/e2e-prje-tts.wav", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "audio/wav",
        body: Buffer.from(
          "UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=",
          "base64",
        ),
      })
    })

    await gotoCanvas(page, projectId)
    await dismissOnboardingIfPresent(page)
    await page.evaluate(() => {
      window.localStorage.clear()
      window.sessionStorage.clear()
      window.localStorage.setItem("startrails_use_mock", "true")
    })
    await seedCanvasForProject(page, projectId)
    await gotoCanvas(page, projectId)
    await dismissOnboardingIfPresent(page)
    await expect(page.getByText("三镜头短剧：测试生产完成后直接导出剪映交接物。").first()).toBeVisible({ timeout: 15_000 })

    await openQueue(page)
    await page.getByTestId("production-run-queue-start").click()
    await expect(page.getByTestId("production-run-queue-status")).toContainText("已完成", { timeout: 45_000 })
    await expect(page.getByTestId("production-run-queue-progress")).toContainText("12/12 完成", { timeout: 45_000 })

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

    const subtitleText = await zip.file("JianYingCompatible/subtitles.srt")?.async("string")
    const draftContent = await zip.file("JianYingCompatible/draft_content.json")?.async("string")

    expect(subtitleText).toContain("今天的阳光真好。")
    expect(JSON.parse(draftContent || "{}")).toMatchObject({
      canvasConfig: { width: 1080, height: 1920 },
    })

    await expect(page.getByText("导出成功")).toBeVisible({ timeout: 15_000 })
    expect(errors.pageErrors).toEqual([])
    expect(errors.consoleErrors).toEqual([])
  })
})
