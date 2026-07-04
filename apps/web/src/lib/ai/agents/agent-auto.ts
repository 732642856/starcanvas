// ============================================================================
// Auto Agent — 零提示词创作模式（TapNow 风格）
// 用户直接用自然语言聊天，Agent 自动理解意图并执行全流程创作
// ============================================================================

export type AutoAgentAction = {
  /** 识别出的用户意图 */
  intent:
    | "generate-image"
    | "generate-storyboard"
    | "generate-character"
    | "generate-moodboard"
    | "generate-video"
    | "generate-tts"
    | "analyze-script"
    | "validate-character-consistency"
    | "batch-shot-variation"
    | "script-to-concept"
    | "multi-step-pipeline"
    | "extract-production-assets"
    | "chat"
    | "unknown"
  /** 各意图对应的参数 */
  params: Record<string, any>
  /** 给用户看的友好说明 */
  description: string
  /** 信心指数 0-1 */
  confidence: number
}

/**
 * Auto Agent 系统提示词。
 *
 * 让 AI 充当"影视创作助理"，能理解用户自然语言意图并返回结构化动作指令。
 * 此提示词用于意图识别阶段（Intent Detection），AI 必须只输出 JSON。
 */
export const AUTO_AGENT_SYSTEM_PROMPT = `你是一位专业的影视创作助理（Auto Agent）。你的任务是理解用户的自然语言描述，判断用户想做什么，并以 JSON 格式返回结构化的创作指令。

## 你的工作方式
用户会用自然语言描述创作想法，你需要：
1. 准确理解用户的意图
2. 提取关键参数
3. 以 JSON 格式返回结构化的执行指令

## 支持的意图类型

### 1. generate-image（图片生成）
当用户想要生成一张图片时使用。
参数：
- prompt: 详细的中文/英文图片描述
- style: 风格（古风/赛博朋克/水墨/写实/动漫/油画等）
- aspectRatio: 画面比例（如 "16:9", "9:16", "1:1"）
- references: 参考风格或作品（可选）

示例用户："画一个白衣少女在樱花树下"
→ {"intent":"generate-image","params":{"prompt":"一个穿着白色汉服的少女站在盛开的樱花树下，粉色的花瓣飘落，柔和的光线透过树枝洒在她身上","style":"古风"},"description":"正在生成古风少女樱花树下的图片","confidence":0.95}

### 2. generate-storyboard（分镜生成）
当用户想要将剧本/故事拆分为分镜时使用。
参数：
- script: 剧本或故事文本
- genre: 题材类型（悬疑/爱情/古装/科幻/喜剧等）
- style: 视觉风格
- targetPlatform: 目标平台（short-drama/film/interactive/commercial）

示例用户："帮我把这个悬疑故事做成故事板：一个雨夜，侦探走进废弃的图书馆"
→ {"intent":"generate-storyboard","params":{"script":"一个雨夜，侦探走进废弃的图书馆","genre":"悬疑","style":"黑色电影","targetPlatform":"short-drama"},"description":"正在分析剧本并生成悬疑故事板","confidence":0.9}

### 3. generate-character（角色设计）
当用户想要设计一个角色时使用。
参数：
- description: 角色的文字描述
- name: 角色名称（可选）
- role: 角色定位（主角/反派/配角等）

示例用户："设计一个冷酷的独行侠角色"
→ {"intent":"generate-character","params":{"description":"冷酷的独行侠角色，性格孤僻但内心正义，身手敏捷","role":"主角"},"description":"正在生成角色设定","confidence":0.9}

### 4. generate-moodboard（风格定调参考图）
当用户想要定调视觉风格或生成风格参考图时使用。
参数：
- description: 风格描述
- references: 参考风格或作品（可选）

示例用户："我想看王家卫色调的参考图"
→ {"intent":"generate-moodboard","params":{"description":"王家卫色调，霓虹光影，浓烈色彩，怀旧氛围"},"description":"正在生成王家卫色调的参考图","confidence":0.95}

### 5. generate-video（视频生成）
当用户想要生成视频时使用。
参数：
- prompt: 视频描述
- style: 风格
- duration: 时长描述（可选）

### 6. generate-tts（语音生成）
当用户想要将文本转为语音时使用。
参数：
- text: 要转为语音的文本
- voice: 声音类型（可选）

### 7. analyze-script（剧本分析）
当用户想要分析剧本内容时使用。
参数：
- script: 剧本内容
- analysisType: 分析类型（角色分析/情节分析/节奏分析等）

### 8. validate-character-consistency（角色合规验证）
当用户想要检查角色跨镜头一致性、角色漂移、角色设定是否完整时使用。
参数：
- scope: 检查范围（selected/all/project）
- focus: 检查重点（外貌/服装/道具/参考图/声线）

### 9. batch-shot-variation（批量组镜变化）
当用户想要对已有分镜批量生成不同剪辑版本、镜头变化、节奏变化、组镜变化时使用。
参数：
- goal: 变化目标
- style: 变化风格
- count: 需要几套变化方案

### 10. script-to-concept（一键剧本到概念图）
当用户想把剧本、故事梗概或场景直接转成角色概念图、场景概念图、视觉参考图时使用。
参数：
- script: 剧本或故事文本
- genre: 题材类型
- style: 视觉风格

### 11. multi-step-pipeline（多步骤工作流）
当用户想要一个完整创作流程时使用（包含多个步骤）。
参数：
- goal: 用户的核心目标
- steps: 步骤数组，每步包含 type 和 params
- genre: 题材（可选）
- style: 风格（可选）

示例用户："帮我写一个古风仙侠短剧的剧本，然后做成故事板，再生成角色设计"
→ {"intent":"multi-step-pipeline","params":{"goal":"古风仙侠短剧全流程创作","steps":[{"type":"script","description":"生成剧本"},{"type":"storyboard","description":"将剧本拆为分镜"},{"type":"character","description":"设计角色"}],"genre":"古装仙侠","style":"水墨画风"},"description":"正在规划古风仙侠短剧的全流程创作","confidence":0.95}

### 12. extract-production-assets（制作资产拆解 / Project Bible）
当用户给出较长剧本、短剧/电影大纲，希望提取角色、场景、道具、服装、声线、视觉资产，或提到“项目圣经 / 制作圣经 / 资产拆解 / 全局角色管理 / 长剧本理解 / 10万字剧本”时使用。
参数：
- script: 剧本或故事文本
- goal: 制作目标
- genre: 题材类型
- style: 视觉风格
- targetPlatform: 目标平台（short-drama/film/interactive/commercial）

示例用户："把这段短剧剧本拆成角色、场景、道具和分镜制作圣经"
→ {"intent":"extract-production-assets","params":{"script":"用户提供的剧本文本","goal":"短剧制作资产拆解","genre":"短剧","style":"cinematic","targetPlatform":"short-drama"},"description":"正在拆解制作资产并生成项目圣经","confidence":0.92}

### 13. chat（普通对话）
如果用户的输入只是打招呼、闲聊、或询问一般性问题，使用 chat 意图。
参数：
- topic: 话题

### 14. unknown（无法识别的意图）
当无法确定用户意图时使用。

## 输出规则
- 必须**只输出** JSON，不要有任何额外的文字、解释、markdown 代码块
- 如果是纯打招呼或闲聊，不要强行赋予创作意图
- 如果 intent 为 "multi-step-pipeline"，steps 数组中的每一步在后续执行时会进一步分解
- 当用户提到“角色漂移 / 一致性 / 合规 / 检查角色”时，优先使用 validate-character-consistency
- 当用户提到“批量变化 / 组镜变化 / 多套镜头 / 节奏版本”时，优先使用 batch-shot-variation
- 当用户提到“剧本到概念图 / 一键概念图 / 从故事生成角色场景图”时，优先使用 script-to-concept
- 当用户提到“制作圣经 / 项目圣经 / 资产拆解 / 长剧本理解 / 全局角色 / 道具服装清单 / 短剧资产”时，优先使用 extract-production-assets
- confidence 表示你对意图判断的信心，低于 0.6 时应回退到 chat 或 unknown
`

/**
 * 构建 Auto Agent 意图识别的 system prompt
 */
export function buildAutoAgentSystemPrompt(canvasContext?: {
  hasNodes?: boolean
  selectedNodeInfo?: string
}): string {
  let prompt = AUTO_AGENT_SYSTEM_PROMPT

  if (canvasContext?.hasNodes) {
    prompt += `\n\n## 当前画布状态\n`
    prompt += `画布上已有创作节点，用户可能是在基于已有内容继续创作。`
    if (canvasContext.selectedNodeInfo) {
      prompt += `\n当前选中节点：${canvasContext.selectedNodeInfo}`
    }
    prompt += `\n请结合画布上下文理解用户的意图。`
  }

  return prompt
}

/**
 * 构建用户消息（包含当前画布上下文）
 */
export function buildAutoAgentUserMessage(message: string, canvasContext?: any): string {
  let userMsg = `用户的自然语言输入：${message}`

  if (canvasContext) {
    const contextParts: string[] = []

    if (canvasContext.nodes?.length) {
      const nodeSummaries = canvasContext.nodes.slice(0, 10).map((n: any) =>
        `[${n.nodeKind || n.type || "node"}] ${n.title || "未命名"}`
      ).join("; ")
      contextParts.push(`画布节点：${nodeSummaries}`)
    }

    if (canvasContext.selectedNode) {
      contextParts.push(`选中节点：${canvasContext.selectedNode.title || "未命名"}`)
    }

    if (contextParts.length > 0) {
      userMsg += `\n\n画布上下文：\n${contextParts.join("\n")}`
    }
  }

  return userMsg
}

/**
 * 解析 Auto Agent 返回的 JSON 字符串为 AutoAgentAction。
 * 兼容含 markdown 代码块的情况。
 */
export function parseAutoAgentResponse(text: string): AutoAgentAction {
  // 尝试提取 JSON 代码块
  const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const jsonStr = jsonBlockMatch ? jsonBlockMatch[1].trim() : text.trim()

  // 找第一个 { 和最后一个 }
  const start = jsonStr.indexOf("{")
  const end = jsonStr.lastIndexOf("}")
  if (start >= 0 && end > start) {
    const cleanJson = jsonStr.slice(start, end + 1)
    try {
      const parsed = JSON.parse(cleanJson)
      return {
        intent: parsed.intent || "unknown",
        params: parsed.params || {},
        description: parsed.description || "正在理解你的需求...",
        confidence: parsed.confidence ?? 0.5,
      }
    } catch {
      // 解析失败，回退到 chat
    }
  }

  return {
    intent: "chat",
    params: { topic: text.slice(0, 100) },
    description: "正在回复你的消息",
    confidence: 0.5,
  }
}

/**
 * 调用 AI 进行意图识别。
 * 使用系统 override 方式调用聊天 API，收集完整响应后解析 JSON。
 */
export async function detectIntent(
  message: string,
  canvasContext?: any,
  signal?: AbortSignal,
): Promise<AutoAgentAction> {
  const systemPrompt = buildAutoAgentSystemPrompt({
    hasNodes: Boolean(canvasContext?.nodes?.length),
    selectedNodeInfo: canvasContext?.selectedNode?.title,
  })

  const userMessage = buildAutoAgentUserMessage(message, canvasContext)

  try {
    const response = await fetch("/api/ai/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        message: userMessage,
        model: "gpt-5.5",
        context: {
          systemOverride: systemPrompt,
          mode: "chat",
        },
      }),
    })

    if (!response.ok) {
      throw new Error(`Intent detection failed (${response.status})`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error("No response body")

    const decoder = new TextDecoder()
    let buffer = ""
    let fullContent = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6)
          if (data === "[DONE]") continue
          try {
            const parsed = JSON.parse(data)
            if (parsed.content) {
              fullContent += parsed.content
            }
            if (parsed.error) {
              throw new Error(parsed.error)
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }

    return parseAutoAgentResponse(fullContent)
  } catch (error: any) {
    if (error.name === "AbortError") {
      return {
        intent: "unknown",
        params: {},
        description: "意图识别被取消",
        confidence: 0,
      }
    }
    console.error("[Auto Agent] Intent detection failed:", error)
    return {
      intent: "chat",
      params: { topic: message.slice(0, 100), fallback: true },
      description: "意图识别失败，将按普通对话处理",
      confidence: 0.3,
    }
  }
}

// ============================================================================
// 意图执行调度器 — 对外接口
// ============================================================================

export type AutoActionExecutor = {
  /** 执行动作前的说明 */
  description: string
  /** 执行动作 */
  execute: (params: Record<string, any>, callbacks: AutoActionCallbacks) => Promise<void>
}

export type AutoActionCallbacks = {
  /** 向用户发送文本更新 */
  onText: (text: string) => void
  /** 生成图片完成 */
  onImageGenerated?: (data: { imageUrl: string; prompt: string; model: string; revisedPrompt?: string }) => void
  /** 操作完成 */
  onComplete: () => void
  /** 操作出错 */
  onError: (error: Error) => void
}

/**
 * 根据 AutoAgentAction 获取对应的执行器。
 * ChatPanel 可以用此调度到不同的执行逻辑。
 */
export function getActionDescription(action: AutoAgentAction): string {
  switch (action.intent) {
    case "generate-image":
      return `🎨 正在生成图片：${action.params.style ? `风格「${action.params.style}」` : ""}${action.params.prompt ? `\n"${action.params.prompt.slice(0, 80)}${action.params.prompt.length > 80 ? "..." : ""}"` : ""}`
    case "generate-storyboard":
      return `🎬 正在生成分镜：${action.params.genre ? `题材「${action.params.genre}」` : ""}${action.params.style ? `· 风格「${action.params.style}」` : ""}`
    case "generate-character":
      return `👤 正在设计角色：${action.params.name ? `「${action.params.name}」` : ""}${action.params.role ? `(${action.params.role})` : ""}`
    case "generate-moodboard":
      return `🎨 正在生成风格参考图：${action.params.description ? `"${action.params.description.slice(0, 60)}"` : ""}`
    case "generate-video":
      return `🎥 正在生成视频：${action.params.prompt?.slice(0, 60) || ""}`
    case "generate-tts":
      return `🔊 正在生成语音...`
    case "analyze-script":
      return `📝 正在分析剧本...`
    case "validate-character-consistency":
      return `🧬 正在检查角色跨镜头一致性...`
    case "batch-shot-variation":
      return `🎞️ 正在生成批量组镜变化方案...`
    case "script-to-concept":
      return `🖼️ 正在把剧本转成概念图任务...`
    case "extract-production-assets":
      return `📚 正在拆解制作资产并生成项目圣经...`
    case "multi-step-pipeline": {
      const stepCount = action.params.steps?.length || 0
      return `🚀 正在执行全流程创作（共 ${stepCount} 步）\n${action.params.steps?.map((s: any, i: number) => `  ${i + 1}. ${s.description || s.type || "..."}`).join("\n") || ""}`
    }
    case "chat":
    case "unknown":
    default:
      return `💬 ${action.description}`
  }
}
