// ============================================================================
// Multi-Provider Registry (P0-1 BYOK / Provider 配置中心)
// ============================================================================
// 统一管理所有 AI Provider 的凭据、模型列表和能力声明。
// 支持三种模式:
//   server-env  — 服务端 .env 配置（自部署/团队部署）
//   relay       — 自建中转站模式（用户 Key 放在自己的 proxy 里）
//   session-key — 临时会话 Key（仅本地单机，内存存储，不持久化）
//
// API Key 安全约束：
//   - 前端不持久化裸 Key（localStorage 不存 Key）
//   - API route 不回传 Key（getSafeConfig 移除 apiKey）
//   - 日志不打印 Key
//   - payload sanitizer 丢弃 apiKey
// ============================================================================

// ============================================================================
// Types — 参考 ai-short-drama model-config-contract.ts (Apache 2.0)
//         和 moyin-creator api-config-store.ts (AGPL, 仅架构参考)
// ============================================================================

/** Provider 能力声明 */
export type ProviderCapability = "text" | "image" | "video" | "audio" | "embedding"

/** Provider 凭据模式 */
export type ProviderMode = "server-env" | "relay" | "session-key"

/** 单个 Provider 的完整配置 */
export interface ProviderEntry {
  /** 唯一标识，例如 "default" / "openai" / "ideogram" / "vidu" */
  id: string
  /** 显示名称 */
  name: string
  /** Provider 类型（向后兼容旧代码） */
  type: "openai-compatible"
  /** OpenAI 兼容的 Base URL（去除尾部斜杠） */
  baseUrl: string
  /** API Key（服务端专用，绝不暴露给前端） */
  apiKey: string
  /** 凭据模式 */
  mode: ProviderMode
  /** 该 Provider 支持的能力 */
  capabilities: ProviderCapability[]
  /** 默认文本模型 */
  defaultModel: string
  /** 默认图片模型 */
  defaultImageModel: string
  /** 视频模型 */
  videoModel?: string
  /** 已知的图片模型列表（用于运行时判断 isImageModel） */
  imageModels: Set<string>
  /** 已知的视频模型列表 */
  videoModels: Set<string>
  /** 已知的音频模型列表 */
  audioModels: Set<string>
  /** 请求超时（毫秒） */
  timeoutMs: number
  /** 是否启用 */
  enabled: boolean
}

/** 可暴露给前端的配置（不含 API Key） */
export type ProviderEntrySafe = Omit<ProviderEntry, "apiKey"> & {
  hasApiKey: boolean
}

/** 前端可通过请求体传入的局部覆盖（P2-5B） */
export interface AiProviderOverrides {
  /** 指定 Provider ID */
  providerId?: string
  baseUrl?: string
  defaultModel?: string
  imageModel?: string
  videoModel?: string
  timeoutMs?: number
  /** 会话级 API Key（仅内存，不持久化；优先级高于服务端 .env） */
  sessionApiKey?: string
  /** 请求级 Mock 开关（覆盖环境变量 NEXT_PUBLIC_USE_MOCK） */
  useMock?: boolean
}

// ============================================================================
// Environment Variable Parser
// ============================================================================

/**
 * 从环境变量扫描所有已配置的 Provider。
 *
 * 命名规则：
 *   新格式（多 Provider）：
 *     AI_PROVIDER_<ID>_NAME        — 显示名称
 *     AI_PROVIDER_<ID>_BASE_URL    — Base URL
 *     AI_PROVIDER_<ID>_API_KEY     — API Key
 *     AI_PROVIDER_<ID>_DEFAULT_MODEL
 *     AI_PROVIDER_<ID>_IMAGE_MODELS  — 逗号分隔的模型名列表
 *     AI_PROVIDER_<ID>_VIDEO_MODELS  — 逗号分隔
 *     AI_PROVIDER_<ID>_AUDIO_MODELS  — 逗号分隔
 *     AI_PROVIDER_<ID>_IMAGE_MODEL   — 默认图片模型
 *     AI_PROVIDER_<ID>_VIDEO_MODEL   — 默认视频模型
 *     AI_PROVIDER_<ID>_TIMEOUT_MS    — 超时
 *     AI_PROVIDER_<ID>_CAPABILITIES  — 逗号分隔能力: text,image,video,audio
 *
 *   旧格式（向后兼容）：
 *     AI_BASE_URL / AI_API_KEY → 自动创建 id="default" 的 Provider
 */
function scanProviderEnvVars(): ProviderEntry[] {
  const providers: ProviderEntry[] = []
  const seen = new Set<string>()

  // 1. 扫描新格式: AI_PROVIDER_<ID>_BASE_URL
  for (const key of Object.keys(process.env)) {
    const match = key.match(/^AI_PROVIDER_([A-Z0-9_]+)_BASE_URL$/)
    if (!match) continue

    const rawId = match[1].toLowerCase().replace(/_+/g, "-")
    if (seen.has(rawId)) continue
    seen.add(rawId)

    const prefix = match[1] // 保持原始大小写用于 getenv
    const name = process.env[`AI_PROVIDER_${prefix}_NAME`] || rawId
    const baseUrl = (process.env[`AI_PROVIDER_${prefix}_BASE_URL`] || "").replace(/\/+$/, "")
    const apiKey = process.env[`AI_PROVIDER_${prefix}_API_KEY`] || ""
    const defaultModel = process.env[`AI_PROVIDER_${prefix}_DEFAULT_MODEL`] || ""
    const defaultImageModel = process.env[`AI_PROVIDER_${prefix}_IMAGE_MODEL`] || undefined
    const videoModel = process.env[`AI_PROVIDER_${prefix}_VIDEO_MODEL`] || undefined
    const timeoutMs = Number(process.env[`AI_PROVIDER_${prefix}_TIMEOUT_MS`] || 120000)
    const capabilitiesRaw = process.env[`AI_PROVIDER_${prefix}_CAPABILITIES`] || "text"
    const capabilities = capabilitiesRaw.split(",").map(s => s.trim()) as ProviderCapability[]

    const imageModels = new Set(
      (process.env[`AI_PROVIDER_${prefix}_IMAGE_MODELS`] || "")
        .split(",").map(s => s.trim()).filter(Boolean)
    )
    const videoModels = new Set(
      (process.env[`AI_PROVIDER_${prefix}_VIDEO_MODELS`] || "")
        .split(",").map(s => s.trim()).filter(Boolean)
    )
    const audioModels = new Set(
      (process.env[`AI_PROVIDER_${prefix}_AUDIO_MODELS`] || "")
        .split(",").map(s => s.trim()).filter(Boolean)
    )

    if (!baseUrl) continue // 无效配置，跳过

    providers.push({
      id: rawId,
      name,
      type: "openai-compatible" as const,
      baseUrl,
      apiKey,
      mode: apiKey ? "server-env" : "relay",
      capabilities,
      defaultModel: defaultModel || "gpt-5.5",
      defaultImageModel: defaultImageModel || defaultModel || "gpt-5.5",
      videoModel,
      imageModels,
      videoModels,
      audioModels,
      timeoutMs,
      enabled: true,
    })
  }

  // 2. 向后兼容：旧格式 AI_BASE_URL / AI_API_KEY
  const oldBaseUrl = process.env.AI_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL
  if (oldBaseUrl && !seen.has("default")) {
    const defaultModel = process.env.AI_DEFAULT_MODEL || "gpt-5.5"
    const defaultImageModel = process.env.AI_DEFAULT_IMAGE_MODEL || undefined
    const videoModel = process.env.AI_VIDEO_MODEL || undefined
    const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || ""
    const timeoutMs = Number(process.env.AI_REQUEST_TIMEOUT_MS || 120000)

    const imageModels = new Set<string>()
    if (defaultImageModel) imageModels.add(defaultImageModel)
    // 通过旧格式的额外 env 补充图片模型列表
    const extraImageModels = (process.env.AI_IMAGE_MODELS || "").split(",").map(s => s.trim()).filter(Boolean)
    extraImageModels.forEach(m => imageModels.add(m))

    const videoModels = new Set<string>()
    if (videoModel) videoModels.add(videoModel)
    const extraVideoModels = (process.env.AI_VIDEO_MODELS || "").split(",").map(s => s.trim()).filter(Boolean)
    extraVideoModels.forEach(m => videoModels.add(m))

    providers.push({
      id: "default",
      name: "默认中转站",
      type: "openai-compatible" as const,
      baseUrl: oldBaseUrl.replace(/\/+$/, ""),
      apiKey,
      mode: apiKey ? "server-env" : "relay",
      capabilities: ["text", "image", "video", "audio"],
      defaultModel,
      defaultImageModel: defaultImageModel || defaultModel,
      videoModel,
      imageModels,
      videoModels,
      audioModels: new Set(),
      timeoutMs,
      enabled: true,
    })
  }

  // 3. 旧格式专用 Provider: IDEOGRAM, DASHSCOPE 等
  // Ideogram
  if (process.env.IDEOGRAM_API_KEY && !seen.has("ideogram")) {
    providers.push({
      id: "ideogram",
      name: "Ideogram",
      type: "openai-compatible" as const,
      baseUrl: "https://api.ideogram.ai/v1",
      apiKey: process.env.IDEOGRAM_API_KEY,
      mode: "server-env",
      capabilities: ["image"],
      defaultModel: "ideogram-v4",
      defaultImageModel: "ideogram-v4",
      imageModels: new Set(["ideogram-v4", "ideogram-v3", "ideogram-v4-turbo"]),
      videoModels: new Set(),
      audioModels: new Set(),
      timeoutMs: 120000,
      enabled: true,
    })
    seen.add("ideogram")
  }

  // DASHSCOPE / 阿里云百炼 (Vidu)
  if (process.env.DASHSCOPE_API_KEY && !seen.has("dashscope")) {
    providers.push({
      id: "dashscope",
      name: "阿里云百炼 (DashScope)",
      type: "openai-compatible" as const,
      baseUrl: "https://dashscope.aliyuncs.com/api/v1",
      apiKey: process.env.DASHSCOPE_API_KEY,
      mode: "server-env",
      capabilities: ["video", "image", "text"],
      defaultModel: "qwen-plus",
      defaultImageModel: "wan2.1-t2i",
      videoModel: "viduq3-turbo",
      imageModels: new Set(["wan2.1-t2i", "wan2.1-i2i"]),
      videoModels: new Set([
        "viduq3-turbo",
        "viduq3-pro",
        "viduq3-pro-fast",
        "viduq3",
        "viduq3-mix",
        "viduq2",
        "viduq2-pro",
        "viduq2-pro-fast",
        "viduq2-turbo",
        "viduq1",
        "viduq1-classic",
        "vidu2.0",
      ]),
      audioModels: new Set(),
      timeoutMs: 300000,
      enabled: true,
    })
    seen.add("dashscope")
  }

  // Kling
  if (process.env.KLING_API_KEY && !seen.has("kling")) {
    providers.push({
      id: "kling",
      name: "Kling AI",
      type: "openai-compatible" as const,
      baseUrl: "https://api.klingai.com/v1",
      apiKey: process.env.KLING_API_KEY,
      mode: "server-env",
      capabilities: ["video", "image"],
      defaultModel: "kling-v1",
      defaultImageModel: "kling-v1",
      videoModel: "kling-v1",
      imageModels: new Set(["kling-v1"]),
      videoModels: new Set(["kling-v1", "kling-v1-5"]),
      audioModels: new Set(),
      timeoutMs: 300000,
      enabled: true,
    })
    seen.add("kling")
  }

  // Seedance
  if (process.env.SEEDANCE_API_KEY && !seen.has("seedance")) {
    providers.push({
      id: "seedance",
      name: "Seedance",
      type: "openai-compatible" as const,
      baseUrl: "https://api.seedance.com/v1",
      apiKey: process.env.SEEDANCE_API_KEY,
      mode: "server-env",
      capabilities: ["video"],
      defaultModel: "seedance-v1",
      defaultImageModel: "seedance-v1",
      videoModel: "seedance-v1",
      imageModels: new Set(),
      videoModels: new Set(["seedance-v1"]),
      audioModels: new Set(),
      timeoutMs: 300000,
      enabled: true,
    })
    seen.add("seedance")
  }

  return providers
}

// ============================================================================
// Provider Registry (单例)
// ============================================================================

let _registry: Map<string, ProviderEntry> | null = null

export function getProviderRegistry(): Map<string, ProviderEntry> {
  if (!_registry) {
    const entries = scanProviderEnvVars()
    _registry = new Map(entries.map(e => [e.id, e]))
  }
  return _registry
}

/** 重置缓存（测试专用） */
export function resetProviderRegistry(): void {
  _registry = null
}

// ============================================================================
// Query API
// ============================================================================

/**
 * 获取指定 Provider 的完整配置（含 API Key，服务端专用）。
 * 不指定 providerId 时返回第一个已启用的 Provider。
 */
export function getProvider(providerId?: string): ProviderEntry {
  const registry = getProviderRegistry()

  if (providerId) {
    const provider = registry.get(providerId)
    if (!provider) {
      throw new Error(
        `Provider "${providerId}" not found. ` +
        `Available: [${[...registry.keys()].join(", ")}]. ` +
        `Set AI_PROVIDER_${providerId.toUpperCase()}_BASE_URL in .env.local.`,
      )
    }
    return provider
  }

  // 默认：返回 "default"，否则取第一个
  const fallback = registry.get("default") || registry.values().next().value
  if (!fallback) {
    throw new Error(
      "No AI Provider configured. Set AI_PROVIDER_DEFAULT_BASE_URL " +
      "or AI_BASE_URL in .env.local.",
    )
  }
  return fallback
}

/** 返回可暴露给前端的配置（不含 API Key） */
export function getProviderSafe(providerId?: string): ProviderEntrySafe {
  const { apiKey, ...rest } = getProvider(providerId)
  return { ...rest, hasApiKey: Boolean(apiKey) }
}

/** 列出所有已配置的 Provider（不含 API Key） */
export function listProviders(): ProviderEntrySafe[] {
  return [...getProviderRegistry().values()].map(({ apiKey, ...rest }) => ({
    ...rest,
    hasApiKey: Boolean(apiKey),
  }))
}

/** 检查模型是否为图片模型 */
export function isImageModel(model: string, providerId?: string): boolean {
  const provider = getProvider(providerId)
  return provider.imageModels.has(model)
}

/** 检查模型是否为视频模型 */
export function isVideoModel(model: string, providerId?: string): boolean {
  const provider = getProvider(providerId)
  return provider.videoModels.has(model)
}

/** 检查模型是否为音频模型 */
export function isAudioModel(model: string, providerId?: string): boolean {
  const provider = getProvider(providerId)
  return provider.audioModels.has(model)
}

/** 检查模型是否为文本/对话模型（非图片、非视频、非音频） */
export function isChatModel(model: string, providerId?: string): boolean {
  return !isImageModel(model, providerId) &&
         !isVideoModel(model, providerId) &&
         !isAudioModel(model, providerId)
}

// ============================================================================
// Local Override 合并 (兼容旧 API)
// ============================================================================

// SSRF Protection — block internal/private network addresses
const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "169.254.169.254", "metadata.google.internal"])
const BLOCKED_CIDR_PREFIXES = ["10.", "172.16.", "172.17.", "172.18.", "172.19.", "172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25.", "172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31.", "192.168."]

function validateBaseUrl(url: string): void {
  try {
    const host = new URL(url).hostname
    if (BLOCKED_HOSTS.has(host)) {
      throw new Error(`SSRF protection: Base URL points to blocked host: ${host}`)
    }
    if (BLOCKED_CIDR_PREFIXES.some(prefix => host.startsWith(prefix))) {
      throw new Error(`SSRF protection: Base URL points to private network: ${host}`)
    }
  } catch (e) {
    if (e instanceof TypeError) return // invalid URL, will fail naturally
    throw e
  }
}

/**
 * 合并服务端 Provider 配置与请求传入的非敏感局部覆盖。
 * sessionApiKey 优先级高于服务端 .env apiKey。
 */
export function mergeProviderConfig(
  overrides?: AiProviderOverrides,
): ProviderEntry {
  // 尝试获取 Provider，如果未配置则使用空值
  let provider: ProviderEntry | null = null
  try {
    provider = getProvider(overrides?.providerId)
  } catch {
    // .env 未配置时继续合并 overrides
  }

  const baseUrl = provider
    ? (overrides?.baseUrl || provider.baseUrl).replace(/\/+$/, "")
    : (overrides?.baseUrl || "").replace(/\/+$/, "")
  const defaultModel = overrides?.defaultModel || provider?.defaultModel || ""
  const defaultImageModel = overrides?.imageModel || provider?.defaultImageModel || provider?.defaultModel || defaultModel
  const videoModel = overrides?.videoModel || provider?.videoModel
  const timeoutMs = overrides?.timeoutMs || provider?.timeoutMs || 120000
  // sessionApiKey 优先于服务端 .env 的 apiKey
  const apiKey = overrides?.sessionApiKey || provider?.apiKey || ""

  validateBaseUrl(baseUrl)

  // 向后兼容：没有 API Key 时必须报错
  if (!baseUrl || !apiKey || !defaultModel) {
    if (!provider && !overrides?.baseUrl && !overrides?.defaultModel) {
      throw new Error(
        "No server .env config and no overrides provided. " +
        "Set AI_BASE_URL / AI_API_KEY / AI_DEFAULT_MODEL in .env.local, " +
        "or provide a sessionApiKey.",
      )
    }
    throw new Error(
      "Missing required config. " +
      "Provide AI_BASE_URL / AI_API_KEY / AI_DEFAULT_MODEL in .env.local. " +
      "Local Override can only change non-secret fields such as Base URL, model, and timeout.",
    )
  }

  validateBaseUrl(baseUrl)

  return {
    id: provider?.id || "default",
    name: provider?.name || "默认中转站",
    type: "openai-compatible" as const,
    baseUrl,
    apiKey,
    mode: provider?.mode || "server-env",
    capabilities: provider?.capabilities || ["text"],
    defaultModel,
    defaultImageModel,
    videoModel,
    imageModels: provider?.imageModels || new Set(),
    videoModels: provider?.videoModels || new Set(),
    audioModels: provider?.audioModels || new Set(),
    timeoutMs,
    enabled: true,
  }
}

/**
 * 检测请求是否携带了非敏感局部覆盖。
 */
export function hasLocalOverrides(overrides?: AiProviderOverrides): boolean {
  if (!overrides) return false
  return Boolean(
    overrides.providerId ||
    overrides.baseUrl ||
    overrides.defaultModel ||
    overrides.imageModel ||
    overrides.videoModel ||
    overrides.timeoutMs,
  )
}

// ============================================================================
// 向后兼容：保持旧 API 签名
// ============================================================================
// 让现有代码无需改动即可运行（Provider ID 自动转为 "default"）

export type AiProviderType = "openai-compatible"

export interface AiProviderConfig {
  type: AiProviderType
  baseUrl: string
  apiKey: string
  defaultModel: string
  defaultImageModel: string
  videoModel?: string
  timeoutMs: number
}

function toLegacyConfig(provider: ProviderEntry): AiProviderConfig {
  return {
    type: "openai-compatible",
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    defaultModel: provider.defaultModel,
    defaultImageModel: provider.defaultImageModel || provider.defaultModel,
    videoModel: provider.videoModel,
    timeoutMs: provider.timeoutMs,
  }
}

export function getAiProviderConfig(): AiProviderConfig {
  return toLegacyConfig(getProvider())
}

export function getAiProviderConfigSafe(): Omit<AiProviderConfig, "apiKey"> & {
  hasApiKey: boolean
} {
  const config = toLegacyConfig(getProvider())
  const { apiKey, ...safe } = config
  return { ...safe, hasApiKey: Boolean(apiKey) }
}

/**
 * 按能力查找 Provider。例如查找支持 "video" 的 Provider。
 * 返回第一个匹配的。
 */
export function findProviderByCapability(
  capability: ProviderCapability,
  preferId?: string,
): ProviderEntry {
  const registry = getProviderRegistry()
  if (preferId && registry.get(preferId)?.capabilities.includes(capability)) {
    return registry.get(preferId)!
  }
  for (const [, p] of registry) {
    if (p.capabilities.includes(capability)) return p
  }
  throw new Error(`No provider with "${capability}" capability configured.`)
}
