import { expect, test, type Page } from "@playwright/test"
import { readFile } from "node:fs/promises"
import { gotoCanvas } from "./utils"
import { createTestProjectId } from "./utils/project"

type StoredCanvas = {
  version: 1
  savedAt: number
  nodes: Array<Record<string, any>>
  edges: Array<Record<string, any>>
}

type StarCanvasE2EBridge = {
  getNodes: () => Array<{ id: string; data: Record<string, any> }>
}

const MOCK_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="

function createStoredCanvas(): StoredCanvas {
  return {
    version: 1,
    savedAt: Date.now(),
    nodes: [
      {
        id: "e2e-remix-analysis",
        type: "workflow",
        position: { x: 160, y: 180 },
        width: 360,
        height: 220,
        measured: { width: 360, height: 220 },
        data: {
          title: "结构拆解：雨夜重逢",
          nodeKind: "remix-analysis",
          workflowRole: "Remix Analyst",
          content: "雨夜旧影院短片",
          status: "done",
          runMeta: { status: "succeeded", message: "结构拆解完成" },
          generationOutput: {
            status: "ready",
            result: {
              sourceDescription: "雨夜旧影院短片",
              template: {
                id: "tpl-1",
                category: "剧情",
                totalDuration: "18s",
                hookPattern: "前 2 秒先给重逢钩子",
                structure: [
                  {
                    timestamp: "0",
                    duration: "2",
                    type: "hook",
                    description: "雨夜旧影院门口，两人隔街对望",
                    visualNotes: "霓虹反光，长焦压缩",
                    audioNotes: "雨声 + 低频氛围",
                    emotionalValence: 0.6,
                  },
                  {
                    timestamp: "2",
                    duration: "4",
                    type: "payoff",
                    description: "推门进入大厅，停在旧海报前",
                    visualNotes: "跟拍推进",
                    audioNotes: "脚步回响",
                    emotionalValence: 0.8,
                  },
                ],
                keyTechniques: ["重逢钩子"],
                reusableElements: ["雨夜", "旧影院", "重逢停顿"],
                adaptationNotes: "题材可替换，但保留重逢情绪推进",
              },
              emotionalCurve: [
                { phase: "hook", valence: 0.6, intensity: 0.7 },
                { phase: "payoff", valence: 0.8, intensity: 0.9 },
              ],
              keyMetrics: {
                hookTime: "2s",
                conflictDensity: "medium",
                twistCount: 1,
                pacing: "fast",
              },
              source: "mock",
            },
          },
        },
      },
    ],
    edges: [],
  }
}

async function seedCanvas(page: Page, projectId: string): Promise<void> {
  const storageKey = `startrails_canvas_p:${encodeURIComponent(projectId)}`
  const storedCanvas = createStoredCanvas()
  await page.addInitScript(
    ({ key, data }) => {
      window.localStorage.clear()
      window.sessionStorage.clear()
      window.localStorage.setItem("startrails_use_mock", "true")
      window.localStorage.setItem(key, JSON.stringify(data))
    },
    { key: storageKey, data: storedCanvas },
  )
}

async function waitForE2EBridge(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as Window & { __starcanvasE2E?: unknown }).__starcanvasE2E),
    undefined,
    { timeout: 45_000 },
  )
}

async function getNodes(page: Page) {
  return page.evaluate(() => {
    const e2e = (window as Window & { __starcanvasE2E?: StarCanvasE2EBridge }).__starcanvasE2E
    if (!e2e) throw new Error("__starcanvasE2E bridge is unavailable")
    return e2e.getNodes()
  })
}

async function countNodesByKind(page: Page, nodeKind: string) {
  const nodes = await getNodes(page)
  return nodes.filter((node) => node.data.nodeKind === nodeKind).length
}

async function downloadExportText(page: Page, label: string) {
  const dropdown = page.getByTestId("export-dropdown-toggle").locator("xpath=..")
  await page.getByTestId("export-dropdown-toggle").click()
  const downloadPromise = page.waitForEvent("download")
  await dropdown.getByRole("button", { name: label, exact: true }).click()
  const download = await downloadPromise
  const filePath = await download.path()
  if (!filePath) {
    throw new Error(`download path unavailable for ${download.suggestedFilename()}`)
  }
  return {
    filename: download.suggestedFilename(),
    text: (await readFile(filePath, "utf8")).replace(/^\uFEFF/, ""),
  }
}

async function openRemixContextMenu(page: Page) {
  const remixNode = page.locator("[data-id='e2e-remix-analysis']")
  await expect(remixNode).toBeVisible({ timeout: 15_000 })
  await expect(remixNode).toContainText("结构拆解：雨夜重逢")

  await remixNode.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    element.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: rect.left + 48,
        clientY: rect.top + 48,
      }),
    )
  })

  await expect(page.getByTestId("node-context-remix-create-prompt")).toBeVisible({ timeout: 5_000 })
  return remixNode
}

async function bootSeededRemixCanvas(page: Page) {
  const projectId = createTestProjectId("remix-analysis-derivation")
  await seedCanvas(page, projectId)
  await gotoCanvas(page, projectId)
  await waitForE2EBridge(page)
}

test("remix-analysis context menu exposes derivation actions", async ({ page }) => {
  await bootSeededRemixCanvas(page)
  await openRemixContextMenu(page)

  await expect(page.getByTestId("node-context-remix-create-prompt")).toBeVisible()
  await expect(page.getByTestId("node-context-remix-create-storyboard")).toBeVisible()
  await expect(page.getByTestId("node-context-remix-queue-production")).toBeVisible()
})

test("remix-analysis can derive prompt and storyboard from browser UI", async ({ page }) => {
  await bootSeededRemixCanvas(page)

  await openRemixContextMenu(page)
  await page.getByTestId("node-context-remix-create-prompt").click()

  await expect
    .poll(async () => {
      const nodes = await getNodes(page)
      return nodes.filter((node) => node.data.nodeKind === "prompt").length
    })
    .toBe(1)

  const promptNodes = await getNodes(page)
  const promptNode = promptNodes.find((node) => node.data.nodeKind === "prompt")
  expect(String(promptNode?.data?.prompt ?? "")).toContain("参考视频：雨夜重逢")
  expect(String(promptNode?.data?.prompt ?? "")).toContain("前 2 秒先给重逢钩子")

  await openRemixContextMenu(page)
  await page.getByTestId("node-context-remix-create-storyboard").click()

  await expect
    .poll(async () => {
      const nodes = await getNodes(page)
      return nodes.filter((node) => node.data.nodeKind === "shot").length
    })
    .toBe(2)

  const shotNodes = (await getNodes(page)).filter((node) => node.data.nodeKind === "shot")
  expect(shotNodes.map((node) => String(node.data.title ?? ""))).toEqual(["参考分镜 1", "参考分镜 2"])
  expect(String(shotNodes[0]?.data?.prompt ?? "")).toContain("hook")
  expect(String(shotNodes[1]?.data?.prompt ?? "")).toContain("payoff")
})

test("remix-analysis can create production queue from browser UI", async ({ page }) => {
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
      body: JSON.stringify({ imageUrl: MOCK_IMAGE, requestId: "e2e-remix-queue-image" }),
    })
  })
  await bootSeededRemixCanvas(page)
  await openRemixContextMenu(page)

  await page.getByTestId("node-context-remix-queue-production").click()

  await expect(page.getByTestId("production-run-queue-panel")).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId("production-run-queue-status")).toContainText("生产队列")
  await expect(page.getByTestId("production-run-queue-task")).toHaveCount(2)
  await expect(page.getByTestId("production-run-queue-panel")).toContainText("参考分镜 1")
  await expect(page.getByTestId("production-run-queue-panel")).toContainText("参考分镜 2")
  await expect
    .poll(() => countNodesByKind(page, "shot"), {
      timeout: 10_000,
      message: "remix-analysis queue handoff should materialize storyboard shot nodes before execution",
    })
    .toBe(2)
  await expect(page.getByTestId("production-run-queue-start")).toBeEnabled()
  await page.getByTestId("production-run-queue-start").click()
  await expect(page.getByTestId("production-run-queue-status")).toContainText("已完成", { timeout: 45_000 })
  await expect(page.getByTestId("production-run-queue-progress")).toContainText("2/2 完成", { timeout: 45_000 })
  await expect
    .poll(() => countNodesByKind(page, "ai-generated-image"), {
      timeout: 10_000,
      message: "remix-analysis production queue should create storyboard image nodes",
    })
    .toBe(2)

  const storyboardExport = await downloadExportText(page, "分镜表")
  expect(storyboardExport.filename).toBe("星轨_分镜表.csv")
  expect(storyboardExport.text).toContain("\"编号\",\"标题\",\"景别\",\"运镜\",\"时长\",\"角色\",\"对白\"")
  expect(storyboardExport.text).toContain("\"1\",\"参考分镜 1\"")
  expect(storyboardExport.text).toContain("\"2\",\"参考分镜 2\"")
  expect(storyboardExport.text).toContain("\"reference-video\",\"3s\"")
  expect(storyboardExport.text).toContain("\"reference-video\",\"2s\"")
})
