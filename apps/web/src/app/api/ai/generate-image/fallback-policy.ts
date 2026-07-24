export type ImageGenerationMode = "draft" | "final"

export const DEFAULT_IMAGE_FALLBACK_MODELS = ["gpt-image-1.5", "gpt-image-1-mini"]

export function resolveImageGenerationMode(value: unknown): ImageGenerationMode {
  return value === "final" ? "final" : "draft"
}

export function resolveImageQuality(mode: ImageGenerationMode, requested: unknown): "low" | "medium" | "high" | "auto" {
  if (requested === "low" || requested === "medium" || requested === "high" || requested === "auto") {
    return requested
  }
  return mode === "draft" ? "low" : "auto"
}

export function resolveImageFallbackModels(primaryModel: string, configured: unknown): string[] {
  const candidates = Array.isArray(configured)
    ? configured
    : typeof configured === "string"
      ? configured.split(",")
      : DEFAULT_IMAGE_FALLBACK_MODELS

  const seen = new Set([primaryModel])
  return candidates
    .map((model) => typeof model === "string" ? model.trim() : "")
    .filter((model) => {
      if (!model || seen.has(model)) return false
      seen.add(model)
      return true
    })
}

export function shouldFallbackImageModel(status: number | undefined): boolean {
  return status === 524 || status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504
}
