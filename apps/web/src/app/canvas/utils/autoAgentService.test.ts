import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  buildAutoAgentPlanningActions,
  buildAutoAgentClarificationResponseActions,
  processWithAutoAgent,
  shouldFallbackToPlainChat,
} from "./autoAgentService.ts"
import type { AutoAgentAction } from "../../../lib/ai/agents/agent-auto.ts"

function makeAction(intent: AutoAgentAction["intent"], params: Record<string, any> = {}): AutoAgentAction {
  return {
    intent,
    params,
    confidence: 0.95,
    description: intent,
  }
}

describe("buildAutoAgentPlanningActions", () => {
  it("does not fallback to plain chat for vague but clearly creative intent", () => {
    const action = makeAction("chat", { topic: "雨夜旧影院重逢短片创意" })
    action.confidence = 0.4

    assert.equal(
      shouldFallbackToPlainChat(action, "帮我把这个想法做成一个短片：雨夜旧影院里两个人重逢。"),
      false,
    )
  })

  it("still falls back to plain chat for genuine casual conversation", () => {
    const action = makeAction("chat", { topic: "你好" })
    action.confidence = 0.4

    assert.equal(shouldFallbackToPlainChat(action, "你好"), true)
    assert.equal(shouldFallbackToPlainChat(action, "谢谢"), true)
  })

  it("asks a clarification question for low-confidence creative requests instead of falling back to plain chat", async () => {
    const originalFetch = globalThis.fetch
    let fallbackCalled = false
    const emittedActions: any[] = []
    const emittedText: string[] = []

    globalThis.fetch = async () => {
      const encoder = new TextEncoder()
      const payload = JSON.stringify({
        content: JSON.stringify({
          intent: "chat",
          params: { topic: "雨夜旧影院重逢短片创意" },
          description: "低置信度普通聊天",
          confidence: 0.4,
        }),
      })

      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(`data: ${payload}\n\n`))
            controller.enqueue(encoder.encode("data: [DONE]\n\n"))
            controller.close()
          },
        }),
        { status: 200 },
      )
    }

    try {
      await processWithAutoAgent("帮我把这个想法做成一个短片：雨夜旧影院里两个人重逢。", {
        onFallbackChat: async () => {
          fallbackCalled = true
        },
        onActions: (actions) => {
          emittedActions.push(...actions)
        },
        onText: (text) => {
          emittedText.push(text)
        },
      })
    } finally {
      globalThis.fetch = originalFetch
    }

    assert.equal(fallbackCalled, false)
    assert.equal(emittedActions.length, 1)
    assert.equal(emittedActions[0].action, "ask_clarification")
    assert.match(emittedActions[0].question, /想把它推进到哪一步/)
    assert.ok(emittedActions[0].options.includes("生成分镜"))
    assert.match(emittedText.join("\n"), /我先确认一下创作方向/)
  })

  it("surfaces provider contract errors before auto-agent image generation sends a real image request", async () => {
    const originalFetch = globalThis.fetch
    const emittedText: string[] = []
    const capturedErrors: Error[] = []
    const requestedUrls: string[] = []

    globalThis.fetch = async (url) => {
      const target = String(url)
      requestedUrls.push(target)

      if (target.includes("/api/ai/chat/stream")) {
        const encoder = new TextEncoder()
        const payload = JSON.stringify({
          content: JSON.stringify({
            intent: "generate-image",
            params: { prompt: "雨夜旧影院电影感剧照" },
            description: "生成图片",
            confidence: 0.95,
          }),
        })
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode(`data: ${payload}\n\n`))
              controller.enqueue(encoder.encode("data: [DONE]\n\n"))
              controller.close()
            },
          }),
          { status: 200 },
        )
      }

      if (target.includes("/api/ai/config")) {
        return new Response(
          JSON.stringify({
            baseUrl: "",
            hasApiKey: false,
            defaultModel: "gpt-5.5",
            defaultImageModel: "gpt-image-2",
            timeoutMs: 120000,
          }),
          { status: 200 },
        )
      }

      return new Response(JSON.stringify({ imageUrl: "blob:should-not-happen" }), { status: 200 })
    }

    try {
      await assert.rejects(
        processWithAutoAgent("来一张雨夜旧影院的电影感剧照", {
          imageModel: "vidu",
          onText: (text) => emittedText.push(text),
          onError: (error) => capturedErrors.push(error),
        }),
      )
    } finally {
      globalThis.fetch = originalFetch
    }

    assert.equal(capturedErrors[0]?.name, "ImageGenerationError")
    assert.match(capturedErrors[0]?.message ?? "", /Vidu|路由/)
    assert.match(emittedText.at(-1) ?? "", /当前模型\/Provider 配置不兼容/)
    assert.equal(requestedUrls.some((target) => target.includes("/api/ai/generate-image")), false)
  })

  it("turns a clarification answer into storyboard actions", () => {
    const actions = buildAutoAgentClarificationResponseActions({
      action: "ask_clarification",
      question: "你想把它推进到哪一步？",
      options: ["生成分镜", "拆成制作圣经"],
      data: {
        originalInput: "雨夜旧影院里两个人重逢。",
      },
    }, "生成分镜")

    assert.equal(actions.length, 3)
    assert.equal(actions[0].action, "create_node")
    assert.equal(actions[0].nodeKind, "storyboard")
    assert.match(actions[0].prompt ?? "", /专业影视分镜/)
    assert.match(actions[0].content ?? "", /雨夜旧影院/)
    assert.equal(actions[1].action, "generate_storyboard")
    assert.equal(actions[1].sourceNodeId, "Auto Agent 分镜草案")
    assert.equal(actions[1].shots?.length, 1)
    assert.match(actions[1].shots?.[0]?.content ?? "", /雨夜旧影院/)
    assert.equal(actions[2].action, "open_panel")
    assert.equal(actions[2].panel, "production_queue")
  })

  it("turns a clarification answer into a production bible chain", () => {
    const actions = buildAutoAgentClarificationResponseActions({
      action: "ask_clarification",
      question: "你想把它推进到哪一步？",
      options: ["生成分镜", "拆成制作圣经"],
      data: {
        originalInput: "第一集：雨夜，女主林雾带着旧相机回到废弃电影院。男主周祁在放映室发现一卷失踪胶片。",
      },
    }, "拆成制作圣经")

    const createNodes = actions.filter((action) => action.action === "create_node")
    const runNodes = actions.filter((action) => action.action === "run_node")
    const openPanels = actions.filter((action) => action.action === "open_panel")

    assert.equal(createNodes.length, 7)
    assert.equal(runNodes.length, 2)
    assert.equal(openPanels.length, 1)
    assert.equal(createNodes[0].title, "制作圣经：一句话创意制作资产拆解")
    assert.equal((createNodes[0].data as Record<string, unknown>).productionBibleKind, "overview")
    assert.equal((createNodes[2].data as Record<string, unknown>).assetLibraryFolder, "Character")
    const characterSeeds = (createNodes[2].data as Record<string, unknown>).characterAssetSeeds as Array<Record<string, unknown>>
    assert.deepEqual(characterSeeds.map((seed) => seed.name), ["林雾", "周祁"])
    assert.equal(runNodes[0].title, "分镜拆解任务")
    assert.equal(openPanels[0].panel, "project_bible")
  })

  it("turns a clarification answer into a video task", () => {
    const actions = buildAutoAgentClarificationResponseActions({
      action: "ask_clarification",
      question: "你想把它推进到哪一步？",
      options: ["建立视频生成任务"],
      data: {
        originalInput: "雨夜旧影院里两个人重逢。",
      },
    }, "建立视频生成任务")

    assert.equal(actions.length, 1)
    assert.equal(actions[0].action, "create_node")
    assert.equal(actions[0].nodeKind, "video-generation")
    assert.match(actions[0].prompt ?? "", /雨夜旧影院/)
  })

  it("creates a character compliance report from shot context", () => {
    const actions = buildAutoAgentPlanningActions(
      makeAction("validate-character-consistency"),
      "检查角色漂移",
      {
        nodes: [
          {
            id: "shot-1",
            type: "shot",
            nodeKind: "shot",
            title: "镜头一",
            shot: {
              characterIdentities: [
                { name: "阿岚", visualSignature: "短发，左脸痣", costume: "黑色风衣", avatarUrl: "data:image/png;base64,a" },
              ],
            },
          },
          {
            id: "shot-2",
            type: "shot",
            nodeKind: "shot",
            title: "镜头二",
            shot: {
              characterIdentities: [
                { name: "阿岚", visualSignature: "长发，左脸痣", costume: "红色外套" },
              ],
            },
          },
        ],
      },
    )

    assert.equal(actions.length, 1)
    assert.equal(actions[0].action, "create_node")
    assert.equal(actions[0].nodeType, "content")
    assert.equal(actions[0].nodeKind, "document")
    assert.equal(actions[0].title, "角色合规验证报告")
    assert.match(actions[0].content ?? "", /检查镜头数：2/)
    assert.match(actions[0].content ?? "", /阿岚：不同镜头存在多个外貌签名版本/)
    assert.match(actions[0].content ?? "", /镜头二 \/ 阿岚：缺少 参考图/)
  })

  it("creates a batch shot variation report using existing shots", () => {
    const actions = buildAutoAgentPlanningActions(
      makeAction("batch-shot-variation", { count: 3, style: "悬疑" }),
      "给我三套组镜变化",
      {
        nodes: [
          { id: "s1", type: "shot", nodeKind: "shot", title: "雨夜门口", description: "女主停在电影院门外。" },
          { id: "s2", type: "shot", nodeKind: "shot", title: "空大厅", description: "大厅尽头出现手电光。" },
        ],
      },
    )

    assert.equal(actions.length, 1)
    assert.equal(actions[0].title, "批量组镜变化方案")
    assert.match(actions[0].content ?? "", /雨夜门口：女主停在电影院门外/)
    assert.match(actions[0].content ?? "", /变化 A：节奏强化版/)
    assert.match(actions[0].content ?? "", /变化 B：悬疑信息差版/)
    assert.match(actions[0].content ?? "", /变化 C：视觉冲击版/)
  })

  it("creates the script-to-concept node bundle", () => {
    const actions = buildAutoAgentPlanningActions(
      makeAction("script-to-concept", {
        script: "雨夜，一个女孩走进废弃电影院，银幕突然亮起。",
        genre: "都市悬疑",
        style: "neo-noir, cinematic lighting",
      }),
      "从这个剧本生成概念图",
    )

    assert.equal(actions.length, 5)
    assert.deepEqual(actions.map((action) => action.title), [
      "剧本源文本",
      "角色概念图 Prompt",
      "场景概念图 Prompt",
      "整体视觉概念图生成",
      "整体视觉概念图生成",
    ])
    assert.equal(actions[0].nodeType, "content")
    assert.equal(actions[0].nodeKind, "storyboard")
    assert.equal(actions[3].action, "create_node")
    assert.equal(actions[3].nodeType, "workflow")
    assert.equal(actions[3].nodeKind, "image-generation")
    assert.match(actions[3].prompt ?? "", /都市悬疑/)
    assert.match(actions[3].prompt ?? "", /neo-noir/)
    assert.equal((actions[3].data as Record<string, unknown>).autoRunRecommended, true)
    assert.equal(actions[4].action, "run_node")
    assert.equal(actions[4].title, "整体视觉概念图生成")
  })

  it("creates a production asset bible chain for long script assets", () => {
    const actions = buildAutoAgentPlanningActions(
      makeAction("extract-production-assets", {
        script: "第一集：雨夜，女主林雾带着旧相机回到废弃电影院。男主周祁在放映室发现一卷失踪胶片。",
        goal: "悬疑短剧制作资产拆解",
        genre: "都市悬疑",
        style: "neo-noir, rainy night, cinematic lighting",
        targetPlatform: "short-drama",
      }),
      "把这段短剧拆成制作圣经和资产清单",
    )

    const createNodes = actions.filter((a) => a.action === "create_node")
    const runNodes = actions.filter((a) => a.action === "run_node")

    assert.equal(createNodes.length, 7)
    assert.equal(runNodes.length, 2)
    assert.deepEqual(createNodes.map((action) => action.title), [
      "制作圣经：悬疑短剧制作资产拆解",
      "源剧本：悬疑短剧制作资产拆解",
      "角色资产 Bible",
      "场景资产 Bible",
      "道具服装资产清单",
      "分镜拆解任务",
      "一致性与缺口检查",
    ])
    assert.equal(createNodes[0].nodeKind, "document")
    assert.equal((createNodes[0].data as Record<string, unknown>).productionBibleKind, "overview")
    assert.match(createNodes[0].content ?? "", /目标平台：short-drama/)
    assert.match(createNodes[2].prompt ?? "", /character bible/i)
    assert.equal((createNodes[2].data as Record<string, unknown>).syncToAssetLibrary, true)
    assert.equal((createNodes[2].data as Record<string, unknown>).assetLibraryFolder, "Character")
    const characterSeeds = (createNodes[2].data as Record<string, unknown>).characterAssetSeeds as Array<Record<string, unknown>>
    assert.deepEqual(characterSeeds.map((seed) => seed.name), ["林雾", "周祁"])
    assert.deepEqual(characterSeeds.map((seed) => seed.role), ["女主", "男主"])
    assert.equal(createNodes[5].nodeKind, "storyboard")
    assert.equal((createNodes[5].data as Record<string, unknown>).storyboardAssistantStage, "storyboard-text")
    assert.equal(runNodes[0].title, "分镜拆解任务")
    assert.equal(runNodes[1].title, "一致性与缺口检查")
  })

  it("creates the multi-step pipeline node chain with executable steps", () => {
    const actions = buildAutoAgentPlanningActions(
      makeAction("multi-step-pipeline", {
        goal: "古风仙侠微短剧",
        genre: "古装仙侠",
        style: "水墨画风",
        steps: [
          { type: "script", description: "生成剧本" },
          { type: "character", description: "角色 Bible" },
          { type: "scene", description: "场景 Bible" },
          { type: "storyboard", description: "拆解分镜" },
          { type: "concept", description: "生成概念图" },
          { type: "continuity", description: "一致性校验" },
        ],
      }),
      "帮我做一部古风仙侠微短剧",
    )

    // 1 overview + 6 step nodes + 2 run_node (concept, storyboard) + 1 run_node (pipeline) = 10
    const createNodes = actions.filter((a) => a.action === "create_node")
    const runNodes = actions.filter((a) => a.action === "run_node")
    assert.equal(createNodes.length, 7, "应该创建 1 个总览 + 6 个步骤节点")
    assert.equal(runNodes.length, 3, "应该追加 3 个 run_node（concept, storyboard, pipeline）")
    assert.equal(actions.length, 10)

    // Overview node
    assert.equal(createNodes[0].title?.slice(0, 3), "流水线")
    assert.match(createNodes[0].content ?? "", /古风仙侠微短剧/)
    assert.match(createNodes[0].content ?? "", /生成剧本/)
    assert.match(createNodes[0].content ?? "", /角色 Bible/)

    // Step nodes
    const titles = createNodes.map((n) => n.title)
    assert.match(titles[1] ?? "", /步骤 1/)
    assert.match(titles[2] ?? "", /步骤 2/)
    assert.match(titles[3] ?? "", /步骤 3/)
    assert.match(titles[4] ?? "", /步骤 4/)
    assert.match(titles[5] ?? "", /步骤 5/)
    assert.match(titles[6] ?? "", /步骤 6/)

    // Storyboard step (index 4) should be "content" type with storyboardAssistantStage
    assert.equal(createNodes[4].nodeType, "content")
    assert.equal(createNodes[4].nodeKind, "storyboard")
    assert.equal((createNodes[4].data as Record<string, unknown>).storyboardAssistantStage, "storyboard-text")

    // Concept step (index 5) should be "workflow" type with image-generation
    assert.equal(createNodes[5].nodeType, "workflow")
    assert.equal(createNodes[5].nodeKind, "image-generation")
    assert.equal((createNodes[5].data as Record<string, unknown>).autoRunRecommended, true)

    // run_node for storyboard (step type "storyboard" comes before "concept" in iteration)
    assert.equal(runNodes[0].title, createNodes[4].title)
    // run_node for concept
    assert.equal(runNodes[1].title, createNodes[5].title)
    // run_node for pipeline overview
    assert.equal(runNodes[2].title, createNodes[0].title)
  })
})
