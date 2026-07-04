"use client"

import type { AiProviderOverrides } from "./provider-config"
import {
  clearLocalProviderOverrides,
  getLocalProviderOverrides,
  saveLocalProviderOverrides,
} from "./client"

export interface StoredModelOption {
  value: string
  label: string
  provider: string
  desc: string
  type: "text" | "image" | "video"
}

export type KeyStorageMode = "session" | "local"

export interface ProviderSettingsSnapshot {
  apiBaseUrl: string
  useMock: boolean
  allowAIAutoRun: boolean
  models: StoredModelOption[]
  sessionApiKey: string
  keyStorageMode: KeyStorageMode
  useLocalOverride: boolean
  defaultModel: string
  imageModel: string
  videoModel: string
  timeoutMs: string
}

export interface SaveProviderSettingsInput {
  apiBaseUrl: string
  useMock: boolean
  allowAIAutoRun: boolean
  models: StoredModelOption[]
  sessionApiKey: string
  keyStorageMode: KeyStorageMode
  useLocalOverride: boolean
  defaultModel: string
  imageModel: string
  videoModel: string
  timeoutMs: string
}

export interface ApplyProviderSetupInput {
  baseUrl?: string
  sessionApiKey?: string
  defaultModel?: string
  imageModel?: string
  videoModel?: string
  timeoutMs?: number
  keyStorageMode?: KeyStorageMode
  openSettings?: boolean
}

export interface ApplyProviderSetupResult {
  summary: string
  selectedModel?: string
}

const STORAGE_KEYS = {
  apiBaseUrl: "startrails_api_base_url",
  useMock: "startrails_use_mock",
  aiAutoRun: "startrails_ai_auto_run",
  models: "startrails_models",
  sessionApiKey: "startrails_session_api_key",
  localApiKey: "startrails_ui_api_key",
} as const

const DEFAULT_USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "true"

function trimValue(value: string | undefined): string {
  return value?.trim() ?? ""
}

function readStoredApiKey(): { sessionApiKey: string; keyStorageMode: KeyStorageMode } {
  if (typeof window === "undefined") {
    return { sessionApiKey: "", keyStorageMode: "session" }
  }

  const localKey = window.localStorage.getItem(STORAGE_KEYS.localApiKey) || ""
  if (localKey) {
    return { sessionApiKey: localKey, keyStorageMode: "local" }
  }

  const sessionKey = window.sessionStorage.getItem(STORAGE_KEYS.sessionApiKey) || ""
  return { sessionApiKey: sessionKey, keyStorageMode: "session" }
}

export function inferProviderLabelFromBaseUrl(baseUrl?: string): string {
  if (!baseUrl) return "custom"
  try {
    return new URL(baseUrl).hostname.replace(/^www\./, "") || "custom"
  } catch {
    return "custom"
  }
}

export function maskSecret(secret: string): string {
  if (!secret) return ""
  if (secret.length <= 8) return `${secret.slice(0, 1)}***${secret.slice(-1)}`
  return `${secret.slice(0, 4)}…${secret.slice(-4)}`
}

export function getStoredModelOptions(fallbackModels: StoredModelOption[] = []): StoredModelOption[] {
  if (typeof window === "undefined") return [...fallbackModels]

  try {
    const stored = window.localStorage.getItem(STORAGE_KEYS.models)
    const parsed = stored ? (JSON.parse(stored) as StoredModelOption[]) : []
    return mergeModelOptions(parsed, fallbackModels)
  } catch {
    return [...fallbackModels]
  }
}

export function readUseMockPreference(): boolean {
  if (typeof window === "undefined") {
    return DEFAULT_USE_MOCK
  }

  const storedMock = window.localStorage.getItem(STORAGE_KEYS.useMock)
  if (storedMock === null) {
    return DEFAULT_USE_MOCK
  }

  return storedMock === "true"
}

export function loadProviderSettings(fallbackModels: StoredModelOption[] = []): ProviderSettingsSnapshot {
  if (typeof window === "undefined") {
    return {
      apiBaseUrl: "",
      useMock: DEFAULT_USE_MOCK,
      allowAIAutoRun: false,
      models: [...fallbackModels],
      sessionApiKey: "",
      keyStorageMode: "session",
      useLocalOverride: false,
      defaultModel: "",
      imageModel: "",
      videoModel: "",
      timeoutMs: "120000",
    }
  }

  const overrides = getLocalProviderOverrides()
  const { sessionApiKey, keyStorageMode } = readStoredApiKey()
  const storedTimeout = overrides?.timeoutMs ? String(overrides.timeoutMs) : "120000"

  return {
    apiBaseUrl:
      trimValue(window.localStorage.getItem(STORAGE_KEYS.apiBaseUrl) || undefined) ||
      trimValue(overrides?.baseUrl),
    useMock: readUseMockPreference(),
    allowAIAutoRun: window.localStorage.getItem(STORAGE_KEYS.aiAutoRun) === "true",
    models: getStoredModelOptions(fallbackModels),
    sessionApiKey,
    keyStorageMode,
    useLocalOverride: Boolean(overrides),
    defaultModel: trimValue(overrides?.defaultModel),
    imageModel: trimValue(overrides?.imageModel),
    videoModel: trimValue(overrides?.videoModel),
    timeoutMs: trimValue(storedTimeout),
  }
}

export function saveProviderSettings(input: SaveProviderSettingsInput): void {
  if (typeof window === "undefined") return

  const apiBaseUrl = trimValue(input.apiBaseUrl)
  const defaultModel = trimValue(input.defaultModel)
  const imageModel = trimValue(input.imageModel)
  const videoModel = trimValue(input.videoModel)
  const sessionApiKey = trimValue(input.sessionApiKey)
  const timeoutMs = trimValue(input.timeoutMs)

  window.localStorage.setItem(STORAGE_KEYS.apiBaseUrl, apiBaseUrl)
  window.localStorage.removeItem("startrails_api_key")
  window.localStorage.setItem(STORAGE_KEYS.useMock, String(input.useMock))
  window.localStorage.setItem(STORAGE_KEYS.aiAutoRun, String(input.allowAIAutoRun))
  window.localStorage.setItem(STORAGE_KEYS.models, JSON.stringify(input.models))

  if (input.useLocalOverride) {
    const overrides: AiProviderOverrides = {
      baseUrl: apiBaseUrl || undefined,
      defaultModel: defaultModel || undefined,
      imageModel: imageModel || undefined,
      videoModel: videoModel || undefined,
      timeoutMs: timeoutMs ? Number(timeoutMs) : undefined,
    }
    saveLocalProviderOverrides(overrides)
  } else {
    clearLocalProviderOverrides()
  }

  window.sessionStorage.removeItem(STORAGE_KEYS.sessionApiKey)
  window.localStorage.removeItem(STORAGE_KEYS.localApiKey)
  if (sessionApiKey) {
    if (input.keyStorageMode === "local") {
      window.localStorage.setItem(STORAGE_KEYS.localApiKey, sessionApiKey)
    } else {
      window.sessionStorage.setItem(STORAGE_KEYS.sessionApiKey, sessionApiKey)
    }
  }

  window.dispatchEvent(new CustomEvent("startrails-models-updated"))
  window.dispatchEvent(
    new CustomEvent("startrails-settings-updated", {
      detail: { allowAIAutoRun: input.allowAIAutoRun, useMock: input.useMock },
    }),
  )
  window.dispatchEvent(new CustomEvent("startrails-provider-updated"))
}

export function openProviderSettings(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent("startrails-open-settings"))
}

export function mergeModelOptions(
  existingModels: StoredModelOption[],
  fallbackModels: StoredModelOption[],
): StoredModelOption[] {
  const merged: StoredModelOption[] = []
  const seen = new Set<string>()

  for (const model of [...existingModels, ...fallbackModels]) {
    if (!model?.value || !model?.type) continue
    const key = `${model.type}:${model.value}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push({
      value: model.value,
      label: model.label || model.value,
      provider: model.provider || "custom",
      desc: model.desc || "",
      type: model.type,
    })
  }

  return merged
}

function buildModelEntries(input: {
  baseUrl?: string
  defaultModel?: string
  imageModel?: string
  videoModel?: string
}): StoredModelOption[] {
  const provider = inferProviderLabelFromBaseUrl(input.baseUrl)
  const entries: StoredModelOption[] = []

  if (input.defaultModel) {
    entries.push({
      value: input.defaultModel,
      label: input.defaultModel,
      provider,
      desc: "聊天 / 文案 / 分镜文本",
      type: "text",
    })
  }

  if (input.imageModel) {
    entries.push({
      value: input.imageModel,
      label: input.imageModel,
      provider,
      desc: "图片生成模型",
      type: "image",
    })
  }

  if (input.videoModel) {
    entries.push({
      value: input.videoModel,
      label: input.videoModel,
      provider,
      desc: "视频生成模型",
      type: "video",
    })
  }

  return entries
}

export function applyProviderSetup(
  input: ApplyProviderSetupInput,
  fallbackModels: StoredModelOption[] = [],
): ApplyProviderSetupResult {
  const current = loadProviderSettings(fallbackModels)
  const nextBaseUrl = trimValue(input.baseUrl) || current.apiBaseUrl
  const nextDefaultModel = trimValue(input.defaultModel) || current.defaultModel
  const nextImageModel = trimValue(input.imageModel) || current.imageModel
  const nextVideoModel = trimValue(input.videoModel) || current.videoModel
  const nextSessionApiKey =
    input.sessionApiKey !== undefined ? trimValue(input.sessionApiKey) : current.sessionApiKey
  const nextTimeoutMs =
    input.timeoutMs !== undefined ? String(input.timeoutMs) : trimValue(current.timeoutMs || "120000")
  const hasLocalOverrideFields = Boolean(
    trimValue(input.baseUrl) ||
      trimValue(input.defaultModel) ||
      trimValue(input.imageModel) ||
      trimValue(input.videoModel) ||
      input.timeoutMs !== undefined,
  )
  const nextUseLocalOverride = hasLocalOverrideFields || current.useLocalOverride
  const nextModels = mergeModelOptions(
    current.models,
    buildModelEntries({
      baseUrl: nextBaseUrl,
      defaultModel: nextDefaultModel,
      imageModel: nextImageModel,
      videoModel: nextVideoModel,
    }),
  )

  saveProviderSettings({
    apiBaseUrl: nextBaseUrl,
    useMock: current.useMock,
    allowAIAutoRun: current.allowAIAutoRun,
    models: nextModels,
    sessionApiKey: nextSessionApiKey,
    keyStorageMode: input.keyStorageMode || current.keyStorageMode,
    useLocalOverride: nextUseLocalOverride,
    defaultModel: nextDefaultModel,
    imageModel: nextImageModel,
    videoModel: nextVideoModel,
    timeoutMs: nextTimeoutMs,
  })

  if (input.openSettings) {
    openProviderSettings()
  }

  const summaryLines = ["已帮你更新星轨画布的模型设置："]
  if (trimValue(input.baseUrl)) summaryLines.push(`- 中转站地址：${nextBaseUrl}`)
  if (input.sessionApiKey !== undefined) {
    const modeLabel = (input.keyStorageMode || current.keyStorageMode) === "local"
      ? "已保存在本机浏览器"
      : "已保存在当前标签页"
    summaryLines.push(`- API Key：${maskSecret(nextSessionApiKey)}（${modeLabel}）`)
  }
  if (trimValue(input.defaultModel)) summaryLines.push(`- 文本模型：${nextDefaultModel}`)
  if (trimValue(input.imageModel)) summaryLines.push(`- 图片模型：${nextImageModel}`)
  if (trimValue(input.videoModel)) summaryLines.push(`- 视频模型：${nextVideoModel}`)
  if (input.timeoutMs !== undefined) summaryLines.push(`- 超时时间：${input.timeoutMs} ms`)
  if (input.openSettings) summaryLines.push("- 已为你打开设置面板，方便继续检查或微调。")

  return {
    summary: summaryLines.join("\n"),
    selectedModel: trimValue(input.defaultModel) || undefined,
  }
}
