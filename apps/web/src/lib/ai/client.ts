// ============================================================================
// Unified AI Client for Frontend (P2-5A)
// ============================================================================
// 前端调用此 client 与后端 API Route (/api/ai/chat, /api/ai/health)
// 交互，所有实际 API Key 和 Base URL 仅存在于服务端。
// ============================================================================

import type { NormalizedAiError } from "./errors"
import type { AiProviderOverrides } from "./provider-config"
import {
  shouldApplySessionApiKeyForTask,
  type ProviderSessionTaskType,
} from "./providerSessionScope.ts"
import type {
  ProviderRealSmokeTarget,
  ProviderSmokeReport,
} from "./providerSmoke"

// ============================================================================
// Types
// ============================================================================

export interface AiChatMessage {
  role: "system" | "user" | "assistant"
  content: string | unknown[]
}

export interface AiChatRequest {
  /** 模型名（可选，不传则用服务端默认） */
  model?: string
  messages: AiChatMessage[]
  temperature?: number
  /** OpenAI 兼容的 response_format */
  response_format?: { type: string }
  /** 前端请求超时时间，避免非流式请求长时间悬挂 */
  timeoutMs?: number
}

export interface AiChatResponse {
  /** 推理文本内容 */
  content: string
  /** 模型名 */
  model?: string
  /** Token 用量（若上游返回） */
  usage?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
}

export interface AiHealthResponse {
  ok: boolean
  message: string
  config: {
    baseUrl: string
    hasApiKey: boolean
    defaultModel: string
    defaultImageModel: string
    videoModel?: string
    timeoutMs: number
  }
}

export interface RuntimeProviderState {
  overrides: AiProviderOverrides | null
  usageProvider: string
}

// ============================================================================
// Client
// ============================================================================

/**
 * 统一 AI 对话请求（非流式）。
 * 前端调用 /api/ai/chat，后端代理到中转站。
 * P2-5B: 自动从 localStorage 读取局部覆盖并随请求发送。
 */
export async function callAiChat(request: AiChatRequest): Promise<AiChatResponse> {
  const overrides = getLocalProviderOverrides()
  const { timeoutMs, ...chatRequest } = request
  const body: Record<string, unknown> = { ...chatRequest }
  if (overrides) {
    body._providerOverrides = overrides
  }

  const controller = new AbortController()
  const timeout = Math.max(1, timeoutMs ?? overrides?.timeoutMs ?? 60000)
  const timer = setTimeout(() => controller.abort(), timeout)

  let res: Response
  try {
    res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw Object.assign(
        new Error("AI 请求超时，请稍后重试、缩短输入，或换用更快模型。"),
        {
          aiError: {
            code: "timeout",
            message: "AI 请求超时，请稍后重试、缩短输入，或换用更快模型。",
          } satisfies NormalizedAiError,
        },
      )
    }
    throw error
  } finally {
    clearTimeout(timer)
  }

  const text = await res.text()

  if (!res.ok) {
    let error: NormalizedAiError
    try {
      const parsed = JSON.parse(text)
      error = parsed?.error && typeof parsed.error === "object"
        ? parsed.error
        : parsed
    } catch {
      error = {
        code: `http_${res.status}`,
        message: `AI request failed (${res.status}): ${text.slice(0, 200)}`,
        status: res.status,
      }
    }
    throw Object.assign(new Error(error.message), { aiError: error })
  }

  try {
    const data = JSON.parse(text)
    return {
      content: data.content ?? data.choices?.[0]?.message?.content ?? text,
      model: data.model,
      usage: data.usage,
    }
  } catch {
    return { content: text }
  }
}

/**
 * 测试 AI 服务连接。
 * P2-5B fix: 支持传入局部覆盖配置，Local Override 模式下测试用户填写的配置。
 *
 * @param overrides - 可选的局部覆盖配置（仅在 Local Override 模式下传入）
 */
export async function checkAiHealth(overrides?: AiProviderOverrides): Promise<AiHealthResponse> {
  // P2-5B fix: 有覆盖配置时用 POST 传 _providerOverrides，
  // 没有覆盖时用 GET 测试 .env 服务端配置
  const hasOverrides = overrides && (overrides.baseUrl || overrides.defaultModel || overrides.imageModel || overrides.videoModel || overrides.timeoutMs)

  if (hasOverrides) {
    const res = await fetch("/api/ai/health", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ _providerOverrides: overrides }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.message || `Health check failed: ${res.status}`)
    }
    return res.json()
  }

  const res = await fetch("/api/ai/health")
  if (!res.ok) {
    throw new Error(`Health check failed: ${res.status}`)
  }
  return res.json()
}

export async function checkProviderSmoke(overrides?: AiProviderOverrides): Promise<ProviderSmokeReport> {
  const res = await fetch("/api/ai/provider-smoke", {
    method: overrides ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    ...(overrides ? { body: JSON.stringify({ _providerOverrides: overrides }) } : {}),
  })

  if (!res.ok) {
    throw new Error(`Provider smoke failed: ${res.status}`)
  }

  return res.json()
}

export async function runProviderSmoke(
  target: ProviderRealSmokeTarget,
  options?: {
    overrides?: AiProviderOverrides
    confirmCost?: boolean
    confirmationText?: string
    waitForResult?: boolean
  },
): Promise<{
  ok: boolean
  target: ProviderRealSmokeTarget
  message: string
  status: "passed" | "failed" | "blocked"
  details?: string[]
  artifact?: {
    type: "image" | "video"
    url: string
    mimeType?: string
  }
}> {
  const res = await fetch("/api/ai/provider-smoke/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target,
      confirmCost: options?.confirmCost === true,
      confirmationText: options?.confirmationText,
      waitForResult: options?.waitForResult === true,
      ...(options?.overrides ? { _providerOverrides: options.overrides } : {}),
    }),
  })

  return res.json()
}

/**
 * 获取当前 Provider 配置（不含 API Key）。
 */
export async function getAiConfig(): Promise<AiHealthResponse["config"]> {
  const res = await fetch("/api/ai/config")
  if (!res.ok) {
    throw new Error(`Config fetch failed: ${res.status}`)
  }
  return res.json()
}

/**
 * 从服务端获取默认模型名（带缓存）。
 */
let _cachedDefaultModel: string | null = null

export async function getDefaultModel(): Promise<string> {
  if (_cachedDefaultModel) return _cachedDefaultModel
  try {
    const config = await getAiConfig()
    _cachedDefaultModel = config.defaultModel
    return config.defaultModel
  } catch {
    return "gpt-5.5" // fallback
  }
}

/**
 * 从服务端获取默认图片模型名（带缓存）。
 */
let _cachedDefaultImageModel: string | null = null

export async function getDefaultImageModel(): Promise<string> {
  if (_cachedDefaultImageModel) return _cachedDefaultImageModel
  try {
    const config = await getAiConfig()
    _cachedDefaultImageModel = config.defaultImageModel
    return config.defaultImageModel
  } catch {
    return "gpt-image-2" // fallback
  }
}

/** 同步读取缓存的默认图片模型名（组件初始化时用，无需 await）。首次加载前 fallback。 */
export function getCachedDefaultImageModel(): string {
  return _cachedDefaultImageModel || "gpt-image-2"
}

/**
 * 从服务端获取视频分析模型名（带缓存）。
 * 如果没配置 AI_VIDEO_MODEL，返回默认文本模型。
 */
let _cachedVideoModel: string | null = null

export async function getVideoModel(): Promise<string> {
  if (_cachedVideoModel) return _cachedVideoModel
  // P2-5B: 优先检查 localStorage 覆盖
  const local = getLocalProviderOverrides()
  if (local?.videoModel) {
    _cachedVideoModel = local.videoModel
    return local.videoModel
  }
  try {
    const config = await getAiConfig()
    _cachedVideoModel = config.videoModel || config.defaultModel
    return _cachedVideoModel!
  } catch {
    return "gpt-5.5" // fallback
  }
}

function getStoredSessionApiKey(): string | undefined {
  if (typeof window === "undefined") return undefined
  try {
    const sessionKey = window.sessionStorage.getItem("startrails_session_api_key")
    if (sessionKey) return sessionKey
    const localKey = window.localStorage.getItem("startrails_ui_api_key")
    return localKey || undefined
  } catch {
    return undefined
  }
}

async function inferUsageProvider(baseUrl?: string): Promise<string> {
  if (baseUrl) {
    try {
      const hostname = new URL(baseUrl).hostname.replace(/^www\./, "")
      return hostname || "custom"
    } catch {
      return "custom"
    }
  }

  try {
    const config = await getAiConfig()
    if (config.baseUrl) {
      const hostname = new URL(config.baseUrl).hostname.replace(/^www\./, "")
      return hostname || "default"
    }
  } catch {
    // Ignore and fall back below.
  }

  return "default"
}

export async function getRuntimeProviderState(
  taskType: ProviderSessionTaskType = "text",
): Promise<RuntimeProviderState> {
  const overrides = getLocalProviderOverrides()
  const sessionApiKey = getStoredSessionApiKey()
  const shouldAttachSessionApiKey = shouldApplySessionApiKeyForTask({
    taskType,
    sessionApiKey,
    routeHint: overrides,
  })
  const mergedOverrides = overrides || shouldAttachSessionApiKey
    ? {
        ...(overrides || {}),
        ...(shouldAttachSessionApiKey ? { sessionApiKey } : {}),
      }
    : null

  return {
    overrides: mergedOverrides,
    usageProvider: await inferUsageProvider(mergedOverrides?.baseUrl),
  }
}

// ============================================================================
// P2-5B: Local Override Helpers
// ============================================================================

const LS_PREFIX = "startrails_provider_"

/** 保存局部 Provider 覆盖到 localStorage */
export function saveLocalProviderOverrides(overrides: AiProviderOverrides): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(`${LS_PREFIX}baseUrl`, overrides.baseUrl ?? "")
    localStorage.removeItem(`${LS_PREFIX}apiKey`)
    localStorage.setItem(`${LS_PREFIX}defaultModel`, overrides.defaultModel ?? "")
    localStorage.setItem(`${LS_PREFIX}imageModel`, overrides.imageModel ?? "")
    localStorage.setItem(`${LS_PREFIX}videoModel`, overrides.videoModel ?? "")
    localStorage.setItem(`${LS_PREFIX}timeoutMs`, String(overrides.timeoutMs ?? ""))
    // 清除缓存让下次调用重新加载
    _cachedDefaultModel = null
    _cachedDefaultImageModel = null
    _cachedVideoModel = null
  } catch { /* localStorage 不可用时静默忽略 */ }
}

/** 从 localStorage 读取局部 Provider 覆盖 */
export function getLocalProviderOverrides(): AiProviderOverrides | null {
  if (typeof window === "undefined") return null
  try {
    localStorage.removeItem(`${LS_PREFIX}apiKey`)
    localStorage.removeItem("startrails_api_key")

    const baseUrl = localStorage.getItem(`${LS_PREFIX}baseUrl`) || undefined
    const defaultModel = localStorage.getItem(`${LS_PREFIX}defaultModel`) || undefined
    const imageModel = localStorage.getItem(`${LS_PREFIX}imageModel`) || undefined
    const videoModel = localStorage.getItem(`${LS_PREFIX}videoModel`) || undefined
    const timeoutRaw = localStorage.getItem(`${LS_PREFIX}timeoutMs`)
    const timeoutMs = timeoutRaw ? Number(timeoutRaw) : undefined

    if (!baseUrl && !defaultModel && !imageModel && !videoModel && !timeoutMs) return null

    return { baseUrl, defaultModel, imageModel, videoModel, timeoutMs }
  } catch {
    return null
  }
}

/** 清除 localStorage 中的局部覆盖 */
export function clearLocalProviderOverrides(): void {
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem(`${LS_PREFIX}baseUrl`)
    localStorage.removeItem(`${LS_PREFIX}apiKey`)
    localStorage.removeItem(`${LS_PREFIX}defaultModel`)
    localStorage.removeItem(`${LS_PREFIX}imageModel`)
    localStorage.removeItem(`${LS_PREFIX}videoModel`)
    localStorage.removeItem(`${LS_PREFIX}timeoutMs`)
    _cachedDefaultModel = null
    _cachedDefaultImageModel = null
    _cachedVideoModel = null
  } catch { /* 静默忽略 */ }
}

/** 检查是否启用了局部覆盖 */
export function hasLocalProviderOverrides(): boolean {
  return getLocalProviderOverrides() !== null
}
