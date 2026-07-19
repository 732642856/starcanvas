import { expect, test, type Download, type Page } from "@playwright/test"
import JSZip from "jszip"
import { mkdir, readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

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
        id: "prpp-storyboard",
        type: "content",
        position: { x: 120, y: 120 },
        width: 760,
        height: 620,
        measured: { width: 760, height: 620 },
        data: {
          title: "E2E 生产后项目包 roundtrip",
          nodeKind: "storyboard",
          content: "三镜头短剧：测试生产完成后导出项目包并在新项目恢复。",
          prompt: "三镜头短剧：测试生产完成后导出项目包并在新项目恢复。",
          storyboardAssistantStage: "storyboard-text",
          autoSizeMode: "fixed-width-height-grows",
          displayWidth: 760,
          displayHeight: 620,
        },
      },
      {
        id: "prpp-shot-1",
        type: "shot",
        position: { x: 360, y: 80 },
        data: {
          title: "PQ镜头 1",
          nodeKind: "shot",
          content: "荆钗藏锅",
          shot: {
            id: "prpp-shot-1",
            order: 1,
            title: "PQ镜头 1",
            description: "荆钗把焦黑铁锅藏到身后，然后警觉望向宫门。",
            visualPrompt: "period-drama palace kitchen, Jingchai holds a scorched wok",
            shotType: "medium close-up",
            cameraMovement: "slow push in",
            duration: "3s",
            videoReferenceAudit: {
              mode: "r2v",
              configuredCount: 3,
              usedCount: 2,
              skippedCount: 1,
              reason: "角色参考图部分不可读：已使用 2/3 张，其余 1 张未恢复或桥接失败。",
            },
          },
        },
      },
      {
        id: "prpp-shot-1-video",
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
        id: "prpp-shot-1-audio",
        type: "audio",
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
        id: "prpp-shot-1-subtitle",
        type: "subtitle",
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

async function seedCanvasForProject(page: Page, projectId: string) {
  const storageKey = `startrails_canvas_p:${encodeURIComponent(projectId)}`
  await page.evaluate(
    ({ key, data }) => {
      window.localStorage.setItem(key, JSON.stringify(data))
    },
    { key: storageKey, data: createCompletedProductionCanvas() },
  )
}

async function readCanvasSummary(page: Page) {
  return page.evaluate(() => {
    const e2e = (window as Window & {
      __starcanvasE2E?: {
        getEdges: () => Array<{ id: string; source: string; target: string }>
        getNodes: () => Array<{ id: string; data: Record<string, any> }>
      }
    }).__starcanvasE2E
    const nodes = e2e?.getNodes() ?? []
    const edges = e2e?.getEdges() ?? []
    return {
      titles: nodes.map((node) => String(node.data.title || "")).sort(),
      nodeKinds: nodes.map((node) => String(node.data.nodeKind || "")).sort(),
      edgeCount: edges.length,
    }
  })
}

async function exportProjectPackage(page: Page): Promise<Download> {
  await page.getByTestId("export-dropdown-toggle").click()
  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: "导出项目包" }).click()
  return downloadPromise
}

async function materializeDownloadedProjectPackage(download: Download): Promise<string> {
  const dir = path.join(os.tmpdir(), "starcanvas-e2e-production-package")
  await mkdir(dir, { recursive: true })
  const targetPath = path.join(dir, download.suggestedFilename())
  await download.saveAs(targetPath)
  return targetPath
}

async function openJianyingExportPreflight(page: Page) {
  await page.getByTestId("export-dropdown-toggle").click()
  await page.getByRole("button", { name: "剪映兼容包 (ZIP)" }).click()
  await expect(page.getByText("导出预检")).toBeVisible({ timeout: 15_000 })
}

async function closeFileUploadPanelIfPresent(page: Page) {
  const uploadTitle = page.getByText("文件上传")
  if (!(await uploadTitle.isVisible().catch(() => false))) return
  await page.locator("div.fixed.inset-0.z-50 button:has(svg.lucide-x)").click()
  await expect(uploadTitle).toBeHidden({ timeout: 15_000 })
}

test.describe("production run -> project package roundtrip", () => {
  test("completed production artifacts can export a project package and restore it in a new canvas", async ({ page }) => {
    test.setTimeout(300_000)
    const exportProjectId = createTestProjectId("production-package-export")
    const importProjectId = createTestProjectId("production-package-import")
    const errors = collectConsoleErrors(page)

    await gotoCanvas(page, exportProjectId)
    await dismissOnboardingIfPresent(page)
    await page.evaluate(() => {
      window.localStorage.clear()
      window.sessionStorage.clear()
      window.localStorage.setItem("startrails_use_mock", "true")
    })
    await seedCanvasForProject(page, exportProjectId)
    await gotoCanvas(page, exportProjectId)
    await dismissOnboardingIfPresent(page)
    await expect(page.getByText("三镜头短剧：测试生产完成后导出项目包并在新项目恢复。").first()).toBeVisible({ timeout: 15_000 })

    await page.getByTestId("production-run-queue-toggle").click({ force: true })
    await expect(page.getByTestId("production-run-queue-task-detail")).toHaveText("R2V · 已用 2/3 · 跳过 1")

    const exportDownload = await exportProjectPackage(page)
    const downloadPath = await materializeDownloadedProjectPackage(exportDownload)
    const exportedRaw = await readFile(downloadPath, "utf8")
    const exportedPackage = JSON.parse(exportedRaw) as {
      schema: string
      handoffNotes?: Array<{ title?: string }>
      productionRunManifest?: {
        previsPlans?: Array<{ shotId?: string; splitShotRecommended?: boolean }>
        productionRunPlan?: Array<{
          shotId?: string
          videoReferenceAudit?: {
            mode?: string
            configuredCount?: number
            usedCount?: number
            skippedCount?: number
          }
        }>
      }
      canvas?: { nodes?: Array<{ data?: { title?: string; nodeKind?: string } }> }
    }

    expect(exportedPackage.schema).toBe("startrails-project-package/v1")
    expect(exportedPackage.handoffNotes?.some((note) => note.title === "PQ镜头 1 视频")).toBeTruthy()
    expect(
      exportedPackage.canvas?.nodes?.some((node) => node.data?.nodeKind === "video-result" && node.data?.title === "PQ镜头 1 视频"),
    ).toBeTruthy()
    expect(exportedPackage.productionRunManifest?.previsPlans).toEqual(expect.arrayContaining([
      expect.objectContaining({
        shotId: "prpp-shot-1",
        splitShotRecommended: true,
      }),
    ]))
    expect(exportedPackage.productionRunManifest?.productionRunPlan).toEqual(expect.arrayContaining([
      expect.objectContaining({
        shotId: "prpp-shot-1",
        videoReferenceAudit: expect.objectContaining({
          mode: "r2v",
          configuredCount: 3,
          usedCount: 2,
          skippedCount: 1,
        }),
      }),
    ]))

    await gotoCanvas(page, importProjectId)
    await dismissOnboardingIfPresent(page)
    await page.getByTestId("toolbar-file-upload").click()
    await expect(page.getByText("文件上传")).toBeVisible({ timeout: 15_000 })

    const chooserPromise = page.waitForEvent("filechooser")
    await page.getByText("拖拽文件到此处").click()
    const chooser = await chooserPromise
    await chooser.setFiles(downloadPath)

    await expect
      .poll(() => readCanvasSummary(page), {
        timeout: 30_000,
        message: "imported production package should restore generated handoff nodes",
      })
      .toMatchObject({
        edgeCount: expect.any(Number),
      })

    const importedSummary = await readCanvasSummary(page)
    expect(importedSummary.titles).toContain("PQ镜头 1 视频")
    expect(importedSummary.titles).toContain("PQ镜头 1 配音")
    expect(importedSummary.titles).toContain("PQ镜头 1 字幕")
    expect(importedSummary.nodeKinds).toContain("video-result")
    expect(importedSummary.nodeKinds).toContain("tts-audio")
    expect(importedSummary.nodeKinds).toContain("subtitle-srt")

    await closeFileUploadPanelIfPresent(page)
    await openJianyingExportPreflight(page)
    const zipDownloadPromise = page.waitForEvent("download")
    await page.getByRole("button", { name: /导出 ZIP 兼容包|仍导出/ }).click()
    const zipDownload = await zipDownloadPromise
    expect(zipDownload.suggestedFilename()).toBe("星轨画布导出_JianYingCompatible.zip")

    const zipPath = await zipDownload.path()
    if (!zipPath) {
      throw new Error("re-exported Jianying zip path unavailable")
    }

    const zipBuffer = await readFile(zipPath)
    const zip = await JSZip.loadAsync(zipBuffer)
    const entryNames = Object.keys(zip.files).sort()
    expect(entryNames).toContain("JianYingCompatible/README.txt")
    expect(entryNames).toContain("JianYingCompatible/subtitles.srt")
    expect(entryNames).toContain("JianYingCompatible/draft_content.json")

    const subtitles = await zip.file("JianYingCompatible/subtitles.srt")?.async("string")
    expect(subtitles).toContain("今天的阳光真好。")

    expect(errors.pageErrors).toEqual([])
    expect(errors.consoleErrors).toEqual([])
  })
})
