import { expect, test, type Download, type Page } from "@playwright/test"
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
  nodes: Array<Record<string, unknown>>
  edges: Array<Record<string, unknown>>
  viewport: { x: number; y: number; zoom: number }
}

function createExportableCanvas(): StoredCanvas {
  return {
    version: 2,
    savedAt: Date.now(),
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: "jy-video",
        type: "video",
        position: { x: 120, y: 120 },
        data: {
          title: "剪映导出视频",
          nodeKind: "video-result",
          resultUrl:
            "data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc282bXA0MQAAAAhmcmVlAAAAGm1kYXQAAAGzABAHAAABthDAAAAAAAA=",
          duration: "3s",
          videoWidth: 1280,
          videoHeight: 720,
          videoFps: 24,
          fileName: "jianying-export-video.mp4",
        },
      },
      {
        id: "jy-audio",
        type: "content",
        position: { x: 480, y: 120 },
        data: {
          title: "剪映导出配音",
          nodeKind: "tts-audio",
          audioUrl:
            "data:audio/mpeg;base64,SUQzAwAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjMyLjEwMAAAAAAAAAAAAAAA//tQxAADBzQAPgAAGFhYWFhYWFhY",
          durationSeconds: 3,
          fileName: "jianying-export-audio.mp3",
        },
      },
      {
        id: "jy-subtitle",
        type: "content",
        position: { x: 840, y: 120 },
        data: {
          title: "剪映导出字幕",
          nodeKind: "subtitle-srt",
          srtContent: "1\n00:00:00,000 --> 00:00:03,000\n这是剪映导出测试字幕。",
          segments: [{ index: 1, start: 0, end: 3, text: "这是剪映导出测试字幕。" }],
        },
      },
    ],
    edges: [],
  }
}

async function seedCanvas(page: Page, projectId: string) {
  const storageKey = `startrails_canvas_p:${encodeURIComponent(projectId)}`
  const canvas = createExportableCanvas()
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

async function triggerExportAndCollectDownloads(
  page: Page,
  count: number,
): Promise<Download[]> {
  const downloads: Download[] = []
  const listener = (download: Download) => {
    downloads.push(download)
  }
  page.on("download", listener)
  await page.getByRole("button", {
    name: /导出 JSON 草稿|导出 ZIP 兼容包|仍导出/,
  }).click()
  await expect
    .poll(() => downloads.length, {
      timeout: 15_000,
      message: `expected ${count} download events`,
    })
    .toBe(count)
  page.off("download", listener)
  return downloads
}

test.describe("jianying export", () => {
  test("exports Jianying JSON draft files as real downloads", async ({ page }) => {
    test.setTimeout(180_000)
    const projectId = createTestProjectId("jianying-export-json")
    const errors = collectConsoleErrors(page)

    await gotoCanvas(page, projectId)
    await dismissOnboardingIfPresent(page)
    await seedCanvas(page, projectId)
    await gotoCanvas(page, projectId)
    await dismissOnboardingIfPresent(page)

    await openExportPreflight(page)
    await page.getByRole("button", { name: "JSON 草稿" }).click()

    const downloads = await triggerExportAndCollectDownloads(page, 2)
    const names = downloads.map((download) => download.suggestedFilename()).sort()
    expect(names).toHaveLength(2)
    expect(names[0]).toMatch(/^draft_content_\d+\.json$/)
    expect(names[1]).toMatch(/^draft_meta_info_\d+\.json$/)

    const files = await Promise.all(downloads.map(async (download) => {
      const filePath = await download.path()
      if (!filePath) throw new Error("download path unavailable")
      return {
        name: download.suggestedFilename(),
        text: await readFile(filePath, "utf8"),
      }
    }))

    const draftContent = files.find((item) => item.name.startsWith("draft_content_"))
    const draftMeta = files.find((item) => item.name.startsWith("draft_meta_info_"))
    if (!draftContent || !draftMeta) {
      throw new Error("missing Jianying JSON downloads")
    }

    const draftContentJson = JSON.parse(draftContent.text) as {
      tracks?: unknown[]
      materials?: Record<string, unknown>
      canvasConfig?: { width?: number; height?: number }
    }
    const draftMetaJson = JSON.parse(draftMeta.text) as {
      draftId?: string
      version?: string
      resolution?: string
      frameRate?: number
      duration?: number
    }

    expect(Array.isArray(draftContentJson.tracks)).toBe(true)
    expect(draftContentJson.canvasConfig?.width).toBe(1080)
    expect(draftContentJson.canvasConfig?.height).toBe(1920)
    expect(typeof draftContentJson.materials).toBe("object")
    expect(typeof draftMetaJson.draftId).toBe("string")
    expect(draftMetaJson.version).toBe("7.5.0")
    expect(draftMetaJson.resolution).toBe("1080x1920")
    expect(draftMetaJson.frameRate).toBe(30)
    expect(typeof draftMetaJson.duration).toBe("number")

    await expect(page.getByText("导出成功")).toBeVisible({ timeout: 15_000 })
    expect(errors.pageErrors).toEqual([])
    expect(errors.consoleErrors).toEqual([])
  })

  test("exports Jianying compatible ZIP with expected files", async ({ page }) => {
    test.setTimeout(180_000)
    const projectId = createTestProjectId("jianying-export-zip")
    const errors = collectConsoleErrors(page)

    await gotoCanvas(page, projectId)
    await dismissOnboardingIfPresent(page)
    await seedCanvas(page, projectId)
    await gotoCanvas(page, projectId)
    await dismissOnboardingIfPresent(page)

    await openExportPreflight(page)

    const [download] = await triggerExportAndCollectDownloads(page, 1)
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
    expect(entryNames).toContain("JianYingCompatible/videos/jianying-export-video.mp4")
    expect(entryNames).toContain("JianYingCompatible/audios/jianying-export-audio.mp3")

    const readme = await zip.file("JianYingCompatible/README.txt")?.async("string")
    const subtitles = await zip.file("JianYingCompatible/subtitles.srt")?.async("string")
    const draftContent = await zip.file("JianYingCompatible/draft_content.json")?.async("string")

    expect(readme).toContain("星轨画布 (StarCanvas) - 剪映兼容导出包")
    expect(subtitles).toContain("这是剪映导出测试字幕。")
    expect(JSON.parse(draftContent || "{}")).toMatchObject({
      canvasConfig: { width: 1080, height: 1920 },
    })

    await expect(page.getByText("导出成功")).toBeVisible({ timeout: 15_000 })
    expect(errors.pageErrors).toEqual([])
    expect(errors.consoleErrors).toEqual([])
  })
})
