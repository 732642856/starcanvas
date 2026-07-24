import type { AiProviderOverrides } from "./provider-config"

export type ProviderSessionTaskType = "text" | "image" | "video"

type ProviderRouteHint = Pick<
  AiProviderOverrides,
  "providerId" | "baseUrl" | "defaultModel" | "imageModel" | "videoModel" | "timeoutMs"
>

export function hasExplicitProviderRouteHint(
  routeHint: ProviderRouteHint | null | undefined,
  apiBaseUrl?: string,
): boolean {
  if (apiBaseUrl?.trim()) return true
  if (!routeHint) return false
  return Boolean(
    routeHint.providerId?.trim() ||
    routeHint.baseUrl?.trim() ||
    routeHint.defaultModel?.trim() ||
    routeHint.imageModel?.trim() ||
    routeHint.videoModel?.trim() ||
    (typeof routeHint.timeoutMs === "number" && Number.isFinite(routeHint.timeoutMs) && routeHint.timeoutMs > 0),
  )
}

export function shouldApplySessionApiKeyForTask(params: {
  taskType: ProviderSessionTaskType
  sessionApiKey?: string
  routeHint?: ProviderRouteHint | null
  apiBaseUrl?: string
}): boolean {
  if (!params.sessionApiKey?.trim()) return false
  if (params.taskType === "video") return true
  return hasExplicitProviderRouteHint(params.routeHint, params.apiBaseUrl)
}
