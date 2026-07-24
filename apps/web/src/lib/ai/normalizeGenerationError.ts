// ============================================================================
// Image Generation Error Normalization
// Converts provider/network/raw HTML errors into user-safe structured errors.
// ============================================================================

export type GenerationErrorCode =
  | "PROVIDER_BAD_GATEWAY"
  | "REQUEST_TOO_LARGE"
  | "PROVIDER_TIMEOUT"
  | "INVALID_PROVIDER_RESPONSE"
  | "UNSUPPORTED_IMAGE_TO_IMAGE"
  | "UNKNOWN_ERROR"

export interface NormalizedGenerationError {
  code: GenerationErrorCode
  status?: number
  provider?: string
  userMessage: string
  detail: string
  retryable: boolean
  raw?: string
}

export interface NormalizeGenerationErrorInput {
  status?: number
  body?: unknown
  provider?: string
  error?: unknown
}

function stringifyBody(body: unknown): string {
  if (body === undefined || body === null) return ""
  if (typeof body === "string") return body
  try {
    return JSON.stringify(body)
  } catch {
    return String(body)
  }
}

function getErrorName(error: unknown): string {
  if (error && typeof error === "object" && "name" in error) {
    return String((error as { name?: unknown }).name || "")
  }
  return ""
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message || "")
  }
  return ""
}

function looksLikeHtml(value: string): boolean {
  const trimmed = value.trim().toLowerCase()
  return trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html") || /<body[\s>]/i.test(trimmed)
}

function stripHtmlForDetail(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240)
}

export function normalizeGenerationError(input: NormalizeGenerationErrorInput): NormalizedGenerationError {
  const status = input.status
  const provider = input.provider
  const bodyText = stringifyBody(input.body)
  const errorName = getErrorName(input.error)
  const errorMessage = getErrorMessage(input.error)
  const combined = [bodyText, errorName, errorMessage].filter(Boolean).join("\n")
  const lower = combined.toLowerCase()
  const raw = combined || undefined

  if (
    status === 413 ||
    lower.includes("413") ||
    lower.includes("payload too large") ||
    lower.includes("request entity too large") ||
    lower.includes("content too large")
  ) {
    return {
      code: "REQUEST_TOO_LARGE",
      status,
      provider,
      userMessage: "参考图或请求内容过大，请压缩后重试。",
      detail: "当前请求超过服务端可接受大小。",
      retryable: false,
      raw,
    }
  }

  if (
    status === 502 ||
    lower.includes("502: bad gateway") ||
    lower.includes("bad gateway")
  ) {
    return {
      code: "PROVIDER_BAD_GATEWAY",
      status,
      provider,
      userMessage: "图片生成服务暂时不可用，请稍后重试。",
      detail: "上游服务返回 502 Bad Gateway，可能是服务超时、参考图过大或当前图生图格式不被支持。",
      retryable: true,
      raw,
    }
  }

  if (
    status === 524 ||
    lower.includes("524") ||
    lower.includes("a timeout occurred")
  ) {
    return {
      code: "PROVIDER_TIMEOUT",
      status,
      provider,
      userMessage: "图片生成超时，请稍后重试。",
      detail: "上游服务返回 524 A Timeout Occurred，通常表示网关等待生成结果超时。",
      retryable: true,
      raw,
    }
  }

  if (
    errorName === "AbortError" ||
    lower.includes("aborterror") ||
    lower.includes("timeout") ||
    lower.includes("timed out")
  ) {
    return {
      code: "PROVIDER_TIMEOUT",
      status,
      provider,
      userMessage: "图片生成超时，请稍后重试。",
      detail: "上游服务响应时间过长，可能是服务繁忙或当前图片处理耗时过高。",
      retryable: true,
      raw,
    }
  }

  if (
    lower.includes("unsupported_image_to_image") ||
    lower.includes("does not support image-to-image") ||
    lower.includes("not support image-to-image")
  ) {
    return {
      code: "UNSUPPORTED_IMAGE_TO_IMAGE",
      status,
      provider,
      userMessage: "当前模型暂不支持基于参考图编辑。",
      detail: "请切换支持图生图的模型，或改为仅根据文字生成新图片。",
      retryable: false,
      raw,
    }
  }

  if (looksLikeHtml(bodyText)) {
    return {
      code: "INVALID_PROVIDER_RESPONSE",
      status,
      provider,
      userMessage: "图片生成服务返回了无法识别的响应。",
      detail: stripHtmlForDetail(bodyText) || "上游服务返回了 HTML 页面，而不是预期的 JSON 数据。",
      retryable: true,
      raw,
    }
  }

  if (lower.includes("unexpected token") || lower.includes("not valid json") || lower.includes("invalid json")) {
    return {
      code: "INVALID_PROVIDER_RESPONSE",
      status,
      provider,
      userMessage: "图片生成服务返回了无法识别的数据。",
      detail: "上游服务返回内容不是有效 JSON，可能是网关错误或服务临时异常。",
      retryable: true,
      raw,
    }
  }

  return {
    code: "UNKNOWN_ERROR",
    status,
    provider,
    userMessage: "图片生成失败，请稍后重试。",
    detail: errorMessage || (bodyText && !looksLikeHtml(bodyText) ? bodyText.slice(0, 240) : "发生未知错误。"),
    retryable: true,
    raw,
  }
}

export function formatGenerationErrorForDisplay(error: NormalizedGenerationError): string {
  return error.detail ? `${error.userMessage}\n${error.detail}` : error.userMessage
}
