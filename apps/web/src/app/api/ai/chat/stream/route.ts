// ============================================================================
// SSE Streaming Chat API Route
// Implements Server-Sent Events for real-time AI response streaming
// Supports: text models (OpenAI-compatible), image models, video models
// ============================================================================
import { NextRequest, NextResponse } from "next/server"
import { mergeProviderConfig, isImageModel, isChatModel, isVideoModel } from "@/lib/ai/provider-config"
import type { AiProviderOverrides } from "@/lib/ai/provider-config"
import { fetchWithTimeout } from "@/lib/ai/server-fetch"

// ============================================================================
// CONFIGURATION - read from environment (server-side only)
// ============================================================================
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "true"

// P2-5B: Lazy config with optional overrides
function getConfig(overrides?: AiProviderOverrides) {
  return mergeProviderConfig(overrides)
}

// ============================================================================
// MODEL ENDPOINT RESOLUTION — now driven by provider registry (dynamic, no hardcoded lists)
// ============================================================================

function resolveModelForMode(params: {
  requestedModel?: unknown
  requestedMode?: unknown
  defaultModel: string
  defaultImageModel: string
}): string {
  const requestedModel = typeof params.requestedModel === "string" ? params.requestedModel : undefined
  const requestedMode = params.requestedMode === "image" ? "image" : "chat"

  if (requestedMode === "image") {
    return requestedModel && isImageModel(requestedModel) ? requestedModel : params.defaultImageModel
  }

  return requestedModel && isChatModel(requestedModel) ? requestedModel : params.defaultModel
}

const getEndpointForModel = (model: string, baseUrl: string): { endpoint: string; bodyTransformer: (body: any) => any } => {
  // 文本对话模型 → /v1/chat/completions
  if (isChatModel(model)) {
    return {
      endpoint: `${baseUrl}/chat/completions`,
      bodyTransformer: (body) => ({
        model: model,
        messages: body.messages,
        stream: true,
      }),
    }
  }

  // 图像生成模型 → /v1/images/generations
  if (isImageModel(model)) {
    return {
      endpoint: `${baseUrl}/images/generations`,
      bodyTransformer: (body) => ({
        model: model,
        prompt: body.messages?.[body.messages.length - 1]?.content || "",
        n: 1,
        size: "1024x576",
      }),
    }
  }

  // 视频生成模型 → chat/completions fallback（Provider Registry 已声明模型能力）
  if (isVideoModel(model)) {
    return {
      endpoint: `${baseUrl}/chat/completions`,
      bodyTransformer: (body) => ({
        model: model,
        messages: body.messages,
        stream: true,
      }),
    }
  }

  // 默认 → chat/completions
  return {
    endpoint: `${baseUrl}/chat/completions`,
    bodyTransformer: (body) => ({
      model: model,
      messages: body.messages,
      stream: true,
    }),
  }
}

// ============================================================================
// CONTEXT DETERMINATION
// ============================================================================
const CASUAL_PATTERNS = /^(你好|您好|嗨|哈喽|hello|hi|hey|在吗|早上好|下午好|晚上好|谢谢|感谢|辛苦了|ok|好的|收到|嗯|啊|哈)$/i

const isCasualMessage = (text: string): boolean => {
  return CASUAL_PATTERNS.test(text.trim().replace(/[。！!？?~～,.，\s]/g, ""))
}

const wantsCanvasContext = (input: string): boolean => {
  const contextKeywords = [
    "当前画布", "画布上", "这些节点", "所有节点", "节点们", "节点",
    "这些图片", "素材", "全部素材", "项目", "画布",
    "这张图", "这张图片", "根据这张图", "根据这张图片", "分析这张图", "分析这张图片",
    "图片", "首帧", "图生成", "生成图",
    "改短一点", "改长一点", "改一下", "改写", "润色", "优化这段", "这段", "这个文本",
    "这段话", "这句话", "这个 prompt", "这段 prompt", "prompt改", "改 prompt",
    "拆分镜", "拆成", "分镜", "继续分镜", "首帧",
    "生成首帧", "生成图", "生成图片", "生成 prompt", "生成 Prompt",
    "根据素材", "根据图片", "分析素材",
    "参照", "参考", "这张", "那张",
  ]
  return contextKeywords.some(k => input.includes(k))
}

// ============================================================================
// MESSAGE BUILDING
// ============================================================================
type CanvasNodeContext = {
  id: string
  type?: string
  nodeKind?: string
  title?: string
  prompt?: string
  content?: string
  summary?: string
  workflowRole?: string
  status?: string
  model?: string
  duration?: string
  fileName?: string
  mimeType?: string
  imageUrl?: string
  assetUrl?: string
  inputs?: Array<{ label?: string; type?: string }>
  outputs?: Array<{ label?: string; type?: string; url?: string }>
}

function summarizeNode(node: CanvasNodeContext): string {
  const pieces = [
    `[${node.nodeKind || node.type || "node"}] ${node.title || "未命名节点"}`,
    node.workflowRole ? `角色: ${node.workflowRole}` : undefined,
    node.status ? `状态: ${node.status}` : undefined,
    node.model ? `模型: ${node.model}` : undefined,
    node.duration ? `时长: ${node.duration}` : undefined,
    node.prompt ? `Prompt: ${node.prompt.slice(0, 180)}` : undefined,
    node.content ? `内容: ${node.content.slice(0, 180)}` : undefined,
    node.summary ? `摘要: ${node.summary.slice(0, 180)}` : undefined,
    node.fileName ? `文件: ${node.fileName}` : undefined,
    node.imageUrl ? "包含图片素材" : undefined,
    node.inputs?.length ? `输入: ${node.inputs.map((item) => item.label).join("/")}` : undefined,
    node.outputs?.length ? `输出: ${node.outputs.map((item) => item.label).join("/")}` : undefined,
  ]

  return pieces.filter(Boolean).join(" | ")
}

// ============================================================================
// CANVAS ACTION TYPES — import from canonical source (client path maps to same)
// ============================================================================
// NOTE: Route files can't import from client-side hooks directly, so we
// keep an inlined subset. The canonical source is:
//   apps/web/src/app/canvas/features/canvas/actions/chatActions.ts
// Keep these in sync with that file.
// ============================================================================
export type CanvasActionType =
  | "create_node"
  | "update_node"
  | "connect_nodes"
  | "select_node"
  | "focus_node"
  | "run_node"
  | "create_workflow_template"
  | "open_panel"
  | "generate_storyboard"
  | "layout_canvas"
  | "delete_node"

export interface CanvasAction {
  action: CanvasActionType
  // create_node
  nodeType?: "content" | "image" | "workflow" | "agent"
  nodeKind?: string
  title?: string
  content?: string
  prompt?: string
  position?: { x: number; y: number }
  data?: Record<string, unknown>
  // update_node
  nodeId?: string
  updates?: Record<string, unknown>
  // connect_nodes
  sourceId?: string
  targetId?: string
  // select_node / focus_node / run_node / delete_node
  id?: string
  // create_workflow_template / open_panel / generate_storyboard / layout_canvas
  template?: "tapnow_preproduction" | "arc_reel_agent" | "video_preproduction"
  panel?: "chat" | "add_node" | "asset_library" | "project_bible" | "character_bible" | "scene_bible" | "style_bible" | "run_queue" | "property"
  layout?: "horizontal" | "vertical" | "grid"
  sourceNodeId?: string
  shots?: Array<{ title?: string; content?: string; prompt?: string; duration?: string; cameraMovement?: string; shotType?: string }>
  description?: string
}

const CANVAS_ACTION_SCHEMA = `
你除了可以用自然语言回答，还可以在回答中附带画布操作指令（JSON）。
当用户要求创建节点、修改节点、连接节点、选中节点等操作时，在回答末尾附加一个 JSON 代码块：

\`\`\`canvas-actions
{
  "actions": [
    {
      "action": "create_node",
      "nodeType": "content" | "image" | "workflow" | "agent",
      "nodeKind": "text" | "prompt" | "script" | "storyboard" | "image-generation" | "video-generation" | "audio" | "subtitle" | "composition" | "video-result" | "agent",
      "title": "节点标题",
      "content": "文本内容（content节点或 agent 指令）",
      "prompt": "提示词内容（prompt/workflow节点）",
      "position": { "x": 400, "y": 300 },
      "description": "告诉用户做了什么"
    },
    {
      "action": "update_node",
      "nodeId": "节点ID（必填，来自画布上下文）",
      "updates": { "title": "新标题", "content": "新内容" },
      "description": "告诉用户做了什么"
    },
    {
      "action": "connect_nodes",
      "sourceId": "源节点ID",
      "targetId": "目标节点ID",
      "description": "告诉用户做了什么"
    },
    {
      "action": "select_node",
      "nodeId": "节点ID",
      "description": "告诉用户做了什么"
    },
    {
      "action": "focus_node",
      "nodeId": "节点ID",
      "description": "告诉用户做了什么"
    },
    {
      "action": "run_node",
      "nodeId": "节点ID",
      "description": "告诉用户已建议运行哪个节点"
    },
    {
      "action": "create_workflow_template",
      "template": "arc_reel_agent" | "tapnow_preproduction" | "video_preproduction",
      "description": "创建可编辑的视频创作工作流模板"
    },
    {
      "action": "generate_storyboard",
      "title": "分镜标题",
      "shots": [
        { "title": "镜头 1", "content": "画面内容", "prompt": "首帧/视频提示词", "duration": "5s", "cameraMovement": "slow dolly in", "shotType": "medium shot" }
      ],
      "description": "把故事拆为可继续执行的分镜节点"
    },
    {
      "action": "open_panel",
      "panel": "chat" | "add_node" | "asset_library" | "project_bible" | "character_bible" | "scene_bible" | "style_bible" | "run_queue" | "property",
      "description": "打开用户下一步需要的面板"
    },
    {
      "action": "layout_canvas",
      "layout": "horizontal" | "vertical" | "grid",
      "description": "整理画布布局"
    },
    {
      "action": "delete_node",
      "nodeId": "节点ID",
      "description": "告诉用户删除了什么节点"
    }
  ]
}
\`\`\`

注意：
- actions 是数组，可以包含多个操作，它们会按顺序执行
- 纯问答类回复不需要附加 actions，只在用户明确要求画布操作时才添加
- nodeId 必须来自"画布节点摘要"中的真实 id，不能自行捏造
- create_node 不需要 nodeId，系统会自动生成；需要导演 Agent 时用 nodeType:"agent", nodeKind:"agent"
- position 是画布坐标（不是屏幕坐标），可省略让系统自动居中
- 用户要“一键做视频/从小说到视频/搭建完整流程/像 ArcReel 一样”时优先用 create_workflow_template，减少手写多个 create_node
- 用户要"拆分镜/生成镜头表"时优先用 generate_storyboard，shots 必须能直接形成可运行的镜头节点。**单次 generate_storyboard 的 shots 不要超过 6 个（系统上限 12 个，但用户界面不适合放太多）。如果用户没指定数量，默认拆分 4-6 个关键镜头即可，不用把每个细节都变成节点。对于长剧本，先拆关键镜头，问用户是否需要更多。**
- 用户要“打开素材库/Bible/队列/添加节点”时用 open_panel，不要只文字建议
- run_node 建议运行节点（默认不会自动执行，需用户确认）
- delete_node 仅当用户明确要求删除节点时使用
`

function buildSystemPrompt(context?: {
  nodes?: CanvasNodeContext[]
  selectedNode?: CanvasNodeContext
  selectedNodeId?: string
  mentionedNodes?: CanvasNodeContext[]
  attachments?: Array<{ id?: string; type?: string; name?: string; size?: number; mimeType?: string; width?: number; height?: number; textContent?: string }>
  canvasStats?: { total?: number; byKind?: Record<string, number> }
  mode?: string
}): string {
  let prompt = `你是星轨（StarTrails）的创作助手，一个专注于影视创作的 AI 工具。星轨帮助用户：
1. 把导演意图整理成 Prompt
2. 拆分镜头和分镜
3. 生成首帧图像
4. 组织文生视频 / 图生视频 / 音频 / 字幕 / 合成工作流
5. 在画布上理解并串联创作节点

你不是普通聊天机器人，而是 TapNow-like 画布 Agent 中控。工作方式参考：
- TapNow：Chat 读取画布素材，直接创建/连接/运行节点，不停留在建议层。
- ArcReel：小说/剧本 → 全局角色/线索提取 → 分集/剧本 JSON → 角色/道具/场景设计图 → 分镜图/宫格图 → 视频片段 → FFmpeg/剪映交付。
- FilmAgent：Director / Screenwriter / Actor / Cinematographer 多角色协作，先验证脚本、角色、摄影与场景一致性，再推进生成。

行动原则：用户要求优化、搭工作流、对标、继续完成任务时，优先输出 canvas-actions，让画布发生变化；不要只泛泛分析。能复用模板就用 create_workflow_template，能生成分镜就用 generate_storyboard，能打开面板就用 open_panel。

请用中文简洁、专业的语言回答。若用户正在讨论画布，请优先基于下方画布上下文回答，不要假装没看见节点。

${CANVAS_ACTION_SCHEMA}`

  const selectedNode = context?.selectedNode || (context?.selectedNodeId ? context.nodes?.find(n => n.id === context.selectedNodeId) : undefined)
  if (selectedNode) {
    prompt += `\n\n【当前选中节点】\n- ${summarizeNode(selectedNode)}`
  }

  if (context?.mentionedNodes?.length) {
    prompt += `\n\n【用户 @ 提到的节点】`
    context.mentionedNodes.slice(0, 8).forEach((node, i) => {
      prompt += `\n${i + 1}. ${summarizeNode(node)}`
    })
  }

  if (context?.canvasStats?.total || context?.nodes?.length) {
    const byKind = context.canvasStats?.byKind
      ? Object.entries(context.canvasStats.byKind).map(([kind, count]) => `${kind}:${count}`).join("，")
      : ""
    prompt += `\n\n【画布概况】\n- 节点总数：${context.canvasStats?.total ?? context.nodes?.length ?? 0}`
    if (byKind) prompt += `\n- 类型分布：${byKind}`
  }

  if (context?.nodes?.length) {
    prompt += `\n\n【画布节点摘要】`
    context.nodes.slice(0, 20).forEach((node, i) => {
      prompt += `\n${i + 1}. ${summarizeNode(node)}`
    })
    if (context.nodes.length > 20) {
      prompt += `\n... 还有 ${context.nodes.length - 20} 个节点未展开。`
    }
  }

  if (context?.attachments?.length) {
    prompt += `\n\n【本轮附件】`
    context.attachments.forEach((attachment, i) => {
      const sizeKb = attachment.size ? `${Math.round(attachment.size / 1024)}KB` : "未知大小"
      const dimensions = attachment.width && attachment.height ? `，尺寸 ${attachment.width}x${attachment.height}` : ""
      prompt += `\n${i + 1}. [${attachment.type || "file"}] ${attachment.name || attachment.id || "未命名附件"}，${attachment.mimeType || "未知类型"}，${sizeKb}${dimensions}`
      // 文档类附件：附加文件正文内容
      if (attachment.textContent) {
        const preview = attachment.textContent.length > 3000
          ? attachment.textContent.slice(0, 3000) + "\n...(全文过长，已截断至前3000字)"
          : attachment.textContent
        prompt += `\n---文件正文开始---\n${preview}\n---文件正文结束---`
      }
    })
  }

  return prompt
}

// ============================================================================
// MOCK RESPONSE GENERATOR
// ============================================================================
async function* generateMockResponse(message: string): AsyncGenerator<string> {
  let response = ""
  
  if (isCasualMessage(message)) {
    response = "你好！我是星轨Ai，你的创作助手。有什么可以帮你的吗？"
  } else if (message.includes("prompt") || message.includes("Prompt")) {
    response = `[PROMPT: 一个充满未来感的科幻场景，城市夜景，霓虹灯，赛博朋克风格，高质量，8K]`
  } else if (message.includes("分镜") || message.includes("拆分")) {
    response = "我已经为你拆好了分镜：\n\n1. 开场：远景展现城市天际线\n2. 中景：主角走入街道\n3. 近景：主角面部表情\n4. 特写：手中的装置发光"
  } else {
    response = "我理解了你的需求。让我帮你在画布上整理一下思路。"
  }

  for (let i = 0; i < response.length; i++) {
    yield response[i]
    await new Promise(resolve => setTimeout(resolve, 30))
  }
}

// ============================================================================
// STREAM CHUNK TYPES — separates content from metadata
// ============================================================================

type StreamContentChunk = { type: "content"; char: string }
type StreamUsageChunk = { type: "usage"; data: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }
type StreamChunk = StreamContentChunk | StreamUsageChunk

// ============================================================================
// REAL API CALLER
// ============================================================================
async function* streamFromRealAPI(
  messages: Array<{role: string; content: string}>,
  model: string,
  apiBaseUrl: string,
  apiKey: string,
  timeoutMs = 120_000,
): AsyncGenerator<StreamChunk> {
  const { endpoint, bodyTransformer } = getEndpointForModel(model, apiBaseUrl)
  
  const body = bodyTransformer({
    messages,
    model,
  })

  const response = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  }, timeoutMs)

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`AI API error (${response.status}): ${errorText}`)
  }

  if (!response.body) {
    throw new Error("AI API returned empty body")
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() || ""

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6)

        if (data === "[DONE]" || data === "data: [DONE]") {
          continue
        }

        try {
          const parsed = JSON.parse(data)

          // Extract content from various API response formats
          let content = ""
          if (parsed.choices?.[0]?.delta?.content) {
            content = parsed.choices[0].delta.content
          } else if (parsed.choices?.[0]?.message?.content) {
            content = parsed.choices[0].message.content
          } else if (parsed.content) {
            content = parsed.content
          } else if (parsed.text) {
            content = parsed.text
          } else if (parsed.data?.[0]?.url) {
            // Image generation response
            content = `![generated image](${parsed.data[0].url})`
          }

          if (content) {
            // Yield character by character for streaming effect
            for (let i = 0; i < content.length; i++) {
              yield { type: "content" as const, char: content[i] }
            }
          }

          // Forward usage info as separate metadata event (OpenAI sends this in the final chunk)
          if (parsed.usage) {
            yield {
              type: "usage" as const,
              data: {
                prompt_tokens: parsed.usage.prompt_tokens || 0,
                completion_tokens: parsed.usage.completion_tokens || 0,
                total_tokens: parsed.usage.total_tokens || 0,
              },
            }
          }
        } catch (e) {
          // Ignore parse errors for incomplete JSON
        }
      }
    }
  }
}

// ============================================================================
// API ROUTE HANDLER
// ============================================================================
// ============================================================================
// IMAGE GENERATION - Non-streaming handler for image models
// ============================================================================
async function handleImageGeneration(
  message: string,
  model: string,
  context: any,
  encoder: TextEncoder,
  controller: ReadableStreamDefaultController,
  config: ReturnType<typeof getConfig>,
) {
  // P2-5B: config passed from caller (supports overrides)

  // Send "generating" status
  controller.enqueue(
    encoder.encode(`data: ${JSON.stringify({ content: "🎨 正在生成图片...", type: "status" })}\n\n`)
  )

  // Build the prompt from user message, optionally enhanced by AI
  let finalPrompt = message

  // If the message is in Chinese or too short, use a text model to enhance it first
  const needsEnhancement = message.length < 20 || /[\u4e00-\u9fa5]/.test(message)

  if (needsEnhancement && !USE_MOCK) {
    try {
      const enhanceMessages = [
        {
          role: "system",
          content: "You are an expert image prompt engineer. Convert the user's request into a detailed, high-quality English image generation prompt. Output ONLY the prompt text, nothing else. Be specific about: subject, composition, lighting, style, mood, color palette, and technical quality terms (e.g. 8K, cinematic lighting, photorealistic). Keep it under 200 words."
        },
        { role: "user", content: message }
      ]

      const enhanceResponse = await fetchWithTimeout(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.defaultModel,
          messages: enhanceMessages,
          stream: false,
        }),
      }, Math.min(config.timeoutMs, 30_000))

      if (enhanceResponse.ok) {
        const enhanceData = await enhanceResponse.json()
        const enhancedPrompt = enhanceData.choices?.[0]?.message?.content?.trim()
        if (enhancedPrompt) {
          finalPrompt = enhancedPrompt
          // Send the enhanced prompt to the user
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ content: `\n📝 增强提示词：${finalPrompt.slice(0, 100)}...\n\n`, type: "text" })}\n\n`)
          )
        }
      }
    } catch (e) {
      // Enhancement failed, use original prompt
      console.warn("[ImageGen] Prompt enhancement failed, using original:", e)
    }
  }

  // Call image generation API
  const { endpoint, bodyTransformer } = getEndpointForModel(model, config.baseUrl)
  const imageBody = bodyTransformer({
    messages: [{ role: "user", content: finalPrompt }],
    model,
  })

  if (USE_MOCK) {
    // Mock: simulate a delay and return a placeholder
    await new Promise(resolve => setTimeout(resolve, 2000))
    controller.enqueue(
      encoder.encode(`data: ${JSON.stringify({
        type: "image_generated",
        imageUrl: "https://placehold.co/1024x1024/1a1a2e/e0e0e0?text=AI+Generated+Image",
        prompt: finalPrompt,
        model,
        revisedPrompt: "Mock generated image",
      })}\n\n`)
    )
    controller.enqueue(
      encoder.encode(`data: ${JSON.stringify({ content: "✅ 图片生成完成（Mock 模式）", type: "status" })}\n\n`)
    )
    return
  }

  const imageResponse = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(imageBody),
  }, config.timeoutMs)

  if (!imageResponse.ok) {
    const errorText = await imageResponse.text()
    throw new Error(`图像生成失败 (${imageResponse.status}): ${errorText.slice(0, 500)}`)
  }

  const imageData = await imageResponse.json()

  // Extract image URL from various response formats
  const imageUrl =
    imageData.data?.[0]?.url ||
    imageData.data?.[0]?.b64_json?.startsWith("data:") ? imageData.data[0].b64_json :
    imageData.data?.[0]?.b64_json ? `data:image/png;base64,${imageData.data[0].b64_json}` :
    imageData.output?.url ||
    imageData.url ||
    null

  if (!imageUrl) {
    throw new Error("图像生成 API 未返回图片 URL")
  }

  // Send the structured image event
  controller.enqueue(
    encoder.encode(`data: ${JSON.stringify({
      type: "image_generated",
      imageUrl,
      prompt: finalPrompt,
      model,
      revisedPrompt: imageData.data?.[0]?.revised_prompt || finalPrompt,
    })}\n\n`)
  )

  controller.enqueue(
    encoder.encode(`data: ${JSON.stringify({ content: "✅ 图片生成完成！点击图片可添加到画布。", type: "status" })}\n\n`)
  )
}

export async function POST(request: NextRequest) {
  try {
    // Debug: log proxy state for diagnosing "fetch failed"
    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY
    const noProxy = process.env.NO_PROXY || process.env.no_proxy
    console.log(`[Chat SSE] Proxy: ${proxyUrl || "none"}, NO_PROXY: ${noProxy || "none"}, USE_MOCK: ${USE_MOCK}`)

    const body = await request.json()
    const { message, model: reqModel, context, _providerOverrides } = body

    // P2-5B: 支持前端传入局部覆盖
    const overrides: AiProviderOverrides | undefined =
      _providerOverrides && typeof _providerOverrides === "object"
        ? (_providerOverrides as AiProviderOverrides)
        : undefined

    const config = getConfig(overrides)
    const requestedMode = context?.mode === "image" ? "image" : "chat"
    const model = resolveModelForMode({
      requestedModel: reqModel,
      requestedMode,
      defaultModel: config.defaultModel,
      defaultImageModel: config.defaultImageModel,
    })

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      )
    }

    // Determine if we need canvas context. Explicit canvas payload from the UI should be honored;
    // casual greetings can still skip it to keep replies light.
    const hasCanvasPayload = Boolean(context?.selectedNode || context?.nodes?.length || context?.mentionedNodes?.length || context?.attachments?.length)
    const needsCanvasContext = !isCasualMessage(message) && (hasCanvasPayload || wantsCanvasContext(message))
    
    // Build messages
    const systemPrompt = context?.systemOverride || buildSystemPrompt(needsCanvasContext ? context : undefined)
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: message },
    ]

    // Check if this is an image generation model
    const imageMode = isImageModel(model)

    // Create SSE response
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          if (imageMode) {
            // Handle image generation separately (non-streaming API)
            await handleImageGeneration(message, model, context, encoder, controller, config)
          } else if (USE_MOCK) {
            // Use mock response for testing
            for await (const char of generateMockResponse(message)) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ content: char })}\n\n`)
              )
            }
          } else {
            // Call the actual AI API (text models, streaming) — uses config from outer scope
            for await (const chunk of streamFromRealAPI(messages, model, config.baseUrl, config.apiKey, config.timeoutMs)) {
              if (chunk.type === "usage") {
                // Send usage metadata as a separate SSE event — not as content text
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ usage: chunk.data })}\n\n`)
                )
              } else {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ content: chunk.char })}\n\n`)
                )
              }
            }
          }

          // Send completion signal
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`))
        } catch (error: any) {
          console.error("[SSE Stream Error]", error)
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: error.message || "Stream error" })}\n\n`)
          )
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error"
    console.error("[Chat SSE Route Error]", message)
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}

// ============================================================================
// GET - Not supported for SSE
// ============================================================================
export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST to send messages." },
    { status: 405 }
  )
}
