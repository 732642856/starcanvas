import assert from "node:assert/strict"
import test from "node:test"

import { detectIntent } from "../../../lib/ai/agents/agent-auto.ts"
import type { ChatCanvasAction } from "../features/canvas/actions/chatActions.ts"
import { processWithAutoAgent, shouldFallbackToPlainChat } from "./autoAgentService.ts"

const REAL_PROVIDER_SMOKE_ENABLED = process.env.STARCANVAS_REAL_PROVIDER_AUTO_AGENT_SMOKE === "1"
const REAL_PROVIDER_IMAGE_SMOKE_ENABLED = process.env.STARCANVAS_REAL_PROVIDER_AUTO_AGENT_IMAGE_SMOKE === "1"
const REAL_PROVIDER_BASE_URL =
  process.env.STARCANVAS_REAL_PROVIDER_BASE_URL ||
  process.env.STARCANVAS_E2E_BASE_URL ||
  "http://127.0.0.1:3100"

const PROJECT_BIBLE_SMOKE_PROMPT =
  "把这个短片想法拆成制作圣经，不要生成图片或视频，只先输出角色、场景和分镜任务：雨夜里，女主林雾回到废弃电影院，男主周祁在放映室等她。"
const IMAGE_SMOKE_PROMPT =
  "请生成一张 1024x1024 的电影感海报：雨夜里旧电影院门口，两个人隔街对望，写实风格。"

function rewriteRelativeUrl(input: string, baseURL: string): string {
  if (/^https?:\/\//.test(input)) return input
  return new URL(input, baseURL).toString()
}

async function assertLocalConfigEndpointReady(baseURL: string): Promise<void> {
  const response = await fetch(new URL("/api/ai/config", baseURL), {
    signal: AbortSignal.timeout(15_000),
  })

  assert.equal(response.ok, true, `expected ${baseURL}/api/ai/config to be ready`)
}

test("real provider smoke keeps Auto Agent project-bible bootstrap on the creative lane", {
  timeout: 240_000,
}, async (t) => {
  if (!REAL_PROVIDER_SMOKE_ENABLED) {
    t.skip("set STARCANVAS_REAL_PROVIDER_AUTO_AGENT_SMOKE=1 to run real provider smoke")
    return
  }

  await assertLocalConfigEndpointReady(REAL_PROVIDER_BASE_URL)

  const nativeFetch = globalThis.fetch
  const blockedMediaCalls: string[] = []
  const emittedTexts: string[] = []
  const emittedActions: ChatCanvasAction[] = []
  let fallbackCalled = false

  globalThis.fetch = (async (input, init) => {
    const rawUrl =
      typeof input === "string" || input instanceof URL
        ? String(input)
        : input.url
    const url = rewriteRelativeUrl(rawUrl, REAL_PROVIDER_BASE_URL)

    if (
      url.includes("/api/ai/generate-image") ||
      url.includes("/api/ai/generate-video") ||
      url.includes("/api/ai/generate-video-vidu") ||
      url.includes("/api/ai/moodboard")
    ) {
      blockedMediaCalls.push(url)
      throw new Error(`unexpected media generation during text-only auto-agent smoke: ${url}`)
    }

    return nativeFetch(url, init)
  }) as typeof fetch

  try {
    const action = await processWithAutoAgent(PROJECT_BIBLE_SMOKE_PROMPT, {
      onActions(actions) {
        emittedActions.push(...actions)
      },
      onText(text) {
        emittedTexts.push(text)
      },
      async onFallbackChat() {
        fallbackCalled = true
      },
    })

    assert.equal(fallbackCalled, false)
    assert.equal(shouldFallbackToPlainChat(action, PROJECT_BIBLE_SMOKE_PROMPT), false)
    assert.equal(action.intent, "extract-production-assets")
    assert.ok(
      emittedTexts.some((item) => item.includes("已创建")),
      "expected auto agent to report created nodes",
    )

    const createdTitles = emittedActions
      .filter((item) => item.action === "create_node")
      .map((item) => item.title)
      .filter((item): item is string => Boolean(item))

    assert.ok(createdTitles.some((item) => item.includes("制作圣经")))
    assert.ok(createdTitles.includes("角色资产 Bible"))
    assert.ok(createdTitles.includes("场景资产 Bible"))
    assert.ok(createdTitles.includes("分镜拆解任务"))
    assert.deepEqual(blockedMediaCalls, [])
  } finally {
    globalThis.fetch = nativeFetch
  }
})

test("real provider smoke keeps Auto Agent image intent on the creative lane", {
  timeout: 240_000,
}, async (t) => {
  if (!REAL_PROVIDER_IMAGE_SMOKE_ENABLED) {
    t.skip("set STARCANVAS_REAL_PROVIDER_AUTO_AGENT_IMAGE_SMOKE=1 to run real image smoke")
    return
  }

  await assertLocalConfigEndpointReady(REAL_PROVIDER_BASE_URL)

  const nativeFetch = globalThis.fetch
  const requestedUrls: string[] = []
  const emittedActions: ChatCanvasAction[] = []
  const emittedTexts: string[] = []
  let generatedImageUrl: string | null = null

  globalThis.fetch = (async (input, init) => {
    const rawUrl =
      typeof input === "string" || input instanceof URL
        ? String(input)
        : input.url
    const url = rewriteRelativeUrl(rawUrl, REAL_PROVIDER_BASE_URL)
    requestedUrls.push(url)

    if (url.includes("/api/ai/generate-video") || url.includes("/api/ai/generate-video-vidu")) {
      throw new Error(`unexpected video generation during auto-agent image smoke: ${url}`)
    }

    return nativeFetch(url, init)
  }) as typeof fetch

  try {
    const action = await processWithAutoAgent(IMAGE_SMOKE_PROMPT, {
      imageModel: "gpt-image-2",
      onActions(actions) {
        emittedActions.push(...actions)
      },
      onText(text) {
        emittedTexts.push(text)
      },
      onImageGenerated(data) {
        generatedImageUrl = data.imageUrl
      },
    })
    assert.equal(action.intent, "generate-image")
    assert.equal(shouldFallbackToPlainChat(action, IMAGE_SMOKE_PROMPT), false)
    assert.ok(requestedUrls.some((url) => url.includes("/api/ai/chat/stream")))
    assert.ok(requestedUrls.some((url) => url.includes("/api/ai/generate-image")))
    if (generatedImageUrl) {
      assert.match(generatedImageUrl, /^(https?:\/\/|blob:|data:image)/)
      assert.equal(emittedActions.length, 0)
    } else {
      const promptFallback = emittedActions.find(
        (item) => item.action === "create_node" && item.nodeKind === "prompt",
      )
      assert.equal(promptFallback?.title, "概念图待重试 Prompt")
      assert.match(promptFallback?.content ?? "", /电影感海报|旧电影院/)
      assert.ok(emittedTexts.some((text) => text.includes("Prompt 节点")))
    }
  } finally {
    globalThis.fetch = nativeFetch
  }
})
