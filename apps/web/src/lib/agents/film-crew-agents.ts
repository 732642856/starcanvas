// ============================================================================
// Film Crew Agents — 7 角色多 Agent 影视创作系统
// 基于 DEV PLAN.md 设计，使用 Mastra (Apache 2.0) Agent API
// ============================================================================

import type { CinematicShot, SceneAnalysis } from "@/types/cinematic"
import type { StoryboardShotData } from "@/app/canvas/components/canvas/types"
import type { LocalSkillAuditRecord } from "@/lib/local-skills/contracts"

// ---------------------------------------------------------------------------
// Agent Role Definitions — 7 specialized roles per DEV PLAN.md
// ---------------------------------------------------------------------------

export const FILM_CREW_ROLES = {
  director: {
    id: "director",
    name: "导演 Director",
    icon: "Clapperboard",
    detail: "叙事节奏 / 视觉风格",
    priority: "P1" as const,
  },
  storyboardArtist: {
    id: "storyboard-artist",
    name: "分镜师 Storyboard Artist",
    icon: "Layout",
    detail: "剧本→镜头拆解",
    priority: "P0" as const,
  },
  cinematographer: {
    id: "cinematographer",
    name: "摄影师 Cinematographer",
    icon: "Film",
    detail: "景别 / 机位 / 光线",
    priority: "P1" as const,
  },
  productionDesigner: {
    id: "production-designer",
    name: "美术指导 Production Designer",
    icon: "Palette",
    detail: "风格 / 色彩 / 参考",
    priority: "P2" as const,
  },
  promptEngineer: {
    id: "prompt-engineer",
    name: "Prompt 工程师",
    icon: "Wand2",
    detail: "优化生图/生视频提示词",
    priority: "P1" as const,
  },
  writer: {
    id: "writer",
    name: "编剧 Writer",
    icon: "PenLine",
    detail: "剧本 / 角色设定",
    priority: "P1" as const,
  },
  router: {
    id: "router",
    name: "路由 Router",
    icon: "Route",
    detail: "任务分发 / 素材流",
    priority: "P1" as const,
  },
} as const

export type FilmCrewRoleId = keyof typeof FILM_CREW_ROLES

// ---------------------------------------------------------------------------
// System Prompts — each agent gets a specialized instruction set
// ---------------------------------------------------------------------------

export const AGENT_SYSTEM_PROMPTS: Record<FilmCrewRoleId, string> = {
  director: `你是一位专业影视导演 AI。你的职责是：
1. 把控整体叙事节奏和视觉风格方向
2. 审核分镜师、摄影师、美术指导的输出是否符合创作意图
3. 提出修改意见，确保叙事一致性
4. 决定关键场景的情绪弧线和节奏变化
输出格式：JSON { "feedback": string, "approved": boolean, "revisions": string[] }`,

  storyboardArtist: `你是一位专业影视分镜师 AI。你的职责是：
1. 将剧本拆解为结构化的分镜方案
2. 识别场景边界并标注地点、时间、出场角色
3. 为每个镜头指定景别(shotSize)、机位(cameraAngle)、运动(cameraMovement)
4. 设计情绪曲线，避免连续镜头情绪不变
输出格式：JSON { "scenes": SceneAnalysis[], "shots": CinematicShot[], "emotionalCurve": number[] }`,

  cinematographer: `你是一位专业影视摄影师 AI。你的职责是：
1. 为每个镜头补充具体的摄影方案
2. 指定景别(extreme-wide/wide/medium/close-up/extreme-close-up)
3. 指定机位(eye-level/low-angle/high-angle/dutch/bird-eye/worm-eye/over-shoulder/POV)
4. 指定运镜(static/push-in/pull-out/tracking/pan/tilt/dolly/arc/handheld/steadicam/drone/zoom)
5. 遵守180度轴线规则，正反打 screenDirection 应相反
6. 情绪决定镜头策略：calm→平视固定 / tense→缓慢推近 / fear→手持近景 / anger→低角度压迫 / intimacy→平视柔和 / isolation→大远景高角度
输出格式：JSON { "shots": { shotId: string; shotSize: string; cameraAngle: string; cameraMovement: string; composition: string; blocking: string }[] }`,

  productionDesigner: `你是一位专业影视美术指导 AI。你的职责是：
1. 为每个场景设计视觉风格方案
2. 指定色彩方案/灯光方案
3. 管理参考图/情绪板
4. 确保场景间视觉连贯性
5. 提供 costume、props、set design 建议
输出格式：JSON { "scenes": { sceneId: string; colorPalette: string[]; lighting: string; mood: string; references: string[] }[] }`,

  promptEngineer: `你是一位专业 AI 提示词工程师。你的职责是：
1. 将分镜方案优化为可用于图像/视频生成模型的提示词
2. 确保 visualPrompt 和 negativePrompt 符合目标模型的要求
3. 为每个镜头生成结构化的 JSON 提示词（适配 Ideogram 等模型）
4. 维护角色一致性提示词模板
输出格式：JSON { "shots": { shotId: string; visualPrompt: string; negativePrompt: string; structuredPrompt?: object }[] }`,

  writer: `你是一位专业影视编剧 AI。你的职责是：
1. 根据故事想法生成完整剧本
2. 创建角色设定档案（姓名/年龄/外貌/性格/背景/动机）
3. 设计对话和潜台词
4. 维护角色关系网络
输出格式：JSON { "script": string, "characters": { name: string; description: string; role: string; traits: string[] }[], "characterRelations": string }`,

  router: `你是一位工作流路由 AI。你的职责是：
1. 分析任务需求，分发到合适的专门 Agent
2. 管理 Agent 间数据传递（剧本→分镜师，分镜→摄影师，优化→提示词工程师）
3. 协调并行任务
4. 监控素材流完整性
输出格式：JSON { "taskDelegation": { agentId: string; input: string }[], "parallelBatches": string[][] }`,
}

// ---------------------------------------------------------------------------
// Agent Action Types — structured operations agents can request
// ---------------------------------------------------------------------------

export type AgentActionType =
  | "create_node"
  | "update_node"
  | "delete_node"
  | "create_edge"
  | "generate_storyboard"
  | "auto_layout"
  | "generate_images"
  | "generate_video"
  | "generate_audio"
  | "create_composition"

export interface AgentAction {
  type: AgentActionType
  params: Record<string, unknown>
  undoable: boolean
  sourceTrace: string
  timestamp: number
}

// ---------------------------------------------------------------------------
// Agent Operation Modes — per DEV PLAN.md
// ---------------------------------------------------------------------------

export type AgentOperationMode = "ask" | "max" | "preview"

export const OPERATION_MODE_LABELS: Record<AgentOperationMode, string> = {
  ask: "Ask — 计划确认后执行",
  max: "Max — 直接执行",
  preview: "Preview — 草稿预览后确认",
}

export interface AgentContext {
  script: string
  characterRelations?: string
  genre: string
  style: string
  targetPlatform: "short-drama" | "film" | "interactive" | "commercial"
  shotDensity: "sparse" | "normal" | "dense"
  additionalNotes?: string
  title?: string
  mode: AgentOperationMode
  /** Existing canvas nodes to consider */
  canvasNodes?: Array<{ id: string; type: string; content?: string }>
  /** Server-validated, untrusted local Skill references. Never user file paths. */
  localSkillContext?: string
  localSkillAudit?: LocalSkillAuditRecord[]
}

// ---------------------------------------------------------------------------
// Crew Orchestrator — manages all 7 agents
// ---------------------------------------------------------------------------

export interface CrewAgentStatus {
  roleId: FilmCrewRoleId
  status: "idle" | "running" | "done" | "error"
  output?: string
  error?: string
  startedAt?: number
  completedAt?: number
}

export interface CrewExecutionResult {
  success: boolean
  agentStatuses: CrewAgentStatus[]
  finalOutput?: {
    scenes?: SceneAnalysis[]
    shots?: CinematicShot[]
    emotionalCurve?: number[]
    actions?: AgentAction[]
  }
  executionTrace: string[]
  localSkillAudit?: LocalSkillAuditRecord[]
}

/** Build the full film crew context for agent prompts */
export function buildCrewContext(input: AgentContext): string {
  const parts: string[] = []

  if (input.title) parts.push(`## 项目标题\n${input.title}`)
  parts.push(`## 目标平台\n${input.targetPlatform}`)
  parts.push(`## 类型\n${input.genre}`)
  parts.push(`## 视觉风格\n${input.style}`)
  parts.push(`## 镜头密度\n${input.shotDensity}`)

  if (input.characterRelations)
    parts.push(`## 角色关系\n${input.characterRelations}`)

  if (input.additionalNotes)
    parts.push(`## 额外说明\n${input.additionalNotes}`)

  if (input.localSkillContext)
    parts.push(input.localSkillContext)

  parts.push(`## 操作模式\n${OPERATION_MODE_LABELS[input.mode]}`)

  parts.push(`\n## 剧本/故事文本\n${input.script}`)

  return parts.join("\n\n")
}

/**
 * Determine which agents should run based on context and mode.
 * Returns ordered list of agent role IDs to execute.
 */
export function determineCrewPlan(
  input: AgentContext,
): FilmCrewRoleId[] {
  // Default execution order — Writer first (if no script), then Storyboard, then others
  const plan: FilmCrewRoleId[] = []

  // Writer always runs first if we need to generate a script
  if (input.script.length < 100 || input.script.includes("想法") || input.script.includes("创意")) {
    plan.push("writer")
  }

  // Storyboard Artist is P0 — always runs
  plan.push("storyboardArtist")

  // Cinematographer runs after storyboard
  plan.push("cinematographer")

  // Director reviews the combined output
  plan.push("director")

  // Prompt Engineer optimizes for generation
  plan.push("promptEngineer")

  // Production Designer provides visual guidance
  if (input.style && input.style !== "默认") {
    plan.push("productionDesigner")
  }

  // Router manages the workflow
  plan.push("router")

  return plan
}
