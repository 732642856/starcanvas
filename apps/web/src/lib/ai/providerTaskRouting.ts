import type { RuntimeProviderState } from "./client.ts"
import type { ProviderCapability } from "./provider-registry.ts"
import { cleanModel } from "./model-resolve.ts"
import {
  resolveViduModel,
  type ViduRouteMode,
} from "../../app/api/ai/generate-video-vidu/vidu-model.ts"

export type ProviderTaskType = "text" | "image" | "video"
export type ProviderTaskRouteFamily = "openai-chat" | "openai-image" | "vidu" | "unknown"

export interface ProviderTaskContractInput {
  taskType: ProviderTaskType
  providerId?: string
  providerLabel?: string
  providerType?: "openai-compatible"
  providerCapabilities?: ProviderCapability[]
  requestedModel?: string
}

export interface ProviderTaskContract {
  taskType: ProviderTaskType
  providerId?: string
  requestedModel?: string
  resolvedModel?: string
  routeFamily: ProviderTaskRouteFamily
  supported: boolean
  reason?: string
}
export function resolveRuntimeProviderTaskContract(
  taskType: ProviderTaskType,
  runtimeProvider: Pick<RuntimeProviderState, "usageProvider" | "overrides">,
  requestedModel?: string,
): ProviderTaskContract {
  return resolveProviderTaskContract({
    taskType,
    providerId: runtimeProvider.overrides?.providerId || runtimeProvider.usageProvider,
    requestedModel,
  })
}

function normalizeProviderId(value: string | undefined): string {
  return value?.trim().toLowerCase() || "default"
}

function normalizeCapabilities(value: ProviderCapability[] | undefined): Set<ProviderCapability> {
  return new Set(value || [])
}

function isViduLikeModel(model: string | undefined): boolean {
  const normalized = cleanModel(model)?.toLowerCase()
  return Boolean(normalized && /(^vidu($|[-/]))|viduq\d|^happyhorse-/i.test(normalized))
}

function isDashScopeProvider(providerId: string, providerLabel?: string): boolean {
  return providerId === "dashscope" || /dashscope|百炼/i.test(providerLabel || "")
}

function resolveViduAlias(model: string | undefined): string | undefined {
  const normalized = cleanModel(model)
  if (!normalized) return undefined
  const mode: ViduRouteMode = "t2v"
  return resolveViduModel(normalized, mode)
}

export function resolveTaskModelAlias(
  taskType: ProviderTaskType,
  model: string | undefined,
): string | undefined {
  const normalized = cleanModel(model)
  if (!normalized) return undefined
  if (taskType === "video" && isViduLikeModel(normalized)) {
    return resolveViduAlias(normalized)
  }
  return normalized
}

export function resolveProviderTaskContract(
  input: ProviderTaskContractInput,
): ProviderTaskContract {
  const providerId = normalizeProviderId(input.providerId)
  const capabilities = normalizeCapabilities(input.providerCapabilities)
  const hasDeclaredCapabilities = capabilities.size > 0
  const requestedModel = cleanModel(input.requestedModel)
  const resolvedModel = resolveTaskModelAlias(input.taskType, requestedModel)

  if (input.taskType !== "video" && isViduLikeModel(requestedModel)) {
    return {
      taskType: input.taskType,
      providerId,
      requestedModel,
      resolvedModel,
      routeFamily: "vidu",
      supported: false,
      reason: `Vidu 模型不支持 ${input.taskType} 任务；当前只支持 DashScope / 百炼视频专用路由。`,
    }
  }

  if (hasDeclaredCapabilities && !capabilities.has(input.taskType)) {
    return {
      taskType: input.taskType,
      providerId,
      requestedModel,
      resolvedModel,
      routeFamily: "unknown",
      supported: false,
      reason: `Provider 未声明 ${input.taskType} 能力。`,
    }
  }

  if (input.taskType === "video" && isViduLikeModel(requestedModel)) {
    const supported = isDashScopeProvider(providerId, input.providerLabel)
    return {
      taskType: input.taskType,
      providerId,
      requestedModel,
      resolvedModel,
      routeFamily: "vidu",
      supported,
      reason: supported ? undefined : "Vidu 视频模型当前只支持 DashScope / 百炼专用路由。",
    }
  }

  if (input.taskType === "image") {
    return {
      taskType: input.taskType,
      providerId,
      requestedModel,
      resolvedModel,
      routeFamily: "openai-image",
      supported: true,
    }
  }

  return {
    taskType: input.taskType,
    providerId,
    requestedModel,
    resolvedModel,
    routeFamily: input.taskType === "text" ? "openai-chat" : "unknown",
    supported: true,
  }
}

export function isTaskSupportedByContract(
  taskType: ProviderTaskType,
  contract: ProviderTaskContract | null | undefined,
): boolean {
  return Boolean(contract && contract.taskType === taskType && contract.supported)
}
