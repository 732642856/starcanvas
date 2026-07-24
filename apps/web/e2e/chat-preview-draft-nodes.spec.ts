import { expect, test, type Page } from "@playwright/test"

import { gotoCanvas } from "./utils"
import { createTestProjectId } from "./utils/project"
import { clearBrowserStorage } from "./utils/storage"

type ChatStreamRequest = {
  message?: string
  model?: string
  context?: Record<string, unknown>
}

type StarCanvasNode = {
  id: string
  data?: Record<string, any>
}

type StarCanvasEdge = {
  id: string
  source: string
  target: string
}

type StarCanvasE2EState = {
  getEdges?: () => StarCanvasEdge[]
  getNodes?: () => StarCanvasNode[]
}

function streamText(content: string): string {
  return `data: ${JSON.stringify({ content })}\n\ndata: [DONE]\n\n`
}

function streamCanvasActions(actions: unknown[]): string {
  return streamText(
    [
      "我已经准备好了这组草稿节点。",
      "```canvas-actions",
      JSON.stringify({ actions }, null, 2),
      "```",
    ].join("\n"),
  )
}

async function mockGenerateCharacterIntent(page: Page, requests: ChatStreamRequest[]): Promise<void> {
  let round = 0
  await page.route("**/api/ai/chat/stream", async (route) => {
    const requestBody = route.request().postDataJSON() as ChatStreamRequest
    requests.push(requestBody)
    round += 1

    const content =
      round === 1
        ? JSON.stringify({
            intent: "generate-character",
            params: {
              name: "林雾",
              role: "主角",
              description: "冷静克制的女摄影师，背着旧相机，雨夜霓虹气质。",
            },
            description: "正在生成角色设定",
            confidence: 0.93,
          })
        : JSON.stringify({
            intent: "generate-character",
            params: {
              name: "周祁",
              role: "男主",
              description: "沉默警觉的放映员，穿深色风衣，带一点危险感。",
            },
            description: "正在生成角色设定",
            confidence: 0.91,
          })

    await route.fulfill({
      status: 200,
      contentType: "text/event-stream; charset=utf-8",
      body: streamText(content),
    })
  })
}

async function readCanvasState(page: Page): Promise<{ edges: StarCanvasEdge[]; nodes: StarCanvasNode[] }> {
  return page.evaluate(() => {
    const e2eState = (window as Window & { __starcanvasE2E?: StarCanvasE2EState }).__starcanvasE2E
    return {
      edges: e2eState?.getEdges?.() ?? [],
      nodes: e2eState?.getNodes?.() ?? [],
    }
  })
}

async function findNodeByTitle(page: Page, title: string): Promise<StarCanvasNode | undefined> {
  const state = await readCanvasState(page)
  return state.nodes.find((node) => String(node.data?.title || "") === title)
}

async function openChatPanel(page: Page): Promise<void> {
  const panel = page.getByTestId("chat-panel")
  if (!(await panel.isVisible())) {
    await page.getByTestId("chat-toggle").click()
  }
  await expect(panel).toBeVisible()
}

async function expectDraftNode(page: Page, title: string): Promise<StarCanvasNode> {
  await expect
    .poll(async () => {
      const node = await findNodeByTitle(page, title)
      return node
        ? {
            id: node.id,
            isDraft: node.data?.isDraft === true,
            draftSourceChatId: typeof node.data?.draftSourceChatId === "string",
          }
        : null
    }, { timeout: 20_000 })
    .toEqual({
      id: expect.any(String),
      isDraft: true,
      draftSourceChatId: true,
    })

  const node = await findNodeByTitle(page, title)
  if (!node) {
    throw new Error(`Expected draft node "${title}" to exist`)
  }
  return node
}

test("chat preview mode creates draft nodes that can be confirmed or discarded", async ({ page }) => {
  const requests: ChatStreamRequest[] = []
  const projectId = createTestProjectId("chat-preview-draft-nodes")

  await clearBrowserStorage(page)
  await mockGenerateCharacterIntent(page, requests)
  await gotoCanvas(page, projectId)
  await openChatPanel(page)

  const panel = page.getByTestId("chat-panel")
  await panel.getByRole("button", { name: "先预览" }).click()

  await panel
    .getByRole("textbox", { name: /输入你的具体需求|根据选中节点提问/ })
    .fill("请帮我设计主角林雾的人设。")
  await panel.getByTitle("发送").click()

  await expect.poll(() => requests.length, { timeout: 20_000 }).toBe(1)
  expect(requests[0].context?.systemOverride).toEqual(expect.any(String))

  const firstNode = await expectDraftNode(page, "角色设定：林雾")
  await expect(panel.getByTestId("chat-preview-transaction-status")).toBeVisible()
  await expect(panel.getByRole("button", { name: /\u6267\u884c \d+ \u4e2a\u64cd\u4f5c/ })).toHaveCount(0)
  const firstDraftNode = page.locator(`[data-id='${firstNode.id}']`)
  const confirmButton = firstDraftNode.getByTestId("draft-confirm")
  await expect(confirmButton).toBeVisible()
  await expect.poll(async () => {
    try {
      await confirmButton.click({ trial: true, timeout: 500 })
      return true
    } catch {
      return false
    }
  }, { timeout: 20_000 }).toBe(true)
  await confirmButton.click()

  await expect
    .poll(async () => {
      const node = await findNodeByTitle(page, "角色设定：林雾")
      return node
        ? {
            isDraft: node.data?.isDraft === true,
            pendingExecution: node.data?.pendingExecution === true,
          }
        : null
    }, { timeout: 20_000 })
    .toEqual({
      isDraft: false,
      pendingExecution: false,
    })

  await panel
    .getByRole("textbox", { name: /输入你的具体需求|根据选中节点提问/ })
    .fill("再补一个男主周祁的人设。")
  await panel.getByTitle("发送").click()

  await expect.poll(() => requests.length, { timeout: 20_000 }).toBe(2)
  const secondNode = await expectDraftNode(page, "角色设定：周祁")
  const secondDraftNode = page.locator(`[data-id='${secondNode.id}']`)
  const discardButton = secondDraftNode.getByTestId("draft-discard")
  await expect(discardButton).toBeVisible()
  await expect.poll(async () => {
    try {
      await discardButton.click({ trial: true, timeout: 500 })
      return true
    } catch {
      return false
    }
  }, { timeout: 20_000 }).toBe(true)
  await discardButton.click()

  await expect
    .poll(async () => {
      const node = await findNodeByTitle(page, "角色设定：周祁")
      return Boolean(node)
    }, { timeout: 20_000 })
    .toBe(false)

  await expect
    .poll(async () => {
      const state = await readCanvasState(page)
      return state.edges.every((edge) => edge.source !== secondNode.id && edge.target !== secondNode.id)
    }, { timeout: 20_000 })
    .toBe(true)

  expect(firstNode.id).not.toBe(secondNode.id)
})

test("chat preview mode applies deferred connections after all draft nodes are confirmed", async ({ page }) => {
  const projectId = createTestProjectId("chat-preview-deferred-connect")

  await clearBrowserStorage(page)
  await page.route("**/api/ai/chat/stream", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream; charset=utf-8",
      body: streamCanvasActions([
        {
          action: "create_node",
          nodeType: "content",
          nodeKind: "document",
          title: "角色设定：林雾",
          content: "# 林雾\n冷静克制的女摄影师。",
        },
        {
          action: "create_node",
          nodeType: "content",
          nodeKind: "document",
          title: "角色设定：周祁",
          content: "# 周祁\n沉默警觉的放映员。",
        },
        {
          action: "connect_nodes",
          sourceId: "角色设定：林雾",
          targetId: "角色设定：周祁",
          description: "连接两位角色设定节点",
        },
      ]),
    })
  })

  await gotoCanvas(page, projectId)
  await openChatPanel(page)

  const panel = page.getByTestId("chat-panel")
  await panel.getByRole("button", { name: "先预览" }).click()
  await panel
    .getByRole("textbox", { name: /输入你的具体需求|根据选中节点提问/ })
    .fill("执行批次 alpha")
  await panel.getByTitle("发送").click()

  const firstNode = await expectDraftNode(page, "角色设定：林雾")
  const secondNode = await expectDraftNode(page, "角色设定：周祁")

  await expect
    .poll(async () => {
      const state = await readCanvasState(page)
      return state.edges.length
    }, { timeout: 20_000 })
    .toBe(0)

  const firstDraftNode = page.locator(`[data-id='${firstNode.id}']`)
  await firstDraftNode.getByTestId("draft-confirm").click()

  await expect
    .poll(async () => {
      const state = await readCanvasState(page)
      return state.edges.length
    }, { timeout: 20_000 })
    .toBe(0)

  const secondDraftNode = page.locator(`[data-id='${secondNode.id}']`)
  await secondDraftNode.getByTestId("draft-confirm").click()

  await expect
    .poll(async () => {
      const state = await readCanvasState(page)
      return state.edges.map((edge) => ({
        source: edge.source,
        target: edge.target,
      }))
    }, { timeout: 20_000 })
    .toEqual([
      {
        source: firstNode.id,
        target: secondNode.id,
      },
    ])
})
