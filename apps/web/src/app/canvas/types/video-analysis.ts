// ============================================================================
// Video Analysis Result Types (V1-4.5)
// ============================================================================
// V1 Mock 模式：只填充 summary + keyframes（字段已预留，V2 接入真实模型后补齐）
// ============================================================================

/** 关键帧引用（从视频中抽取的帧） */
export interface VideoKeyframeRef {
  /** 来源视频节点 ID */
  sourceVideoId: string
  /** 来源视频 URL */
  sourceVideoUrl?: string
  /** 帧在视频中的时间戳 (ms) */
  timestampMs: number
  /** 帧序号 (0-based) */
  frameIndex: number
  /** 帧缩略图 URL */
  imageUrl: string
  /** 帧宽度 */
  width?: number
  /** 帧高度 */
  height?: number
  /** 帧描述（分析后填充，V1 Mock 为空） */
  description?: string
  /** 关键帧选择原因 */
  selectionReason?: "scene-change" | "representative" | "uniform-fallback"
  /** 场景段序号（本地抽帧/分析阶段填充） */
  sceneIndex?: number
  /** 与上一候选帧之间的视觉变化分数 */
  changeScore?: number
}

/** 字幕/对白片段 */
export interface VideoCaption {
  /** 开始时间 (ms) */
  startMs: number
  /** 结束时间 (ms) */
  endMs: number
  /** 字幕文本 */
  text: string
  /** 说话人标识 */
  speaker?: string
  /** 置信度 (0-1) */
  confidence?: number
}

/** 事件检测结果 */
export interface VideoEvent {
  /** 事件开始时间 (ms) */
  startMs: number
  /** 事件结束时间 (ms) */
  endMs: number
  /** 事件标签 */
  label: string
  /** 事件描述 */
  description?: string
  /** 置信度 (0-1) */
  confidence?: number
}

/** 本地场景/镜头段检测结果 */
export interface VideoSceneSegment {
  /** 场景段序号 (0-based) */
  sceneIndex: number
  /** 开始时间 (ms) */
  startMs: number
  /** 结束时间 (ms) */
  endMs: number
  /** 本段代表关键帧序号 */
  representativeFrameIndex: number
  /** 本段包含的关键帧序号 */
  frameIndexes: number[]
  /** 与上一段之间的视觉变化分数 (0-1) */
  changeScore: number
  /** 场景段描述 */
  description?: string
  /** 置信度 (0-1) */
  confidence?: number
}

/** 物体检测结果 */
export interface VideoObject {
  /** 物体标签 */
  label: string
  /** 置信度 (0-1) */
  confidence?: number
  /** 出现帧列表 */
  frames?: Array<{
    /** 帧时间戳 (ms) */
    timestampMs: number
    /** 边界框 */
    bbox?: {
      x: number
      y: number
      width: number
      height: number
    }
  }>
}

/** 视频分析结果（完整结构，V1 只填充 summary + keyframes） */
export interface VideoAnalysisResult {
  /** 视频摘要 */
  summary: string
  /** 关键帧列表（含时间戳和来源视频 ID） */
  keyframes: VideoKeyframeRef[]
  /** 字幕/对白片段（V2） */
  captions?: VideoCaption[]
  /** 事件检测结果（V2） */
  events?: VideoEvent[]
  /** 本地场景/镜头段检测结果 */
  scenes?: VideoSceneSegment[]
  /** 物体检测结果（V2） */
  objects?: VideoObject[]
  /** 原始响应（调试用，V1 Mock 用 { mode: "mock", frameCount } 标记） */
  raw?: unknown
}

// ============================================================================
// TypedRawOutput — 统一的类型化 raw 输出包装（用于历史持久化）
// ============================================================================
// 为未来的 ImageAnalysisResult / LLMResult / AudioTranscriptResult 等预留扩展点。
// ============================================================================

/**
 * 类型化 raw 输出包装。
 * 未来结构变化时通过 version 字段兼容。
 */
export interface TypedRawOutput<T = unknown> {
  /** 输出类型标识，如 "video-analysis"、"image-analysis" */
  kind: string
  /** 数据版本号（递增，用于迁移兼容） */
  version: number
  /** 结构化输出数据 */
  data: T
}

/**
 * 通用 TypedRawOutput 类型守卫。
 * 不限制 kind 值，只验证结构完整性：有非空 kind 字符串、有限数值 version、含 data 字段。
 */
export function isTypedRawOutput<T = unknown>(
  value: unknown,
): value is TypedRawOutput<T> {
  if (!value || typeof value !== "object") return false

  const raw = value as Partial<TypedRawOutput<T>>

  return (
    typeof raw.kind === "string" &&
    raw.kind.length > 0 &&
    typeof raw.version === "number" &&
    Number.isFinite(raw.version) &&
    "data" in raw
  )
}

// ============================================================================
// 视频分析 raw 输出常量（避免硬编码，减少 typo）
// ============================================================================

/** 视频分析 TypedRawOutput.kind 标识 */
export const VIDEO_ANALYSIS_RAW_KIND = "video-analysis" as const

/** 视频分析 TypedRawOutput.version 当前版本 */
export const VIDEO_ANALYSIS_RAW_VERSION = 1 as const

// ============================================================================
// 识别函数 — 用于 HistoryPanel 等消费端自动检测视频分析结果
// ============================================================================

/**
 * 判断给定值是否为 VideoAnalysisResult（直接值）。
 * 判定规则：至少存在 summary 字符串、非空 keyframes 数组、captions 数组或 events 数组之一。
 */
export function isVideoAnalysisResult(value: unknown): value is VideoAnalysisResult {
  if (!value || typeof value !== "object") return false

  const candidate = value as Partial<VideoAnalysisResult>

  return Boolean(
    typeof candidate.summary === "string" ||
      (Array.isArray(candidate.keyframes) && candidate.keyframes.length > 0) ||
      Array.isArray(candidate.captions) ||
      Array.isArray(candidate.events),
  )
}

/**
 * 从任意值中提取 VideoAnalysisResult。
 * 支持直接 VideoAnalysisResult 和包裹结构（{ videoAnalysis, result }）。
 * 这是通用提取函数，不感知 TypedRawOutput 包装。
 *
 * @returns VideoAnalysisResult 或 undefined（非视频分析结果）
 */
export function getVideoAnalysisResult(value: unknown): VideoAnalysisResult | undefined {
  if (isVideoAnalysisResult(value)) return value

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>
    if (isVideoAnalysisResult(obj.videoAnalysis)) return obj.videoAnalysis
    if (isVideoAnalysisResult(obj.result)) return obj.result
  }

  return undefined
}

/**
 * 从历史 output.raw 中提取 VideoAnalysisResult。
 * 专用于历史数据提取，支持三种格式：
 *   1. TypedRawOutput { kind: "video-analysis", version: 1, data: VideoAnalysisResult }
 *   2. 旧格式：直接 VideoAnalysisResult（legacy 兼容）
 *   3. 包裹格式：{ videoAnalysis | result: VideoAnalysisResult }
 *
 * @returns VideoAnalysisResult 或 undefined（非视频分析结果或格式不兼容）
 */
export function getVideoAnalysisFromHistoryRaw(raw: unknown): VideoAnalysisResult | undefined {
  if (!raw || typeof raw !== "object") return undefined

  // 拒绝 sanitizeHistoryRawOutput 截断标记（{ _truncated: true, ... }）
  if ((raw as Record<string, unknown>)._truncated === true) return undefined

  // 1. TypedRawOutput 包装（通用守卫 + kind 匹配）
  if (isTypedRawOutput(raw)) {
    if (raw.kind !== VIDEO_ANALYSIS_RAW_KIND) return undefined
    // data 也可能被截断，加守卫
    if ((raw.data as Record<string, unknown>)?._truncated === true) return undefined
    return getVideoAnalysisResult(raw.data)
  }

  // 2. Legacy：直接 VideoAnalysisResult 或包裹结构（{ videoAnalysis, result }）
  return getVideoAnalysisResult(raw)
}
