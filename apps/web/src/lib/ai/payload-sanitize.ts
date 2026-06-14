// ============================================================================
// AI Payload Sanitization (N1-2-4)
// ============================================================================
// 纯函数：在 payload 发送到 API 之前，收口所有 sanitization 逻辑。
// 无 IO、无 process.env、无 localStorage，适合服务端/前端/单测复用。
//
// 处理场景：
// a. prompt/message 中的 [object Object] 检测和清理
// b. undefined/null/NaN 字段移除
// c. prompt 长度截断（可配置 maxLen）
// d. model 名称清理（trim + 空值防御）
// e. context 中非 string 元素过滤
// f. _providerOverrides 对象清理，并丢弃 apiKey 等敏感字段
// ============================================================================

// ============================================================================
// Types
// ============================================================================

/** 清理前的 raw payload（允许脏数据） */
export interface RawRunPayload {
  message?: unknown
  model?: unknown
  context?: {
    systemOverride?: unknown
    selectedNode?: unknown
    nodes?: unknown[]
    mentionedNodes?: unknown[]
    attachments?: unknown[]
    [key: string]: unknown
  }
  _providerOverrides?: Record<string, unknown>
  [key: string]: unknown
}

/** 清理后的 sanitized payload（所有字段类型安全） */
export interface SanitizedRunPayload {
  message: string
  model: string
  context?: {
    systemOverride?: string
    [key: string]: unknown
  }
  _providerOverrides?: Record<string, string | number | undefined>
  [key: string]: unknown
}

/** sanitizeRunPayload 的配置选项 */
export interface SanitizeOptions {
  /** prompt/message 最大字符长度，超出时截断并附加标记。默认 32000 */
  maxPromptLen?: number
  /** 截断后追加的标记文本。默认 "\n\n[...truncated]" */
  truncationSuffix?: string
}

/** sanitizeRunPayload 的结果，包含可能的 warnings */
export interface SanitizeResult {
  payload: SanitizedRunPayload
  warnings: string[]
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_PROMPT_LEN = 32000
const DEFAULT_TRUNCATION_SUFFIX = "\n\n[...truncated]"

/** 检测 [object Object] 及其变体 */
const OBJECT_STRINGIFIED_PATTERN = /\[object\s+Object\]/g

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * 检查字符串是否包含 [object Object]（包括大小写变体、前后有空格等）。
 */
export function containsObjectStringified(value: unknown): boolean {
  if (typeof value !== "string") return false
  OBJECT_STRINGIFIED_PATTERN.lastIndex = 0
  return OBJECT_STRINGIFIED_PATTERN.test(value)
}

/**
 * 清理字符串中的 [object Object] 模式。
 * - 完整的 "[object Object]" → 移除
 * - "some text [object Object] more" → "some text  more"
 * - 不改变其他内容
 */
export function cleanObjectStringified(value: string): string {
  OBJECT_STRINGIFIED_PATTERN.lastIndex = 0
  return value.replace(OBJECT_STRINGIFIED_PATTERN, "").replace(/  +/g, " ").trim()
}

/**
 * 安全截断字符串到指定长度。
 * 在词边界或换行符处截断，避免截断单词中间（最佳努力）。
 * 如果无法找到好的断点，直接在 maxLen 处截断。
 */
export function truncateString(value: string, maxLen: number, suffix: string): string {
  if (value.length <= maxLen) return value
  const targetLen = maxLen - suffix.length
  if (targetLen <= 0) return suffix.trim()
  // 尝试在最后一个换行符处截断
  let cutAt = value.lastIndexOf("\n", targetLen)
  // 如果没有合适的换行符，尝试在最后一个空格处截断
  if (cutAt <= 0 || cutAt < targetLen - 200) {
    cutAt = value.lastIndexOf(" ", targetLen)
  }
  // 如果仍然没有好的断点，直接截断
  if (cutAt <= 0 || cutAt < targetLen - 500) {
    cutAt = targetLen
  }
  return value.slice(0, cutAt) + suffix
}

/**
 * 清理 model 字段值：trim + 空值防御。
 * 复用 model-resolve 的 cleanModel 语义，但不依赖它（本模块独立）。
 */
export function sanitizeModel(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/**
 * 清理 context.systemOverride：只保留 string，其他转为 undefined。
 */
function sanitizeSystemOverride(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.length > 0 ? value : undefined
  }
  return undefined
}

/**
 * 清理 _providerOverrides 对象。
 * - 移除 undefined / NaN / null 值
 * - string 字段做 trim，空串转为 undefined（从而被移除）
 * - number 字段保留有效数字（过滤 NaN）
 * - apiKey 等敏感字段一律丢弃，避免前端请求体把密钥送到服务端日志或网络面板
 */
export function sanitizeProviderOverrides(
  raw: Record<string, unknown> | undefined,
): Record<string, string | number | undefined> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined

  const cleaned: Record<string, string | number | undefined> = {}
  let hasKeys = false

  for (const [key, val] of Object.entries(raw)) {
    // 放行 sessionApiKey（会话级Key，不持久化到localStorage）
    // 但屏蔽 apiKey / api_key（防止前端提交的持久化覆盖）
    if (key === "sessionApiKey") {
      if (typeof val === "string" && val.trim().length > 0) {
        cleaned[key] = val.trim()
        hasKeys = true
      }
      continue
    }
    if (key.toLowerCase().includes("apikey") || key.toLowerCase().includes("api_key")) {
      continue
    }

    // 跳过 undefined / null
    if (val === undefined || val === null) continue

    if (typeof val === "string") {
      const trimmed = val.trim()
      if (trimmed.length > 0) {
        cleaned[key] = trimmed
        hasKeys = true
      }
    } else if (typeof val === "number") {
      if (!Number.isNaN(val) && Number.isFinite(val)) {
        cleaned[key] = val
        hasKeys = true
      }
    }
    // 其他类型（boolean, object, array 等）静默跳过
  }

  return hasKeys ? cleaned : undefined
}

// ============================================================================
// Core: sanitizeRunPayload
// ============================================================================

/**
 * 对 AI Run Payload 执行完整 sanitization。
 *
 * 保证：
 * - 返回的 payload.message 是非空 string（脏数据时降级为空串）
 * - 返回的 payload.model 是非空 string（脏数据时降级为 "gpt-5.5"）
 * - [object Object] 被清理
 * - 超长 prompt 被截断
 * - _providerOverrides 中无 undefined/NaN/null
 * - context.systemOverride 只保留有效 string
 * - 所有 warnings 记录在 result.warnings 中
 */
export function sanitizeRunPayload(
  raw: RawRunPayload,
  options?: SanitizeOptions,
): SanitizeResult {
  const warnings: string[] = []
  const maxLen = options?.maxPromptLen ?? DEFAULT_MAX_PROMPT_LEN
  const suffix = options?.truncationSuffix ?? DEFAULT_TRUNCATION_SUFFIX

  // ── 1. message / prompt 清理 ──────────────────────────────

  let message: string

  if (typeof raw.message === "string") {
    message = raw.message
  } else if (raw.message === undefined || raw.message === null) {
    message = ""
    warnings.push("payload.message was undefined/null, using empty string")
  } else {
    // 非字符串类型（object, number 等）→ 尝试 JSON.stringify，失败则降级
    try {
      message = JSON.stringify(raw.message) ?? ""
      warnings.push(`payload.message was non-string (${typeof raw.message}), JSON.stringify used`)
    } catch {
      message = ""
      warnings.push(`payload.message was non-string (${typeof raw.message}), could not stringify`)
    }
  }

  // 检测并清理 [object Object]
  if (containsObjectStringified(message)) {
    message = cleanObjectStringified(message)
    warnings.push("payload.message contained [object Object] patterns, cleaned")
  }

  // 截断
  if (message.length > maxLen) {
    message = truncateString(message, maxLen, suffix)
    warnings.push(`payload.message truncated from >${maxLen} chars`)
  }

  // ── 2. model 清理 ────────────────────────────────────────

  const model = sanitizeModel(raw.model)
  if (!model) {
    // 不在此处填充 fallback model —— model 解析由 resolveModelForTask 负责
    // 此处只做 sanitization，不做 resolution
    warnings.push("payload.model was empty/invalid after sanitization")
  }

  // ── 3. context 清理 ──────────────────────────────────────

  let sanitizedContext: SanitizedRunPayload["context"] = undefined

  if (raw.context && typeof raw.context === "object" && !Array.isArray(raw.context)) {
    const ctx = raw.context as Record<string, unknown>
    const cleanedCtx: Record<string, unknown> = {}

    // systemOverride：只保留有效 string
    if (ctx.systemOverride !== undefined) {
      const sys = sanitizeSystemOverride(ctx.systemOverride)
      if (sys !== undefined) {
        cleanedCtx.systemOverride = sys
      }
    }

    // 复制其他已知的 context 字段（原样透传，不深入清理）
    // 注意：这些字段的实际类型安全性由下游 API route 负责
    for (const key of Object.keys(ctx)) {
      if (key === "systemOverride") continue // 已处理
      cleanedCtx[key] = ctx[key]
    }

    sanitizedContext = Object.keys(cleanedCtx).length > 0 ? cleanedCtx : undefined
  }

  // ── 4. _providerOverrides 清理 ───────────────────────────

  const providerOverrides = sanitizeProviderOverrides(raw._providerOverrides)

  // ── 5. 组装返回 ──────────────────────────────────────────

  const payload: SanitizedRunPayload = {
    message,
    model: model ?? "",  // model 解析失败时用空串占位，由调用方决定 fallback
    ...(sanitizedContext !== undefined ? { context: sanitizedContext } : {}),
    ...(providerOverrides !== undefined ? { _providerOverrides: providerOverrides } : {}),
  }

  return { payload, warnings }
}
