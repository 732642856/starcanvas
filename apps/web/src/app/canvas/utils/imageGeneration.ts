import { persistImageDataUrl } from "../../../lib/assets/localImageStore.ts"
import { getRuntimeProviderState } from "../../../lib/ai/client.ts"
import { resolveRuntimeProviderTaskContract } from "../../../lib/ai/providerTaskRouting.ts"

export const IMAGE_GENERATION_CLIENT_TIMEOUT_MS = 150_000

type ApiErrorPayload = {
  code?: string
  userMessage?: string
  message?: string
  detail?: string
  status?: number
  retryable?: boolean
}

export type ImageGenerationErrorCode =
  | "CLIENT_TIMEOUT"
  | "NETWORK_ERROR"
  | "API_ERROR"
  | "INVALID_RESPONSE"
  | string

export class ImageGenerationError extends Error {
  code: ImageGenerationErrorCode
  status?: number
  requestId?: string
  attempts?: number
  retryable: boolean
  detail?: string

  constructor(params: {
    message: string
    code: ImageGenerationErrorCode
    status?: number
    requestId?: string
    attempts?: number
    retryable?: boolean
    detail?: string
  }) {
    super(params.message)
    this.name = "ImageGenerationError"
    this.code = params.code
    this.status = params.status
    this.requestId = params.requestId
    this.attempts = params.attempts
    this.retryable = params.retryable ?? true
    this.detail = params.detail
  }
}

function createTimeoutError(): ImageGenerationError {
  return new ImageGenerationError({
    message: "图片生成超时，请稍后重试。",
    code: "CLIENT_TIMEOUT",
    retryable: true,
    detail: `前端等待超过 ${Math.round(IMAGE_GENERATION_CLIENT_TIMEOUT_MS / 1000)} 秒后主动结束请求。`,
  })
}

function parseRetryableFromStatus(status: number): boolean {
  return [408, 429, 500, 502, 503, 504].includes(status)
}

async function readJsonSafely(res: Response): Promise<any> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

function normalizeApiError(payload: any, status: number): ImageGenerationError {
  const error = payload?.error as string | ApiErrorPayload | undefined
  if (typeof error === "string") {
    return new ImageGenerationError({
      message: error || `API error: ${status}`,
      code: "API_ERROR",
      status,
      requestId: payload?.requestId,
      attempts: payload?.attempts,
      retryable: parseRetryableFromStatus(status),
    })
  }

  const detail = typeof error?.detail === "string" ? error.detail.trim() : ""
  const userMessage = typeof error?.userMessage === "string" ? error.userMessage.trim() : ""
  const rawMessage = typeof error?.message === "string" ? error.message.trim() : ""
  const message = detail && userMessage && detail !== userMessage
    ? `${userMessage}\n${detail}`
    : userMessage || rawMessage || `API error: ${status}`

  return new ImageGenerationError({
    message,
    code: error?.code || "API_ERROR",
    status: error?.status || status,
    requestId: payload?.requestId,
    attempts: payload?.attempts,
    retryable: error?.retryable ?? parseRetryableFromStatus(status),
    detail: error?.detail,
  })
}

// ── Error message mapping ──

const ERROR_MESSAGES: Record<string, string> = {
  network: "网络连接失败，请检查网络后重试",
  "Failed to fetch": "网络请求失败，请检查网络后重试",
  "fetch failed": "网络请求失败，请检查网络后重试",
  rate_limit: "请求过于频繁，请稍后重试",
  "rate limit": "请求过于频繁，请稍后重试",
  "content_filter": "内容不符合安全规范，请调整描述后重试",
  "content_policy": "内容不符合安全规范，请调整描述后重试",
  "safety": "生成被安全策略拦截，请调整描述后重试",
  "timeout": "请求超时，图片生成耗时过长",
  "timed out": "请求超时，图片生成耗时过长",
  unauthorized: "API 认证失败，请检查配置",
  "413": "图片文件过大，请压缩后重试",
  "Payload Too Large": "图片文件过大，请压缩后重试",
}

export function friendlyErrorMessage(raw: string): string {
  if (!raw) return "生图失败，请重试"
  const lower = raw.toLowerCase()
  for (const [key, msg] of Object.entries(ERROR_MESSAGES)) {
    if (lower.includes(key)) return msg
  }
  // Truncate technical errors
  if (raw.length > 80) return `生成失败: ${raw.slice(0, 60)}...`
  if (raw.startsWith("TypeError") || raw.startsWith("Error")) return `生图失败: ${raw.slice(0, 60)}`
  return raw
}

export async function generateImageFromPrompt(input: {
  prompt: string
  model?: string
  size?: string
  requestId?: string
  timeoutMs?: number
  sourceImage?: string | string[] // data URL(s) for image-to-image / reference image input
}) {
  const runtimeProvider = await getRuntimeProviderState()
  const requestedModel = input.model || "gpt-image-2"
  const taskContract = resolveRuntimeProviderTaskContract("image", runtimeProvider, requestedModel)
  if (!taskContract.supported) {
    throw new ImageGenerationError({
      message: taskContract.reason || "当前图片模型与 Provider 路由不兼容。",
      code: "UNSUPPORTED_PROVIDER_CAPABILITY",
      retryable: false,
      detail: `model=${requestedModel}, provider=${runtimeProvider.overrides?.providerId || runtimeProvider.usageProvider}`,
    })
  }
  const controller = new AbortController()
  const timeoutMs = input.timeoutMs ?? IMAGE_GENERATION_CLIENT_TIMEOUT_MS
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  let res: Response
  try {
    res = await fetch("/api/ai/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        prompt: input.prompt,
        model: requestedModel,
        size: input.size || "1792x1024",
        requestId: input.requestId,
        ...(runtimeProvider.overrides ? { _providerOverrides: runtimeProvider.overrides } : {}),
        ...(input.sourceImage ? { sourceImage: input.sourceImage } : {}),
      }),
    })
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw createTimeoutError()
    }
    throw new ImageGenerationError({
      message: "图片生成请求失败，请检查网络后重试。",
      code: "NETWORK_ERROR",
      retryable: true,
      detail: error?.message,
    })
  } finally {
    clearTimeout(timeout)
  }

  const payload = await readJsonSafely(res)
  if (!res.ok) {
    throw normalizeApiError(payload, res.status)
  }

  if (!payload?.imageUrl || typeof payload.imageUrl !== "string") {
    const error = payload?.error as string | ApiErrorPayload | undefined
    const message = typeof error === "object" && error
      ? error.userMessage || error.message || "图片生成服务没有返回可用图片，请重试。"
      : typeof error === "string"
        ? error
        : "图片生成服务没有返回可用图片，请重试。"

    throw new ImageGenerationError({
      message,
      code: typeof error === "object" && error ? error.code || "INVALID_RESPONSE" : "INVALID_RESPONSE",
      status: res.status,
      requestId: payload?.requestId,
      attempts: payload?.attempts,
      retryable: typeof error === "object" && error ? error.retryable ?? true : true,
      detail: typeof error === "object" && error ? error.detail : undefined,
    })
  }

  let displayUrl = payload.imageUrl
  let assetId: string | undefined

  if (payload.imageUrl.startsWith("data:image")) {
    const persisted = await persistImageDataUrl(payload.imageUrl, {
      fileName: `generated-${Date.now()}.png`,
    })
    displayUrl = persisted.objectUrl
    assetId = persisted.assetId
  }

  return {
    ...payload,
    imageUrl: displayUrl,
    assetId,
  }
}

// ============================================================================
// retryWithBackoff — 自动重试工具
// ============================================================================

export interface RetryOptions {
  /** 最大重试次数（不含首次调用），默认 2 */
  maxRetries?: number
  /** 基础退避时间（毫秒），默认 600 */
  baseDelayMs?: number
  /** 最大退避时间（毫秒），默认 5000 */
  maxDelayMs?: number
  /** 判断错误是否可重试 */
  shouldRetry?: (error: unknown, attempt: number) => boolean
  /** 每次重试前的回调 */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void
}

const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, "shouldRetry" | "onRetry">> = {
  maxRetries: 2,
  baseDelayMs: 600,
  maxDelayMs: 5000,
}

/**
 * 带指数退避重试的异步函数执行
 *
 * 退避策略：baseDelayMs × 2^attempt + random(0, 250ms)，上限 maxDelayMs
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { maxRetries, baseDelayMs, maxDelayMs } = { ...DEFAULT_RETRY_OPTIONS, ...options }
  const { shouldRetry, onRetry } = options

  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error: unknown) {
      lastError = error
      const isLastAttempt = attempt >= maxRetries

      if (isLastAttempt) break

      // Check if retryable
      if (shouldRetry && !shouldRetry(error, attempt)) break

      // For ImageGenerationError, check the retryable field
      if (error instanceof ImageGenerationError && !error.retryable) break

      const jitter = Math.floor(Math.random() * 250)
      const delayMs = Math.min(baseDelayMs * Math.pow(2, attempt) + jitter, maxDelayMs)

      onRetry?.(error, attempt, delayMs)

      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }

  throw lastError
}
