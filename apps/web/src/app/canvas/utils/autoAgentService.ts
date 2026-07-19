import type { ApplyActionsReport, ChatCanvasAction } from "../features/canvas/actions/chatActions.ts"
import { detectIntent, getActionDescription, type AutoAgentAction } from "../../../lib/ai/agents/agent-auto.ts"
import { getStoredProviderSmokeReadinessStatus, loadStoredProviderSmokeResults } from "../../../lib/ai/providerSmokeResult.ts"
import { resolveImageGenerationSize } from "./imageGeneration.ts"
import { buildUnknownImageResultMessage, isUnknownImageResultError } from "./productionImageRetry.ts"
import { parseStoryboardTextToShots } from "./storyboardParser.ts"
import { generateDirectorStoryboardText } from "../../../lib/slashCommands/runStoryboardAssistantCommand.ts"

type AutoAgentCanvasContext = {
  nodes?: Array<Record<string, any>>
  selectedNode?: Record<string, any>
  mentionedNodes?: Array<Record<string, any>>
  canvasStats?: Record<string, any>
  pendingClarificationAnswer?: {
    clarificationId?: string
    threadId?: string
    messageId?: string
    question?: string
    options?: string[]
    answer?: string
  }
}

const CASUAL_CHAT_PATTERN =
  /^(你好|您好|哈喽|嗨|hello|hi|hey|谢谢|感谢|辛苦了|收到|好的|ok|晚安|早上好|下午好|晚上好)([!！。~～\s]*)$/i

const CREATIVE_INTENT_PATTERN =
  /(短片|视频|镜头|分镜|剧本|故事|创意|角色|场景|概念图|参考图|制作圣经|项目圣经|画布|工作流|生成|拍|脚本|预告片|剧情|广告片|短剧)/

export function shouldFallbackToPlainChat(
  action: AutoAgentAction,
  userInput: string,
): boolean {
  const trimmed = userInput.trim()

  if (CASUAL_CHAT_PATTERN.test(trimmed)) {
    return true
  }

  if (CREATIVE_INTENT_PATTERN.test(trimmed)) {
    return false
  }

  return action.confidence < 0.6 || action.intent === "chat" || action.intent === "unknown"
}

function shouldAskCreativeClarification(action: AutoAgentAction, userInput: string): boolean {
  return !shouldFallbackToPlainChat(action, userInput) &&
    (action.confidence < 0.6 || action.intent === "chat" || action.intent === "unknown")
}

type GeneratedImagePayload = {
  imageUrl: string
  prompt: string
  model: string
  revisedPrompt?: string
  assetId?: string
}

function isRetryableImageFailure(
  error: unknown,
): error is Error & { retryable?: boolean; status?: number; code?: string } {
  return error instanceof Error &&
    Boolean((error as { retryable?: boolean }).retryable)
}

export type AutoAgentProcessOptions = {
  canvasContext?: AutoAgentCanvasContext
  signal?: AbortSignal
  expandStoryboard?: boolean
  imageModel?: string
  onProgress?: (status: string) => void
  onText?: (text: string) => void
  onImageGenerated?: (data: GeneratedImagePayload) => void
  onActions?: (actions: ChatCanvasAction[]) => ApplyActionsReport | void
  onFallbackChat?: () => Promise<void>
  onComplete?: () => void
  onError?: (error: Error) => void
}

function asText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback
}

function createContentAction(params: {
  title: string
  content: string
  nodeKind?: string
  nodeType?: "content" | "workflow"
  x?: number
  y?: number
  prompt?: string
  data?: Record<string, unknown>
}): ChatCanvasAction {
  return {
    action: "create_node",
    nodeType: params.nodeType ?? "content",
    nodeKind: params.nodeKind ?? "document",
    title: params.title,
    content: params.content,
    prompt: params.prompt,
    position: params.x !== undefined && params.y !== undefined ? { x: params.x, y: params.y } : undefined,
    data: params.data,
    description: params.title,
  }
}

function createImageAction(params: {
  title: string
  prompt: string
  imageUrl?: string
  nodeKind?: string
  x?: number
  y?: number
  data?: Record<string, unknown>
}): ChatCanvasAction {
  return {
    action: "create_node",
    nodeType: "image",
    nodeKind: params.nodeKind ?? "reference",
    title: params.title,
    prompt: params.prompt,
    position: params.x !== undefined && params.y !== undefined ? { x: params.x, y: params.y } : undefined,
    data: {
      imageUrl: params.imageUrl,
      assetUrl: params.imageUrl,
      prompt: params.prompt,
      createdBy: "auto-agent",
      ...params.data,
    },
    description: params.title,
  }
}

function createCreativeClarificationAction(userInput: string): ChatCanvasAction {
  const summary = userInput.trim().slice(0, 80)
  return {
    action: "ask_clarification",
    question: `你想先走哪条主路径？如果直接回复文字，请补 3 个锚点：导演/叙事风格、这场戏的故事功能、希望观众感受到的情绪。（${summary}）`,
    options: ["生成分镜", "拆成制作圣经", "生成视觉概念图", "建立视频生成任务"],
    clarificationId: `auto-agent-creative-${Date.now()}`,
    description: "低置信度创作请求需要先确认主路径",
    data: {
      source: "auto-agent",
      reason: "low-confidence-creative-intent",
      originalInput: userInput,
    },
  }
}

function buildDirectorStoryboardPrompt(script: string, options?: {
  genre?: string
  style?: string
  targetPlatform?: string
  directorBrief?: string
}): string {
  const contextLine = [
    options?.genre ? `类型：${options.genre}` : "",
    options?.style ? `风格：${options.style}` : "",
    options?.targetPlatform ? `平台：${options.targetPlatform}` : "",
  ].filter(Boolean).join("；")

  return [
    "请将以下内容拆成专业影视分镜。",
    "先判断这场戏的故事功能、情绪基调、预计镜头数与视频时长，再输出可执行分镜。",
    "硬性要求：先锁定人物、场景、车辆、道具、服装等资产；每格必须包含镜头标题、景别、固定焦段、机位、拍摄方向、运镜、时长、画面描述、动作、对白/字幕、英文生图/生视频 prompt；保持轴线、左右关系与空间锚点连续；不要使用模糊二选一表达。",
    contextLine,
    options?.directorBrief ? `导演补充：${options.directorBrief}` : "",
    "",
    script,
  ].filter(Boolean).join("\n")
}

function summarizeShotNodes(canvasContext?: AutoAgentCanvasContext) {
  return (canvasContext?.nodes ?? [])
    .filter((node) => node.nodeKind === "shot" || node.type === "shot")
    .slice(0, 12)
}

function buildCharacterComplianceReport(canvasContext?: AutoAgentCanvasContext) {
  const shotNodes = summarizeShotNodes(canvasContext)
  const findings: string[] = []
  const characterMap = new Map<string, Array<Record<string, any>>>()

  for (const node of shotNodes) {
    const shot = node.shot ?? node
    const characters = Array.isArray(shot.characterIdentities) ? shot.characterIdentities : []
    if (characters.length === 0) {
      findings.push(`- ${node.title ?? "未命名镜头"}：缺少角色身份绑定，后续生图容易漂移。`)
      continue
    }

    for (const character of characters) {
      const name = asText(character.name, "未命名角色")
      const list = characterMap.get(name) ?? []
      list.push(character)
      characterMap.set(name, list)

      const missing: string[] = []
      if (!character.visualSignature) missing.push("外貌签名")
      if (!character.costume) missing.push("服装")
      if (!character.referenceAssetId && !character.frontViewAssetId && !character.frontViewUrl && !character.avatarUrl) {
        missing.push("参考图")
      }
      if (missing.length > 0) {
        findings.push(`- ${node.title ?? "未命名镜头"} / ${name}：缺少 ${missing.join("、")}。`)
      }
    }
  }

  for (const [name, list] of characterMap.entries()) {
    const visualSignatures = new Set(list.map((item) => asText(item.visualSignature)).filter(Boolean))
    const costumes = new Set(list.map((item) => asText(item.costume)).filter(Boolean))
    if (visualSignatures.size > 1) findings.push(`- ${name}：不同镜头存在多个外貌签名版本，需要统一。`)
    if (costumes.size > 1) findings.push(`- ${name}：不同镜头存在多个服装版本，确认是否为剧情换装。`)
  }

  if (shotNodes.length === 0) {
    findings.push("- 当前画布没有可检查的镜头节点。建议先导入剧本并生成分镜，再运行角色一致性检查。")
  }

  if (findings.length === 0) {
    findings.push("- 未发现明显角色合规问题。下一步建议抽查生成图，确认脸型、发型、服装和道具是否稳定。")
  }

  return [
    "# 角色合规验证报告",
    "",
    `检查镜头数：${shotNodes.length}`,
    "",
    "## 发现的问题 / 建议",
    ...findings,
    "",
    "## 执行建议",
    "1. 先补齐每个主要角色的外貌签名、服装、道具和参考图。",
    "2. 生成镜头图前，把角色一致性提示词合并进每个镜头 prompt。",
    "3. 如果角色需要换装，在 notes 中明确标注剧情原因，避免被误判为漂移。",
  ].join("\n")
}

function buildBatchShotVariationReport(userInput: string, canvasContext?: AutoAgentCanvasContext) {
  const shotNodes = summarizeShotNodes(canvasContext)
  const source = shotNodes.length > 0
    ? shotNodes.map((node, index) => `${index + 1}. ${node.title ?? "镜头"}：${node.description ?? node.content ?? node.prompt ?? ""}`).join("\n")
    : userInput

  return [
    "# 批量组镜变化方案",
    "",
    "## 原始镜头依据",
    source,
    "",
    "## 变化 A：节奏强化版",
    "- 保留主事件顺序。",
    "- 增加近景反应镜头和细节插入镜头。",
    "- 每 3-4 个镜头设置一次情绪转折。",
    "",
    "## 变化 B：悬疑信息差版",
    "- 推迟关键信息揭示。",
    "- 用遮挡、背影、局部道具建立疑问。",
    "- 先给结果，再补原因，让观众追问。",
    "",
    "## 变化 C：视觉冲击版",
    "- 强化大远景开场和特写收束。",
    "- 增加运动镜头：推、拉、横移、跟拍。",
    "- 让每个镜头都有明确主体、动作和光影变化。",
  ].join("\n")
}

function buildScriptToConceptActions(action: AutoAgentAction, userInput: string): ChatCanvasAction[] {
  const script = asText(action.params.script, userInput)
  const genre = asText(action.params.genre, "未指定题材")
  const style = asText(action.params.style, "cinematic concept art, consistent visual bible")
  const directorBrief = asText(action.params.directorBrief, "")
  const directorBriefData = directorBrief ? { directorBrief } : {}
  const visualConceptPrompt = `A cinematic key visual concept art for ${genre}, ${style}, based on: ${script.slice(0, 700)}`

  return [
    createContentAction({
      title: "剧本源文本",
      nodeKind: "storyboard",
      content: script,
      prompt: `请把以下剧本拆成 6-9 个关键镜头，并输出景别、运镜、画面描述和生图 prompt。\n\n${script}`,
      x: 120,
      y: 120,
      data: { storyboardAssistantStage: "story", ...directorBriefData },
    }),
    createContentAction({
      title: "角色概念图 Prompt",
      nodeKind: "prompt",
      content: `题材：${genre}\n风格：${style}\n任务：提取主要角色，为每个角色生成正面概念图提示词，包含脸型、年龄段、发型、服装、道具、辨识剪影。`,
      prompt: `Character concept sheet, ${style}, ${genre}, main cast extracted from: ${script.slice(0, 500)}`,
      x: 460,
      y: 120,
      data: directorBriefData,
    }),
    createContentAction({
      title: "场景概念图 Prompt",
      nodeKind: "prompt",
      content: `题材：${genre}\n风格：${style}\n任务：提取核心场景，为每个场景生成概念图提示词，包含地点、时间、天气、光线、色彩和气氛。`,
      prompt: `Environment concept art, ${style}, ${genre}, locations extracted from: ${script.slice(0, 500)}`,
      x: 800,
      y: 120,
      data: directorBriefData,
    }),
    createContentAction({
      title: "整体视觉概念图生成",
      nodeType: "workflow",
      nodeKind: "image-generation",
      content: visualConceptPrompt,
      prompt: visualConceptPrompt,
      x: 1140,
      y: 120,
      data: {
        workflowRole: "Text to Image",
        model: "gpt-image-2",
        status: "ready",
        summary: "Auto Agent 已准备好整体视觉概念图提示词，可直接运行生成关键视觉图。",
        autoAgentIntent: "script-to-concept",
        autoRunRecommended: true,
        ...directorBriefData,
      },
    }),
    {
      action: "run_node",
      title: "整体视觉概念图生成",
      description: "运行整体视觉概念图生成节点",
    },
  ]
}

type CharacterAssetSeed = {
  id: string
  name: string
  role: string
  notes?: string
}

const CHARACTER_ROLE_PATTERN = /(女主|男主|主角|反派|配角|同伴|母亲|父亲|姐姐|妹妹|哥哥|弟弟|侦探|医生|警察|导演)\s*([一-龥]{2,3})/g
const CHARACTER_ACTION_PATTERN = /(?:^|[\n。；;，,]|\d+[.、]\s*)([一-龥]{2,3})(?=(?:在|替|发现|走|回|带|接|说|看|拿|进入|离开|站|坐|追|喊|望))/g
const NAME_TRAILING_STOP_CHARS = new Set(["在", "带", "走", "回", "和", "与", "的", "把", "向", "被", "从", "发", "看", "听", "说", "拿"])

function normalizeCharacterSeedName(name: string): string {
  let normalized = name.trim()
  if (normalized.length >= 3) {
    const lastChar = normalized.at(-1)
    if (lastChar && NAME_TRAILING_STOP_CHARS.has(lastChar)) normalized = normalized.slice(0, -1)
  }
  return normalized
}

function toCharacterSeedId(name: string): string {
  return `character-${[...name].map((char) => char.charCodeAt(0).toString(36)).join("-")}`
}

function extractCharacterAssetSeeds(script: string): CharacterAssetSeed[] {
  const seeds: CharacterAssetSeed[] = []
  const seen = new Set<string>()

  for (const match of script.matchAll(CHARACTER_ROLE_PATTERN)) {
    const role = asText(match[1])
    const name = normalizeCharacterSeedName(asText(match[2]))
    if (!role || !name || seen.has(name)) continue
    seen.add(name)
    seeds.push({
      id: toCharacterSeedId(name),
      name,
      role,
      notes: "Auto Agent 从源剧本称谓中提取的角色种子，请在角色资产库补齐外貌签名、服装、道具和参考图。",
    })
  }

  for (const match of script.matchAll(CHARACTER_ACTION_PATTERN)) {
    const name = normalizeCharacterSeedName(asText(match[1]))
    if (!name || seen.has(name)) continue
    seen.add(name)
    seeds.push({
      id: toCharacterSeedId(name),
      name,
      role: "角色",
      notes: "Auto Agent 从导演分镜中的人物动作提取的角色种子，请补齐角色定位和视觉资产。",
    })
  }

  return seeds
}

function buildProductionAssetBibleActions(action: AutoAgentAction, userInput: string): ChatCanvasAction[] {
  const script = asText(action.params.script, userInput)
  const goal = asText(action.params.goal, "制作资产拆解")
  const genre = asText(action.params.genre, "未指定题材")
  const style = asText(action.params.style, "cinematic visual bible")
  const targetPlatform = asText(action.params.targetPlatform, "short-drama")
  const directorBrief = asText(action.params.directorBrief, "")
  const directorBriefData = directorBrief ? { directorBrief } : {}
  const scriptExcerpt = script.slice(0, 1200)
  const storyboardSource = asText(action.params.storyboardText, script)
  const characterAssetSeeds = extractCharacterAssetSeeds(`${script}\n${storyboardSource}`)
  const storyboardShots = parseStoryboardTextToShots(storyboardSource).map((shot) => ({
    title: shot.title,
    content: shot.description,
    prompt: shot.visualPrompt,
    duration: shot.duration,
    cameraMovement: shot.cameraMovement,
    shotType: shot.shotType,
  }))

  return [
    createContentAction({
      title: `制作圣经：${goal.slice(0, 28)}`,
      nodeKind: "document",
      content: [
        "# Project Bible / 制作圣经总览",
        "",
        `制作目标：${goal}`,
        `题材：${genre}`,
        `视觉风格：${style}`,
        `目标平台：${targetPlatform}`,
        "",
        "## 节点链路",
        "1. 源剧本：保留用户输入，作为后续所有节点的单一事实源。",
        "2. 角色资产 Bible：提取人物身份、外貌签名、服装、道具、声线和参考图需求。",
        "3. 场景资产 Bible：提取地点、时间、天气、光线、色彩、陈设和氛围。",
        "4. 道具服装资产清单：提取可复用资产、连续性约束和缺口。",
        "5. 分镜拆解任务：把剧本拆成可生产镜头。",
        "6. 一致性与缺口检查：检查角色、场景、道具、时间线和生产风险。",
      ].join("\n"),
      x: 80,
      y: 80,
      data: {
        productionBibleKind: "overview",
        pipelineGoal: goal,
        pipelineStyle: style,
        targetPlatform,
        autoAgentIntent: "extract-production-assets",
        ...directorBriefData,
      },
    }),
    createContentAction({
      title: `源剧本：${goal.slice(0, 28)}`,
      nodeKind: "document",
      content: script,
      prompt: `Use this source script as the canonical production input. Preserve named characters, locations, props, timeline clues and episode structure.\n\n${script}`,
      x: 460,
      y: 80,
      data: {
        productionBibleKind: "source-script",
        pipelineGoal: goal,
        genre,
        style,
        targetPlatform,
        ...directorBriefData,
      },
    }),
    createContentAction({
      title: "角色资产 Bible",
      nodeKind: "document",
      content: [
        "# 角色资产 Bible",
        "",
        "请从源剧本提取主要/次要角色，并为每个角色维护可复用制作信息：",
        "- 姓名、定位、首次登场",
        "- 年龄与外形签名、发型、服装、道具",
        "- 声线、人物关系、动机",
        "- 连续性规则、缺失参考、建议补充参考镜头",
        "",
        "源剧本摘录：",
        scriptExcerpt,
      ].join("\n"),
      prompt: `Extract a detailed character bible from this ${genre} script. For every character include name, role, first appearance, age range, physical signature, face/hair, costume, props, voice tone, relationships, motivation, continuity rules, missing references, and suggested reference shots. Style: ${style}.\n\n${script}`,
      x: 80,
      y: 360,
      data: {
        productionBibleKind: "character-bible",
        assetCategory: "character",
        syncToAssetLibrary: true,
        assetLibraryType: "character",
        assetLibraryFolder: "Character",
        assetLibraryTags: ["project-bible", "character", genre, targetPlatform].filter(Boolean),
        characterAssetSeeds,
        pipelineGoal: goal,
        ...directorBriefData,
      },
    }),
    createContentAction({
      title: "场景资产 Bible",
      nodeKind: "document",
      content: [
        "# 场景资产 Bible",
        "",
        "请从源剧本提取可复用场景资产：",
        "- 场景地点、时间、天气",
        "- 灯光、色彩、情绪",
        "- 陈设、重复出现的道具、可用镜头语言",
        "- 连续性规则、缺失参考",
        "",
        "源剧本摘录：",
        scriptExcerpt,
      ].join("\n"),
      prompt: `Extract a detailed scene bible from this ${genre} script. For every location include location name, time of day, weather, lighting, color palette, mood, set dressing, recurring props, camera potential, continuity rules, missing references, and reusable environment prompt fragments. Style: ${style}.\n\n${script}`,
      x: 460,
      y: 360,
      data: {
        productionBibleKind: "scene-bible",
        assetCategory: "scene",
        syncToAssetLibrary: true,
        assetLibraryType: "scene",
        assetLibraryFolder: "Scene",
        assetLibraryTags: ["project-bible", "scene", genre, targetPlatform].filter(Boolean),
        pipelineGoal: goal,
        ...directorBriefData,
      },
    }),
    createContentAction({
      title: "道具服装资产清单",
      nodeKind: "document",
      content: [
        "# 道具 / 服装 / 实物资产清单",
        "",
        "请把源剧本拆成可追踪制作资产：",
        "- props, costumes, vehicles, weapons, practical effects",
        "- ownerCharacter / firstShot / recurrence / continuityRisk",
        "- neededImageReference / neededVideoReference / promptFragment",
        "",
        "源剧本摘录：",
        scriptExcerpt,
      ].join("\n"),
      prompt: `Extract production assets from this ${genre} script: props, costumes, vehicles, weapons, practical effects, signage, documents, key visual symbols. For each item include owner character, first shot, recurrence, continuity risk, required image/video references, and reusable prompt fragments. Style: ${style}.\n\n${script}`,
      x: 840,
      y: 360,
      data: {
        productionBibleKind: "props-costumes",
        assetCategory: "prop-costume",
        syncToAssetLibrary: true,
        assetLibraryType: "other",
        assetLibraryFolder: "Item",
        assetLibraryTags: ["project-bible", "props", "costume", genre, targetPlatform].filter(Boolean),
        pipelineGoal: goal,
        ...directorBriefData,
      },
    }),
    createContentAction({
      title: "分镜拆解任务",
      nodeKind: "storyboard",
      content: script,
      prompt: buildDirectorStoryboardPrompt(script, { genre, style, targetPlatform, directorBrief }),
      x: 80,
      y: 650,
      data: {
        productionBibleKind: "storyboard-task",
        storyboardAssistantStage: "storyboard-text",
        pipelineGoal: goal,
        genre,
        style,
        targetPlatform,
        ...directorBriefData,
      },
    }),
    ...(storyboardShots.length > 0 ? [{
      action: "generate_storyboard" as const,
      sourceNodeId: "分镜拆解任务",
      shots: storyboardShots,
      description: `已从制作圣经脚本拆出 ${storyboardShots.length} 个 Shot`,
    }] : []),
    createContentAction({
      title: "一致性与缺口检查",
      nodeKind: "document",
      content: [
        "# 制作一致性与缺口检查",
        "",
        "检查维度：",
        "- 角色外貌、服装、道具跨镜头是否一致",
        "- 场景时间、天气、灯光、陈设是否连续",
        "- 道具首次出现/重复出现是否有生产资产",
        "- 分镜是否缺失关键转场、情绪转折、对白或字幕",
        "- 哪些资产需要补参考图、补配音、补视频素材",
      ].join("\n"),
      prompt: `Audit the production bible, character bible, scene bible, props/costumes list and storyboard plan for continuity gaps. Return prioritized issues with severity P0/P1/P2, affected character/scene/asset, missing evidence, and concrete next action.\n\nSource script:\n${script}`,
      x: 460,
      y: 650,
      data: {
        productionBibleKind: "continuity-audit",
        pipelineGoal: goal,
        ...directorBriefData,
      },
    }),
    {
      action: "open_panel",
      panel: "project_bible",
      description: "打开 Project Bible，继续编辑角色、场景与视觉圣经。",
    },
  ]
}

function getClarificationOriginalInput(action: ChatCanvasAction): string {
  const originalInput = action.action === "ask_clarification" ? action.data?.originalInput : undefined
  return typeof originalInput === "string" && originalInput.trim() ? originalInput.trim() : ""
}

function inferCreativeClarificationRoute(answer: string): "storyboard" | "bible" | "concept" | "video" {
  if (/制作圣经|资产拆解|项目圣经|production bible/i.test(answer)) return "bible"
  if (/概念图|视觉概念|concept art/i.test(answer)) return "concept"
  if (/视频生成任务|视频任务|生成视频|生视频|\bvideo\b/i.test(answer)) return "video"
  return "storyboard"
}

function extractCreativeClarificationDetails(answer: string): string {
  const trimmed = answer.trim()
  if (!trimmed) return ""

  const routeOnly = trimmed.replace(/[\s,，。；;！!？?]/g, "")
  if (
    routeOnly === "生成分镜" ||
    routeOnly === "分镜" ||
    routeOnly === "故事板" ||
    routeOnly === "拆成制作圣经" ||
    routeOnly === "制作圣经" ||
    routeOnly === "生成视觉概念图" ||
    routeOnly === "概念图" ||
    routeOnly === "建立视频生成任务" ||
    routeOnly === "视频生成任务"
  ) {
    return ""
  }

  return trimmed
}

export function buildAutoAgentClarificationResponseActions(
  clarification: ChatCanvasAction,
  answer: string,
): ChatCanvasAction[] {
  if (clarification.action !== "ask_clarification") return []

  const originalInput = getClarificationOriginalInput(clarification)
  const source = originalInput || clarification.question
  const normalizedAnswer = answer.trim()
  const route = inferCreativeClarificationRoute(normalizedAnswer)

  if (route === "bible") {
    const directorBrief = extractCreativeClarificationDetails(normalizedAnswer)
    return buildProductionAssetBibleActions({
      intent: "extract-production-assets",
      params: {
        script: source,
        directorBrief,
        goal: "一句话创意制作资产拆解",
        genre: "短片",
        style: "cinematic visual bible",
        targetPlatform: "short-drama",
      },
      description: "正在拆解制作资产并生成项目圣经",
      confidence: 0.8,
    }, source)
  }

  if (route === "concept") {
    const directorBrief = extractCreativeClarificationDetails(normalizedAnswer)
    return buildScriptToConceptActions({
      intent: "script-to-concept",
      params: {
        script: source,
        directorBrief,
        genre: "短片",
        style: "cinematic concept art, consistent visual bible",
      },
      description: "正在把创意转成视觉概念图任务",
      confidence: 0.8,
    }, source)
  }

  if (route === "video") {
    const directorBrief = extractCreativeClarificationDetails(normalizedAnswer)
    return buildAutoAgentPlanningActions({
      intent: "generate-video",
      params: {
        prompt: source,
        directorBrief,
        style: "cinematic short film",
      },
      description: "正在建立视频生成任务",
      confidence: 0.8,
    }, source)
  }

  const directorBrief = extractCreativeClarificationDetails(normalizedAnswer)
  return buildAutoAgentPlanningActions({
    intent: "generate-storyboard",
    params: {
      script: source,
      directorBrief,
      genre: "短片",
      style: "cinematic",
      targetPlatform: "short-drama",
    },
    description: "正在把创意拆成分镜",
    confidence: 0.8,
  }, source)
}

/**
 * 将 multi-step-pipeline 的每步拆成真实可执行节点链。
 * 参考 agentic-drama-pipeline 的分阶段 Gate 模式：
 * Script → Character Bible → Scene Bible → Storyboard → Concept Art → Continuity
 *
 * 每个 step 类型映射到对应的 nodeKind，并可追加 run_node 动作。
 */
function buildMultiStepPipelineActions(
  action: AutoAgentAction,
  userInput: string,
  canvasContext?: AutoAgentCanvasContext,
): ChatCanvasAction[] {
  const pipeline: ChatCanvasAction[] = []
  const goal = asText(action.params.goal, "全流程创作")
  const genre = asText(action.params.genre, "")
  const style = asText(action.params.style, genre ? `${genre} cinematic visuals` : "cinematic visuals")
  const steps: Array<{ type: string; description: string; params?: Record<string, unknown> }> =
    Array.isArray(action.params.steps) ? action.params.steps : [
      { type: "script", description: "生成剧本" },
      { type: "character", description: "提取角色并生成 Bible" },
      { type: "scene", description: "提取场景并生成 Bible" },
      { type: "storyboard", description: "拆解为完整分镜" },
      { type: "concept", description: "生成关键视觉概念图" },
      { type: "continuity", description: "输出一致性校验报告" },
    ]

  const STEP_LAYOUT = {
    script:     { x: 120,  y: 120, nodeKind: "document",    nodeType: "content"  as const },
    character:  { x: 520,  y: 120, nodeKind: "document",    nodeType: "content"  as const },
    scene:      { x: 920,  y: 120, nodeKind: "document",    nodeType: "content"  as const },
    storyboard: { x: 120,  y: 420, nodeKind: "storyboard",  nodeType: "content"  as const },
    concept:    { x: 920,  y: 420, nodeKind: "image-generation", nodeType: "workflow" as const },
    continuity: { x: 520,  y: 720, nodeKind: "document",    nodeType: "content"  as const },
  } as const

  const STEP_PROMPTS: Record<string, (step: typeof steps[number]) => { content: string; prompt?: string; data?: Record<string, unknown> }> = {
    script: (s) => ({
      content: `# 剧本生成\n\n目标：${goal}\n题材：${genre || "未指定"}\n${s.description}`,
      prompt: `Write a professional screenplay scene outline for ${genre || "a drama"}. Goal: ${goal}. Include scene headings, character dialogue, and action descriptions.`,
      data: { pipelineStep: "script", pipelineGoal: goal },
    }),
    character: (s) => ({
      content: `# 角色 Bible 生成\n\n目标：${goal}\n题材：${genre}\n视觉风格：${style}\n${s.description}`,
      prompt: `Extract main characters from the story and create a character bible. For each character describe: name, age, role, physical appearance, personality, costume and visual signature. Genre: ${genre}. Style: ${style}.`,
      data: { pipelineStep: "character", pipelineGoal: goal },
    }),
    scene: (s) => ({
      content: `# 场景 Bible 生成\n\n目标：${goal}\n题材：${genre}\n视觉风格：${style}\n${s.description}`,
      prompt: `Extract key locations/scenes from the story and create a scene bible. For each scene describe: location name, time of day, weather, lighting, color palette, mood and atmosphere. Genre: ${genre}. Style: ${style}.`,
      data: { pipelineStep: "scene", pipelineGoal: goal },
    }),
    storyboard: (s) => ({
      content: `# 分镜拆解\n\n目标：${goal}\n题材：${genre}\n${s.description}`,
      prompt: `Break this story into 6-9 key shots. For each shot provide: shot title, shot type (wide/medium/close-up), camera movement, duration estimate, visual description, dialogue (if any), and an English image generation prompt. Genre: ${genre}. Style: ${style}.`,
      data: { storyboardAssistantStage: "storyboard-text", pipelineStep: "storyboard", pipelineGoal: goal },
    }),
    concept: (s) => ({
      content: `# 关键视觉概念图\n\n题材：${genre}\n风格：${style}\n${s.description}`,
      prompt: `A cinematic key visual concept art, ${style}, genre: ${genre}. Goal: ${goal}. Professional film pre-production concept art, high detail, consistent visual language.`,
      data: {
        workflowRole: "Text to Image",
        model: "gpt-image-2",
        status: "ready",
        summary: "Auto Agent 流水线：关键视觉概念图节点已就绪。",
        pipelineStep: "concept",
        pipelineGoal: goal,
        autoRunRecommended: true,
      },
    }),
    continuity: (s) => ({
      content: `# 一致性校验\n\n目标：${goal}\n${s.description}`,
      prompt: `Review the previous pipeline outputs (script, character bible, scene bible, storyboard, concept art) for continuity issues. Check: character visual consistency across shots, scene logic, timeline coherence, missing details.`,
      data: { pipelineStep: "continuity", pipelineGoal: goal },
    }),
    // Fallback for unknown step types
    default: (s) => ({
      content: `# ${s.description}\n\n目标：${goal}\n题材：${genre}\n${s.type}`,
      data: { pipelineStep: s.type, pipelineGoal: goal },
    }),
  }

  // 1. Pipeline overview node
  const stepList = steps.map((s, i) => `${i + 1}. ${s.description ?? s.type}`).join("\n")
  pipeline.push(createContentAction({
    title: `流水线：${goal.slice(0, 40)}`,
    nodeKind: "document",
    content: `# ${goal}\n\n${stepList}\n\n---\n所有节点已创建，可逐步骤运行。`,
    prompt: `Execute the full pipeline: ${stepList}. Genre: ${genre}. Style: ${style}.`,
    x: 60,
    y: 60,
    data: { pipelineGoal: goal, pipelineSteps: steps.map((s) => s.type), pipelineStyle: style },
  }))

  // 2. Per-step executable nodes
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    const layoutKey = step.type in STEP_LAYOUT ? step.type as keyof typeof STEP_LAYOUT : "default"
    const layout = (STEP_LAYOUT as Record<string, { x: number; y: number; nodeKind: string; nodeType: "content" | "workflow" }>)[layoutKey]
      ?? { x: 120, y: 120 + i * 250, nodeKind: "document", nodeType: "content" as const }
    const promptBuilder = (STEP_PROMPTS as Record<string, (s: typeof step) => ReturnType<typeof STEP_PROMPTS[string]>>)[step.type] ?? STEP_PROMPTS.default!
    const built = promptBuilder(step)
    const title = `步骤 ${i + 1}：${step.description ?? step.type}`

    pipeline.push(createContentAction({
      title,
      nodeKind: layout.nodeKind,
      nodeType: layout.nodeType,
      content: built.content,
      prompt: built.prompt,
      x: layout.x,
      y: layout.y,
      data: { ...(built.data ?? {}), pipelineIndex: i },
    }))

    // Auto-run image-generation and storyboard nodes (these produce tangible output)
    if (step.type === "concept" || step.type === "storyboard") {
      pipeline.push({
        action: "run_node",
        title,
        description: `运行：${step.description ?? step.type}`,
      })
    }
  }

  // 3. Gate: continuity check after pipeline
  pipeline.push({
    action: "run_node",
    title: `流水线：${goal.slice(0, 40)}`,
    description: "启动全流程计划节点（串行执行各步骤）",
  })

  return pipeline
}

export function buildAutoAgentPlanningActions(action: AutoAgentAction, userInput: string, canvasContext?: AutoAgentCanvasContext): ChatCanvasAction[] {
  switch (action.intent) {
    case "generate-storyboard": {
      const script = asText(action.params.script, userInput)
      const directorBrief = asText(action.params.directorBrief, "")
      const sourceTitle = "Auto Agent 分镜草案"
      const storyboardContent = directorBrief ? `${script}\n\n导演补充：${directorBrief}` : script
      const sourceNode = createContentAction({
        title: sourceTitle,
        nodeKind: "storyboard",
        content: storyboardContent,
        prompt: buildDirectorStoryboardPrompt(script, {
          genre: asText(action.params.genre, ""),
          style: asText(action.params.style, ""),
          targetPlatform: asText(action.params.targetPlatform, "short-drama"),
          directorBrief,
        }),
        data: {
          storyboardAssistantStage: "storyboard-text",
          genre: action.params.genre,
          style: action.params.style,
          ...(directorBrief ? { directorBrief } : {}),
        },
      })
      const shots = parseStoryboardTextToShots(script).map((shot) => ({
        title: shot.title,
        content: shot.description,
        prompt: shot.visualPrompt,
        duration: shot.duration,
        cameraMovement: shot.cameraMovement,
        shotType: shot.shotType,
      }))

      if (shots.length === 0) return [sourceNode]

      return [sourceNode, {
        action: "generate_storyboard",
        title: sourceTitle,
        sourceNodeId: sourceTitle,
        shots,
        description: `已从创意拆出 ${shots.length} 个 Shot`,
      }, {
        action: "open_panel",
        panel: "production_queue",
        description: "打开生产队列，准备继续生成分镜图、视频、配音和字幕。",
      }]
    }
    case "generate-character": {
      const description = asText(action.params.description, userInput)
      const name = asText(action.params.name, "未命名角色")
      return [createContentAction({
        title: `角色设定：${name}`,
        nodeKind: "document",
        content: [`# ${name}`, "", `定位：${asText(action.params.role, "未指定")}`, "", description, "", "## 概念图提示词", `${description}，角色三视图，正面、侧面、背面，统一服装和道具，影视概念设定图。`].join("\n"),
      })]
    }
    case "validate-character-consistency":
      return [createContentAction({ title: "角色合规验证报告", nodeKind: "document", content: buildCharacterComplianceReport(canvasContext) })]
    case "batch-shot-variation":
      return [createContentAction({ title: "批量组镜变化方案", nodeKind: "document", content: buildBatchShotVariationReport(userInput, canvasContext) })]
    case "script-to-concept":
      return buildScriptToConceptActions(action, userInput)
    case "extract-production-assets":
      return buildProductionAssetBibleActions(action, userInput)
    case "analyze-script":
      return [createContentAction({
        title: "剧本分析任务单",
        nodeKind: "document",
        content: [`# 剧本分析`, "", asText(action.params.script, userInput), "", `分析方向：${asText(action.params.analysisType, "角色、场景、节奏、视觉风格")}`].join("\n"),
      })]
    case "generate-video":
      return [createContentAction({
        title: "视频生成任务单",
        nodeKind: "video-generation",
        content: asText(action.params.prompt, userInput),
        prompt: asText(action.params.prompt, userInput),
        data: asText(action.params.directorBrief, "") ? { directorBrief: asText(action.params.directorBrief, "") } : undefined,
      })]
    case "generate-tts":
      return [createContentAction({ title: "配音生成任务单", nodeKind: "tts", content: asText(action.params.text, userInput), prompt: asText(action.params.voice, "自动选择声线") })]
    case "multi-step-pipeline":
      return buildMultiStepPipelineActions(action, userInput, canvasContext)
    default:
      return []
  }
}

export async function processWithAutoAgent(
  userInput: string,
  optionsOrProgress?: AutoAgentProcessOptions | ((status: string) => void),
): Promise<AutoAgentAction> {
  const options: AutoAgentProcessOptions = typeof optionsOrProgress === "function"
    ? { onProgress: optionsOrProgress }
    : (optionsOrProgress ?? {})

  const progress = (status: string) => options.onProgress?.(status)

  try {
    progress("Auto Agent 正在理解创作意图...")
    const action = await detectIntent(userInput, options.canvasContext, options.signal)

    if (shouldAskCreativeClarification(action, userInput)) {
      progress("已识别为创作需求，正在确认下一步...")
      const clarification = createCreativeClarificationAction(userInput)
      options.onActions?.([clarification])
      options.onText?.("我先确认一下创作方向，避免把你的创意误当普通聊天。")
      options.onComplete?.()
      return action
    }

    if (shouldFallbackToPlainChat(action, userInput)) {
      progress("未识别到明确创作动作，切回普通对话...")
      if (options.onFallbackChat) {
        await options.onFallbackChat()
      } else {
        options.onText?.("我没有识别到明确的画布创作动作。你可以更具体地说：生成参考图、拆分镜、做角色合规检查、批量变化组镜，或从剧本生成概念图。")
      }
      options.onComplete?.()
      return action
    }

    progress(getActionDescription(action))

    if (action.intent === "extract-production-assets" && options.expandStoryboard) {
      try {
        progress("导演组正在把创意扩展为可执行文字分镜...")
        action.params.storyboardText = await generateDirectorStoryboardText({
          storyText: asText(action.params.script, userInput),
          nodeId: "auto-agent-production-bible",
        })
      } catch (error) {
        console.warn("[AUTO_AGENT_STORYBOARD_EXPANSION]", error)
        progress("导演分镜扩展暂不可用，先以基础镜头结构继续。")
      }
    }

    if (action.intent === "generate-image") {
      const latestImageSmoke = loadStoredProviderSmokeResults().image
      if (getStoredProviderSmokeReadinessStatus(latestImageSmoke) === "blocked") {
        const smokeMessage = `最近一次真实生图 smoke 失败：${latestImageSmoke?.summaryTitle || "图片链路未就绪"}。${latestImageSmoke?.message || "请先在设置面板修复或切换 provider。"}`
        options.onText?.(smokeMessage)
        throw new Error(smokeMessage)
      }

      const { generateImageFromPrompt } = await import("./imageGeneration.ts")
      const prompt = asText(action.params.prompt, userInput)
      const requestedAspectRatio = typeof action.params.aspectRatio === "string" ? action.params.aspectRatio : undefined
      const requestedSize = resolveImageGenerationSize(
        typeof action.params.size === "string" ? action.params.size : undefined,
        requestedAspectRatio,
      )
      try {
        const result = await generateImageFromPrompt({
          prompt,
          model: options.imageModel ?? "gpt-image-2",
          size: requestedSize,
          requestId: `auto-agent-image-${Date.now()}`,
        })
        options.onImageGenerated?.({
          imageUrl: result.imageUrl,
          prompt: result.prompt || prompt,
          model: result.model || options.imageModel || "gpt-image-2",
          revisedPrompt: result.revisedPrompt,
          assetId: result.assetId,
        })
        options.onText?.("图片已生成，已自动添加到画布继续迭代。")
        options.onComplete?.()
        return action
      } catch (error) {
        const unknownOutcome = isUnknownImageResultError(error)
        if (!isRetryableImageFailure(error) && !unknownOutcome) {
          throw error
        }

        progress("真实生图暂时失败，正在回退到可重试 prompt...")
        const errorMessage = unknownOutcome
          ? buildUnknownImageResultMessage(error)
          : error instanceof Error ? error.message : "图片生成失败，请稍后重试。"
        const report = options.onActions?.([createContentAction({
          title: "概念图待重试 Prompt",
          nodeKind: "prompt",
          content: prompt,
          prompt,
          data: {
            autoAgentIntent: "generate-image",
            preferredImageModel: options.imageModel ?? "gpt-image-2",
            preferredAspectRatio: requestedAspectRatio,
            preferredImageSize: requestedSize,
            imageGenerationDeferred: true,
            imageGenerationError: errorMessage,
          },
        })])
        const handoffMessage = report?.applied
          ? "已改为可重试 Prompt 节点，并放到画布继续迭代。"
          : "已改为可重试 Prompt 节点，确认后可加入画布继续迭代。"
        options.onText?.(`${errorMessage}\n${handoffMessage}`)
        options.onComplete?.()
        return action
      }
    }

    if (action.intent === "generate-moodboard") {
      const { generateMoodboard } = await import("./moodboardService.ts")
      const description = asText(action.params.description, userInput)
      const result = await generateMoodboard(description, (item) => progress(item.message))
      const actions = result.images.map((image, index) => createImageAction({
        title: `参考图 ${index + 1}：${image.dimension}`,
        nodeKind: "reference",
        prompt: image.prompt,
        imageUrl: image.imageUrl,
        x: 120 + index * 300,
        y: 120,
        data: { moodboardDimension: image.dimension, moodboardDimensionEn: image.dimension_en },
      }))
      if (actions.length > 0) {
        options.onActions?.(actions)
        options.onText?.(`已生成 ${actions.length} 张参考图，并放入画布。`)
      } else {
        options.onText?.("参考图生成完成，但没有返回可用图片。")
      }
      options.onComplete?.()
      return action
    }

    const actions = buildAutoAgentPlanningActions(action, userInput, options.canvasContext)
    if (actions.length > 0) {
      if (action.intent === "multi-step-pipeline") {
        const stepCount = Array.isArray(action.params.steps) ? action.params.steps.length : 6
        progress(`流水线已规划 ${stepCount} 个步骤，正在创建节点...`)
      }
      const report = options.onActions?.(actions)
      const nodeCount = actions.filter((item) => item.action === "create_node").length
      const pendingCount = report?.pendingConfirmation ?? 0
      const runNotice = pendingCount > 0 ? `其中 ${pendingCount} 个生成节点已等待你确认运行。` : ""
      if (action.intent === "multi-step-pipeline") {
        options.onText?.(`已创建 ${nodeCount} 个流水线节点，包含剧本→角色→场景→分镜→概念图→一致性校验。${runNotice}`)
      } else {
        options.onText?.(`已创建 ${nodeCount} 个画布节点。${runNotice}`)
      }
    } else {
      options.onText?.("已理解需求，但当前还没有对应的自动执行器。")
    }
    options.onComplete?.()
    return action
  } catch (error: any) {
    const normalized = error instanceof Error ? error : new Error(String(error))
    if ((normalized as Error & { code?: string }).code === "UNSUPPORTED_PROVIDER_CAPABILITY") {
      options.onText?.(`当前模型/Provider 配置不兼容：${normalized.message}`)
    }
    options.onError?.(normalized)
    throw normalized
  }
}
