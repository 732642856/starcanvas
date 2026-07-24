import type { KeyStorageMode } from "./user-settings"

export interface ProviderSetupIntent {
  shouldHandleLocally: boolean
  openSettings: boolean
  updates: {
    baseUrl?: string
    sessionApiKey?: string
    defaultModel?: string
    imageModel?: string
    videoModel?: string
    timeoutMs?: number
    keyStorageMode?: KeyStorageMode
  }
  redactedMessage: string
  detectedProviderLabel?: string
}

const SETTINGS_KEYWORDS = [
  "星轨画布",
  "模型设置",
  "中转站",
  "api key",
  "apikey",
  "base url",
  "接口地址",
  "模型里",
  "配置到",
  "设置到",
]

const RELAY_PROVIDER_HINTS = [
  { label: "OpenRouter", pattern: /openrouter/i, baseUrl: "https://openrouter.ai/api/v1" },
  { label: "硅基流动", pattern: /硅基流动|siliconflow/i, baseUrl: "https://api.siliconflow.cn/v1" },
  { label: "DeepSeek", pattern: /deepseek/i, baseUrl: "https://api.deepseek.com/v1" },
  { label: "阿里云百炼", pattern: /百炼|dashscope/i, baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
  { label: "火山方舟", pattern: /火山|ark|doubao/i, baseUrl: "https://ark.cn-beijing.volces.com/api/v3" },
  { label: "Moonshot", pattern: /moonshot|kimi/i, baseUrl: "https://api.moonshot.cn/v1" },
] as const

function normalizeWhitespace(input: string): string {
  return input.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim()
}

function includesSetupKeyword(input: string): boolean {
  const lower = input.toLowerCase()
  return SETTINGS_KEYWORDS.some((keyword) => lower.includes(keyword.toLowerCase()))
}

function hasExplicitSetupVerb(input: string): boolean {
  return /帮我|请你|替我|设置|配置|填到|填进|保存到|写入|更新到|接入|接到|open|打开/i.test(input)
}

function matchUrl(input: string): string | undefined {
  const url = input.match(/https?:\/\/[^\s"'，。；;）)]+/i)?.[0]
  return url?.replace(/[，。；;,]+$/, "")
}

function inferRelayProvider(input: string): { label: string; baseUrl: string } | undefined {
  return RELAY_PROVIDER_HINTS.find((item) => item.pattern.test(input))
}

function matchApiKey(input: string): string | undefined {
  const patterns = [
    /(?:api\s*key|apikey|令牌|token)\s*(?:是|为|[:：=])?\s*([A-Za-z0-9._-]{10,})/i,
    /\b(sk-[A-Za-z0-9_-]{12,})\b/,
  ]

  for (const pattern of patterns) {
    const value = input.match(pattern)?.[1]
    if (value) return value
  }

  return undefined
}

function matchModelValue(input: string, keywords: string[]): string | undefined {
  const pattern = new RegExp(
    `(?:${keywords.join("|")})\\s*(?:用|是|为|填|设置为|改成|[:：=])?\\s*[\"“”'\\\`]?([A-Za-z0-9._:/-]{2,})`,
    "i",
  )
  return input.match(pattern)?.[1]
}

function matchTimeoutMs(input: string): number | undefined {
  const ms = input.match(/(?:超时|timeout)\s*(?:是|为|[:：=])?\s*(\d{3,6})\s*ms/i)?.[1]
  if (ms) return Number(ms)

  const seconds = input.match(/(?:超时|timeout)\s*(?:是|为|[:：=])?\s*(\d{1,4})\s*秒/i)?.[1]
  if (seconds) return Number(seconds) * 1000

  return undefined
}

function redactSecret(input: string, secret?: string): string {
  if (!secret) return input
  if (!input.includes(secret)) return input
  const masked = `${secret.slice(0, 4)}…${secret.slice(-4)}`
  return input.replace(secret, masked)
}

export function parseProviderSetupIntent(input: string): ProviderSetupIntent {
  const normalized = normalizeWhitespace(input)
  const inferredProvider = inferRelayProvider(normalized)
  const baseUrl = matchUrl(normalized) || inferredProvider?.baseUrl
  const sessionApiKey = matchApiKey(normalized)
  const defaultModel =
    matchModelValue(normalized, ["文本模型", "聊天模型", "对话模型", "默认模型", "text model", "chat model", "default model"]) ||
    matchModelValue(normalized, ["模型"]) ||
    undefined
  const imageModel = matchModelValue(normalized, ["图片模型", "图像模型", "生图模型", "image model"])
  const videoModel = matchModelValue(normalized, ["视频模型", "video model"])
  const timeoutMs = matchTimeoutMs(normalized)
  const openSettings =
    /打开.*(?:设置|模型|中转站)|查看.*(?:设置|模型)|open.*settings/i.test(normalized) ||
    (includesSetupKeyword(normalized) && hasExplicitSetupVerb(normalized))
  const keyStorageMode: KeyStorageMode | undefined =
    /长期|保存|记住|下次|以后都用|本地保存|跨标签页/i.test(normalized) ? "local" : undefined

  const hasUpdates = Boolean(baseUrl || sessionApiKey || defaultModel || imageModel || videoModel || timeoutMs)
  const hasLocalIntent = hasExplicitSetupVerb(normalized)

  return {
    shouldHandleLocally: (hasUpdates && hasLocalIntent) || openSettings,
    openSettings,
    updates: {
      ...(baseUrl ? { baseUrl } : {}),
      ...(sessionApiKey ? { sessionApiKey } : {}),
      ...(defaultModel ? { defaultModel } : {}),
      ...(imageModel ? { imageModel } : {}),
      ...(videoModel ? { videoModel } : {}),
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      ...(keyStorageMode ? { keyStorageMode } : {}),
    },
    redactedMessage: redactSecret(normalized, sessionApiKey),
    detectedProviderLabel: inferredProvider?.label,
  }
}
