import { ImageGenerationError } from "./imageGeneration.ts"

export function isUnknownImageResultError(error: unknown): boolean {
  return error instanceof ImageGenerationError && error.status === 524
}

export function buildUnknownImageResultMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : "图片请求未返回可确认结果。"
  return `结果未知：上游可能已接受本次图片任务。请先检查资产和账单；确认需要新图后再重新生成。${detail}`
}

export function shouldRetryProductionImageError(error: unknown, isAborted: boolean): boolean {
  if (isAborted) return false
  if (!(error instanceof ImageGenerationError)) return true
  if (isUnknownImageResultError(error)) return false
  return error.retryable
}
