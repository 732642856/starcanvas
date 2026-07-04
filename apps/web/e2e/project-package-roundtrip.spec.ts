import { expect, test, type Page, type Download } from "@playwright/test"
import { readFile } from "node:fs/promises"
import { mkdir } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
  collectConsoleErrors,
  dismissOnboardingIfPresent,
  gotoCanvas,
  waitForCanvasSave,
} from "./utils"
import { createTestProjectId } from "./utils/project"

type StarCanvasE2EBridge = {
  getEdges: () => Array<{ id: string; source: string; target: string }>
  getNodes: () => Array<{ id: string; data: Record<string, unknown> }>
}

type DownloadedProjectPackage = {
  schema: string
  projectName?: string
  canvas?: {
    nodes?: Array<{ id: string; data?: { title?: string; nodeKind?: string } }>
    edges?: Array<{ id: string; source: string; target: string }>
  }
}

async function seedCanvasForExport(page: Page, projectId: string) {
  await page.evaluate((activeProjectId) => {
    const e2e = (window as Window & { __starcanvasE2E?: StarCanvasE2EBridge }).__starcanvasE2E
    if (!e2e) throw new Error("__starcanvasE2E bridge is unavailable")

    const now = new Date().toISOString()
    const storageKey = activeProjectId?.trim()
      ? `startrails_canvas_p:${encodeURIComponent(activeProjectId.trim())}`
      : "startrails_canvas"
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        version: 2,
        savedAt: Date.now(),
        nodes: [
          {
            id: "roundtrip-script",
            type: "content",
            position: { x: 140, y: 120 },
            data: {
              title: "Roundtrip 剧本",
              nodeKind: "script",
              content: "这是项目包 roundtrip 导出的剧本节点。",
              createdAt: now,
            },
          },
          {
            id: "roundtrip-video",
            type: "video",
            position: { x: 540, y: 120 },
            data: {
              title: "Roundtrip 视频线索",
              nodeKind: "uploaded-video",
              assetId: "roundtrip-video-asset",
              persistence: "missing",
              loadError: "asset-not-found",
              createdAt: now,
            },
          },
        ],
        edges: [
          {
            id: "roundtrip-edge",
            source: "roundtrip-script",
            target: "roundtrip-video",
            type: "smoothstep",
            animated: true,
          },
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      }),
    )
  }, projectId)
}

async function readCanvasSummary(page: Page) {
  return page.evaluate(() => {
    const e2e = (window as Window & { __starcanvasE2E?: StarCanvasE2EBridge }).__starcanvasE2E
    const nodes = e2e?.getNodes() ?? []
    const edges = e2e?.getEdges() ?? []
    return {
      nodeIds: nodes.map((node) => node.id).sort(),
      titles: nodes.map((node) => String(node.data.title || "")).sort(),
      nodeKinds: nodes.map((node) => String(node.data.nodeKind || "")).sort(),
      edgeCount: edges.length,
      hasRoundtripEdge: edges.some(
        (edge) => edge.source === "roundtrip-script" && edge.target === "roundtrip-video",
      ),
    }
  })
}

async function downloadProjectPackage(page: Page): Promise<{ download: Download; parsed: DownloadedProjectPackage }> {
  await page.getByTestId("export-dropdown-toggle").click()

  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: "导出项目包" }).click()
  const download = await downloadPromise
  const filePath = await download.path()

  if (!filePath) {
    throw new Error("Playwright download path is unavailable")
  }

  const raw = await readFile(filePath, "utf8")
  const parsed = JSON.parse(raw) as DownloadedProjectPackage
  return { download, parsed }
}

async function materializeDownloadedProjectPackage(download: Download): Promise<string> {
  const dir = path.join(os.tmpdir(), "starcanvas-e2e-roundtrip")
  await mkdir(dir, { recursive: true })
  const targetPath = path.join(dir, download.suggestedFilename())
  await download.saveAs(targetPath)
  return targetPath
}

test.describe("project package roundtrip", () => {
  test("user can export a project package and import it back into a new canvas", async ({ page }) => {
    test.setTimeout(240_000)

    const exportProjectId = createTestProjectId("project-package-export")
    const importProjectId = createTestProjectId("project-package-roundtrip")
    const errors = collectConsoleErrors(page)

    await gotoCanvas(page, exportProjectId)
    await dismissOnboardingIfPresent(page)
    await seedCanvasForExport(page, exportProjectId)
    await page.reload({ waitUntil: "domcontentloaded" })
    await dismissOnboardingIfPresent(page)

    await expect
      .poll(() => readCanvasSummary(page), {
        timeout: 30_000,
        message: "seeded export canvas should be restored before downloading",
      })
      .toMatchObject({
        nodeIds: ["roundtrip-script", "roundtrip-video"],
        titles: ["Roundtrip 剧本", "Roundtrip 视频线索"],
        edgeCount: 1,
        hasRoundtripEdge: true,
      })

    const { download, parsed } = await downloadProjectPackage(page)
    const importableProjectPackagePath = await materializeDownloadedProjectPackage(download)
    expect(download.suggestedFilename()).toMatch(/^startrails-project-\d{4}-\d{2}-\d{2}\.json$/)
    expect(parsed.schema).toBe("startrails-project-package/v1")
    expect(parsed.canvas?.nodes?.map((node) => node.id).sort()).toEqual(["roundtrip-script", "roundtrip-video"])
    expect(parsed.canvas?.edges?.map((edge) => edge.id)).toContain("roundtrip-edge")

    await gotoCanvas(page, importProjectId)
    await dismissOnboardingIfPresent(page)

    await page.getByTestId("toolbar-file-upload").click()
    await expect(page.getByText("文件上传")).toBeVisible({ timeout: 15_000 })

    const chooserPromise = page.waitForEvent("filechooser")
    await page.getByText("拖拽文件到此处").click()
    const chooser = await chooserPromise
    await chooser.setFiles(importableProjectPackagePath)

    await expect
      .poll(() => readCanvasSummary(page), {
        timeout: 30_000,
        message: "roundtrip import should restore exported nodes and edges",
      })
      .toMatchObject({
        nodeIds: ["roundtrip-script", "roundtrip-video"],
        titles: ["Roundtrip 剧本", "Roundtrip 视频线索"],
        nodeKinds: ["script", "uploaded-video"],
        edgeCount: 1,
        hasRoundtripEdge: true,
      })
    await expect(page.getByText("项目包 · 2 节点 · 1 连线")).toBeVisible({ timeout: 15_000 })

    await waitForCanvasSave(page)
    await gotoCanvas(page, importProjectId)
    await dismissOnboardingIfPresent(page)
    await expect
      .poll(() => readCanvasSummary(page), {
        timeout: 30_000,
        message: "roundtrip imported canvas should persist after reload",
      })
      .toMatchObject({
        nodeIds: ["roundtrip-script", "roundtrip-video"],
        titles: ["Roundtrip 剧本", "Roundtrip 视频线索"],
        edgeCount: 1,
        hasRoundtripEdge: true,
      })

    expect(errors.pageErrors).toEqual([])
    expect(errors.consoleErrors).toEqual([])
  })
})
