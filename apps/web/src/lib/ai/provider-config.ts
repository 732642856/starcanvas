// ============================================================================
// AI Provider Configuration — 向后兼容层
// ============================================================================
// 此文件现在委托给 provider-registry.ts 的 Multi-Provider Registry。
// 保留所有旧 API 签名以确保现有代码无需修改即可运行。
// 新代码应直接使用 provider-registry.ts 中的 API。
// ============================================================================

export {
  // Backward-compatible API (delegated)
  getAiProviderConfig,
  getAiProviderConfigSafe,
  mergeProviderConfig,
  hasLocalOverrides,
  // Multi-Provider API (preferred)
  getProvider,
  getProviderSafe,
  listProviders,
  findProviderByCapability,
  getProviderRegistry,
  resetProviderRegistry,
  isImageModel,
  isVideoModel,
  isAudioModel,
  isChatModel,
} from "./provider-registry.ts"

export type {
  AiProviderType,
  AiProviderConfig,
  AiProviderOverrides,
  // Multi-Provider types (preferred)
  ProviderEntry,
  ProviderEntrySafe,
  ProviderCapability,
  ProviderMode,
} from "./provider-registry"
