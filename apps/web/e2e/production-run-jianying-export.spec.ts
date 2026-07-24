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
  viewport?: { x: number; y: number; zoom: number }
  nodes: Array<Record<string, any>>
  edges: Array<Record<string, any>>
}

function createCompletedProductionCanvas(): StoredCanvas {
  return {
    version: 2,
    savedAt: Date.now(),
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: "prje-storyboard",
        type: "content",
        position: { x: 120, y: 120 },
        data: {
          title: "E2E 生产队列剪映交接测试",
          nodeKind: "storyboard",
          content: "三镜头短剧：测试生产完成后直接导出剪映交接物。",
          prompt: "三镜头短剧：测试生产完成后直接导出剪映交接物。",
        },
      },
      {
        id: "prje-shot-1-video",
        type: "video",
        position: { x: 520, y: 80 },
        data: {
          title: "PQ镜头 1 视频",
          nodeKind: "video-result",
          resultUrl:
            "data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc282bXA0MQAAAAhmcmVlAAAAGm1kYXQAAAGzABAHAAABthDAAAAAAAA=",
          duration: "3s",
          videoWidth: 1280,
          videoHeight: 720,
          videoFps: 24,
          fileName: "pq-shot-1-video.mp4",
        },
      },
      {
        id: "prje-shot-1-audio",
        type: "content",
        position: { x: 520, y: 260 },
        data: {
          title: "PQ镜头 1 配音",
          nodeKind: "tts-audio",
          audioUrl:
            "data:audio/mpeg;base64,SUQzAwAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjMyLjEwMAAAAAAAAAAAAAAA//tQxAADBzQAPgAAGFhYWFhYWFhY",
          durationSeconds: 3,
          fileName: "pq-shot-1-audio.mp3",
        },
      },
      {
        id: "prje-shot-1-subtitle",
        type: "content",
        position: { x: 520, y: 420 },
        data: {
          title: "PQ镜头 1 字幕",
          nodeKind: "subtitle-srt",
          srtContent: "1\n00:00:00,000 --> 00:00:03,000\n今天的阳光真好。",
          segments: [{ index: 1, start: 0, end: 3, text: "今天的阳光真好。" }],
        },
      },
    ],
    edges: [],
  }
}

function createRiskyFileNameCanvas(): StoredCanvas {
  const canvas = createCompletedProductionCanvas()
  canvas.nodes = canvas.nodes.map((node) => {
    if (node.id === "prje-shot-1-video") {
      return {
        ...node,
        data: {
          ...node.data,
          title: "同名非法视频",
          fileName: "same:/name",
        },
      }
    }
    if (node.id === "prje-shot-1-audio") {
      return {
        ...node,
        data: {
          ...node.data,
          title: "保留名音频",
          fileName: "CON.mp3",
        },
      }
    }
    return node
  })
  return canvas
}

async function seedCanvasForProject(page: Page, projectId: string) {
  const storageKey = `startrails_canvas_p:${encodeURIComponent(projectId)}`
  const canvas = createCompletedProductionCanvas()
  await page.evaluate(
    ({ key, data }) => {
      window.localStorage.setItem(key, JSON.stringify(data))
    },
    { key: storageKey, data: canvas },
  )
}

async function seedRiskyFileNameCanvas(page: Page, projectId: string) {
  const storageKey = `startrails_canvas_p:${encodeURIComponent(projectId)}`
  const canvas = createRiskyFileNameCanvas()
  await page.evaluate(
    ({ key, data }) => {
      window.localStorage.setItem(key, JSON.stringify(data))
    },
    { key: storageKey, data: canvas },
  )
}

async function openExportPreflight(page: Page) {
  await page.getByTestId("export-dropdown-toggle").click()
  await page.getByRole("button", { name: "剪映兼容包 (ZIP)" }).click()
  await expect(page.getByText("导出预检")).toBeVisible({ timeout: 15_000 })
}

test.describe("production run -> Jianying export handoff", () => {
  test("completed production artifacts can export a real Jianying compatible zip", async ({ page }) => {
    test.setTimeout(90_000)
    const projectId = createTestProjectId("production-run-jianying-export")
    const errors = collectConsoleErrors(page)

    await gotoCanvas(page, projectId)
    await dismissOnboardingIfPresent(page)
    await page.evaluate(() => {
      window.localStorage.clear()
      window.sessionStorage.clear()
    })
    await seedCanvasForProject(page, projectId)
    await gotoCanvas(page, projectId)
    await dismissOnboardingIfPresent(page)

    await expect(page.getByText("三镜头短剧：测试生产完成后直接导出剪映交接物。").first()).toBeVisible({ timeout: 15_000 })

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

  test("export preflight shows warnings for handoff file name risks", async ({ page }) => {
    test.setTimeout(90_000)
    const projectId = createTestProjectId("production-run-jianying-preflight-warning")
    const errors = collectConsoleErrors(page)
    await gotoCanvas(page, projectId)
    await dismissOnboardingIfPresent(page)
    await page.evaluate(() => {
      window.localStorage.clear()
      window.sessionStorage.clear()
    })
    await seedRiskyFileNameCanvas(page, projectId)
    await gotoCanvas(page, projectId)
    await dismissOnboardingIfPresent(page)
    await expect(page.getByText("同名非法视频").first()).toBeVisible({ timeout: 15_000 })

    await openExportPreflight(page)
    await expect(page.getByText("注意").first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText("同名非法视频").first()).toBeVisible()
    await expect(page.getByText("保留名音频").first()).toBeVisible()

    const downloadPromise = page.waitForEvent("download")
    await page.getByRole("button", { name: /导出 ZIP 兼容包|仍导出/ }).click()
    const download = await downloadPromise
    const filePath = await download.path()
    if (!filePath) throw new Error("zip download path unavailable")
    const zip = await JSZip.loadAsync(await readFile(filePath))
    const entryNames = Object.keys(zip.files).sort()
    expect(entryNames).toContain("JianYingCompatible/videos/same_name.mp4")
    expect(entryNames).toContain("JianYingCompatible/audios/CON_.mp3")
    const draftContent = await zip.file("JianYingCompatible/draft_content.json")?.async("string")
    const draft = JSON.parse(draftContent || "{}") as {
      materials?: {
        videos?: Record<string, { path?: string }>
        audios?: Record<string, { path?: string }>
      }
    }
    expect(Object.values(draft.materials?.videos ?? {}).map((material) => material.path)).toContain(
      "/absolute/path/to/same_name.mp4",
    )
    expect(Object.values(draft.materials?.audios ?? {}).map((material) => material.path)).toContain(
      "/absolute/path/to/CON_.mp3",
    )

    expect(errors.pageErrors).toEqual([])
    expect(errors.consoleErrors).toEqual([])
  })
})
