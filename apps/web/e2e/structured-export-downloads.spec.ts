import { expect, test, type Download, type Page } from "@playwright/test"
import { readFile } from "node:fs/promises"

import {
  collectConsoleErrors,
  dismissOnboardingIfPresent,
  gotoCanvas,
} from "./utils"
import { createTestProjectId } from "./utils/project"

type StarCanvasE2EBridge = {
  getEdges: () => Array<{ id: string; source: string; target: string }>
  getNodes: () => Array<{ id: string; data: Record<string, unknown> }>
}

type StoredCanvas = {
  version: number
  savedAt: number
  nodes: Array<Record<string, unknown>>
  edges: Array<Record<string, unknown>>
  viewport: { x: number; y: number; zoom: number }
}

function createStructuredExportCanvas(): StoredCanvas {
  const sourceId = "e2e-export-source"
  const linXia = {
    id: "lin-xia",
    name: "林夏",
    role: "主角",
    visualSignature: "短发、冷白肤色、锐利眼神",
    costume: "黑色风衣",
    props: ["旧黄铜钥匙"],
    colorPalette: ["黑", "金"],
    notes: "始终带着钥匙",
  }
  const shenYan = {
    id: "shen-yan",
    name: "沈砚",
    role: "搭档",
    visualSignature: "高挑身形、深色短发、冷峻表情",
    costume: "深灰夹克",
    props: ["手电筒"],
    colorPalette: ["灰", "蓝"],
    notes: "习惯压低声音",
  }

  return {
    version: 2,
    savedAt: Date.now(),
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: sourceId,
        type: "content",
        position: { x: 120, y: 120 },
        width: 760,
        height: 620,
        measured: { width: 760, height: 620 },
        data: {
          title: "E2E 结构化导出",
          nodeKind: "storyboard",
          content: "两镜头短片：验证剧本 / 分镜表 / 角色表结构化导出。",
          prompt: "两镜头短片：验证剧本 / 分镜表 / 角色表结构化导出。",
          storyboardAssistantStage: "storyboard-text",
          generatedShotNodeIds: ["e2e-export-shot-1", "e2e-export-shot-2"],
          storyboardProcessVisible: true,
        },
      },
      {
        id: "e2e-export-shot-1",
        type: "shot",
        position: { x: 980, y: 120 },
        width: 340,
        height: 260,
        measured: { width: 340, height: 260 },
        data: {
          title: "导出镜头 1",
          nodeKind: "shot",
          sourceStoryboardNodeId: sourceId,
          prompt: "雨夜走廊，林夏握着黄铜钥匙向门边靠近。",
          shot: {
            id: "e2e-export-shot-1",
            order: 1,
            title: "导出镜头 1",
            shotType: "close-up",
            cameraMovement: "push-in",
            duration: "4s",
            description: "雨夜走廊中，林夏贴近旧门，试探门后动静。",
            visualPrompt: "雨夜走廊，林夏握着黄铜钥匙向门边靠近。",
            dialogue: "林夏：门后一定有人。",
            characterIdentities: [linXia],
            status: "ready",
          },
        },
      },
      {
        id: "e2e-export-shot-2",
        type: "shot",
        position: { x: 980, y: 460 },
        width: 340,
        height: 260,
        measured: { width: 340, height: 260 },
        data: {
          title: "导出镜头 2",
          nodeKind: "shot",
          sourceStoryboardNodeId: sourceId,
          prompt: "门缝亮起冷光，沈砚抬手示意噤声。",
          shot: {
            id: "e2e-export-shot-2",
            order: 2,
            title: "导出镜头 2",
            shotType: "medium",
            cameraMovement: "static",
            duration: "3s",
            description: "门缝透出冷光，沈砚从侧后方伸手拦住林夏。",
            visualPrompt: "门缝亮起冷光，沈砚抬手示意噤声。",
            dialogue: "沈砚：别出声。",
            characterIdentities: [linXia, shenYan],
            status: "ready",
          },
        },
      },
    ],
    edges: [],
  }
}

async function seedCanvas(page: Page, projectId: string) {
  await page.evaluate(
    ({ activeProjectId, data }) => {
      const e2e = (window as Window & { __starcanvasE2E?: StarCanvasE2EBridge }).__starcanvasE2E
      if (!e2e) throw new Error("__starcanvasE2E bridge is unavailable")
      const storageKey = activeProjectId?.trim()
        ? `startrails_canvas_p:${encodeURIComponent(activeProjectId.trim())}`
        : "startrails_canvas"
      window.localStorage.setItem(storageKey, JSON.stringify(data))
    },
    { activeProjectId: projectId, data: createStructuredExportCanvas() },
  )
}

async function downloadExport(page: Page, label: string): Promise<Download> {
  const dropdown = page.getByTestId("export-dropdown-toggle").locator("xpath=..")
  await page.getByTestId("export-dropdown-toggle").click()
  const downloadPromise = page.waitForEvent("download")
  await dropdown.getByRole("button", { name: label, exact: true }).click()
  return downloadPromise
}

async function readDownloadText(download: Download): Promise<string> {
  const filePath = await download.path()
  if (!filePath) {
    throw new Error(`download path unavailable for ${download.suggestedFilename()}`)
  }
  return readFile(filePath, "utf8")
}

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, "")
}

async function readCanvasSummary(page: Page) {
  return page.evaluate(() => {
    const e2e = (window as Window & { __starcanvasE2E?: StarCanvasE2EBridge }).__starcanvasE2E
    const nodes = e2e?.getNodes() ?? []
    const edges = e2e?.getEdges() ?? []
    return {
      nodeIds: nodes.map((node) => node.id).sort(),
      titles: nodes.map((node) => (typeof node.data.title === "string" ? node.data.title : "")).filter(Boolean).sort(),
      edgeCount: edges.length,
    }
  })
}

test("exports screenplay storyboard csv and character csv from seeded shots", async ({ page }) => {
  test.setTimeout(180_000)

  const projectId = createTestProjectId("structured-exports")
  const errors = collectConsoleErrors(page)

  await gotoCanvas(page, projectId)
  await dismissOnboardingIfPresent(page)
  await seedCanvas(page, projectId)
  await page.reload({ waitUntil: "domcontentloaded" })
  await dismissOnboardingIfPresent(page)
  await expect
    .poll(() => readCanvasSummary(page), {
      timeout: 30_000,
      message: "structured export canvas should be restored before downloading",
    })
    .toMatchObject({
      nodeIds: ["e2e-export-shot-1", "e2e-export-shot-2", "e2e-export-source"],
      titles: ["E2E 结构化导出", "导出镜头 1", "导出镜头 2"],
      edgeCount: 0,
    })

  const screenplayDownload = await downloadExport(page, "剧本")
  expect(screenplayDownload.suggestedFilename()).toBe("星轨剧本_剧本.md")
  const screenplayText = await readDownloadText(screenplayDownload)
  expect(screenplayText).toContain("# 星轨剧本")
  expect(screenplayText).toContain("## 1. 导出镜头 1")
  expect(screenplayText).toContain("**林夏**")
  expect(screenplayText).toContain(": 门后一定有人。")

  const storyboardDownload = await downloadExport(page, "分镜表")
  expect(storyboardDownload.suggestedFilename()).toBe("星轨_分镜表.csv")
  const storyboardText = stripBom(await readDownloadText(storyboardDownload))
  expect(storyboardText).toContain("\"编号\",\"标题\",\"景别\",\"运镜\",\"时长\",\"角色\",\"对白\"")
  expect(storyboardText).toContain("\"1\",\"导出镜头 1\",\"close-up\",\"push-in\",\"4s\",\"林夏\",\"林夏：门后一定有人。\"")
  expect(storyboardText).toContain("\"2\",\"导出镜头 2\",\"medium\",\"static\",\"3s\",\"林夏；沈砚\",\"沈砚：别出声。\"")

  const characterDownload = await downloadExport(page, "角色表")
  expect(characterDownload.suggestedFilename()).toBe("星轨_角色表.csv")
  const characterText = stripBom(await readDownloadText(characterDownload))
  expect(characterText).toContain("\"名称\",\"角色\",\"视觉特征\",\"服装\",\"道具\",\"色板\"")
  expect(characterText).toContain("\"林夏\",\"主角\",\"短发、冷白肤色、锐利眼神\",\"黑色风衣\",\"旧黄铜钥匙\",\"黑；金\"")
  expect(characterText).toContain("\"沈砚\",\"搭档\",\"高挑身形、深色短发、冷峻表情\",\"深灰夹克\",\"手电筒\",\"灰；蓝\"")

  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})
