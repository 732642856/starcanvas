/**
 * SettingsPanel - 用户可配置 API 和模型 (P2-5B enhanced)
 * 支持服务端 .env 模式（推荐）和本地覆盖模式（仅适合自用）
 */
"use client"

import { useState, useEffect, useMemo, type ChangeEvent, type FocusEvent } from "react"
import { createPortal } from "react-dom"
import { X, Save, Plus, Trash2, BarChart3, Wifi, Loader2, CheckCircle2, AlertCircle, Server, Monitor } from "lucide-react"
import { DESIGN_TOKENS, ICON_CONFIG } from "../../styles/designSystem"
import type { ModelOption } from "../chat/ChatInput"
import { useAIUsageStore } from "../../features/canvas/usage/useAIUsageStore"
import {
  clearLocalProviderOverrides,
  checkAiHealth,
  checkProviderSmoke,
  runProviderSmoke,
} from "../../../../lib/ai/client"
import type { AiHealthResponse } from "../../../../lib/ai/client"
import type {
  ProviderRealSmokeTarget,
  ProviderSmokeReport,
} from "../../../../lib/ai/providerSmoke"
import { getProviderRealSmokeConfirmationText } from "../../../../lib/ai/providerSmoke"
import {
  summarizeProviderSmokeResult,
  type ProviderSmokeRunResultLike,
} from "../../../../lib/ai/providerSmokeResult"
import {
  buildProviderHealthSummary,
  type ProviderHealthProvider,
  type ProviderHealthStatus,
} from "../../../../lib/ai/provider-health-summary"
import {
  buildTaskReadinessSummary,
  getTaskReadinessPrimaryFixHint,
} from "../../../../lib/ai/taskReadiness"
import {
  loadProviderSettings,
  saveProviderSettings,
} from "../../../../lib/ai/user-settings"

// ── Token Aliases ──────────────────────────────────────
const T = DESIGN_TOKENS

interface SettingsPanelProps {
  isOpen: boolean
  onClose: () => void
  onImportProviderSmokeArtifact?: (payload: {
    target: ProviderRealSmokeTarget
    artifact: NonNullable<ProviderSmokeRunResultLike["artifact"]>
    result: RealSmokeDisplayResult
  }) => void | Promise<void>
}

type SettingsServerConfig = AiHealthResponse["config"] & {
  providers?: ProviderHealthProvider[]
}

interface RealSmokeConfirmationState {
  target: ProviderRealSmokeTarget
  title: string
  description: string
  confirmLabel: string
  requiredText: string | null
}

interface RealSmokeDisplayResult extends ProviderSmokeRunResultLike {
  summaryTitle: string
  hints: string[]
}

const HEALTH_STATUS_STYLE: Record<ProviderHealthStatus, { color: string; backgroundColor: string; borderColor: string; label: string }> = {
  ready: {
    color: "#86efac",
    backgroundColor: "rgba(16,185,129,0.08)",
    borderColor: "rgba(16,185,129,0.30)",
    label: "可用",
  },
  warning: {
    color: "#fbbf24",
    backgroundColor: "rgba(245,158,11,0.08)",
    borderColor: "rgba(245,158,11,0.30)",
    label: "注意",
  },
  blocked: {
    color: "#fca5a5",
    backgroundColor: "rgba(239,68,68,0.08)",
    borderColor: "rgba(239,68,68,0.32)",
    label: "阻塞",
  },
}

function summarizeFixHint(reason: string | undefined): string | null {
  return reason?.trim() || null
}

export function SettingsPanel({ isOpen, onClose, onImportProviderSmokeArtifact }: SettingsPanelProps) {
  // ── Existing state ──────────────────────────────────
  const [apiBaseUrl, setApiBaseUrl] = useState("")
  const [useMock, setUseMock] = useState(false) // P0: default off, useEffect corrects per env
  const [models, setModels] = useState<ModelOption[]>([])
  const [allowAIAutoRun, setAllowAIAutoRun] = useState(false)
  const [newModel, setNewModel] = useState<{ value: string; label: string; provider: string; desc: string; type: "text" | "image" | "video" }>({
    value: "",
    label: "",
    provider: "",
    desc: "",
    type: "text",
  })

  // ── P0: Session-only API Key (内存存储, 不持久化) ──
  const [sessionApiKey, setSessionApiKey] = useState("")
  const [showSessionKey, setShowSessionKey] = useState(false)
  /** Key 存储模式: "session"=标签页关闭丢 | "local"=刷新不丢 */
  const [keyStorageMode, setKeyStorageMode] = useState<"session" | "local">("session")

  // ── P2-5B: Provider override state ──────────────────
  const [defaultModel, setDefaultModel] = useState("")
  const [imageModel, setImageModel] = useState("")
  const [videoModel, setVideoModel] = useState("")
  const [timeoutMs, setTimeoutMs] = useState("120000")
  const [useLocalOverride, setUseLocalOverride] = useState(false)

  // ── P2-5B: Test connection state ────────────────────
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle")
  const [testMessage, setTestMessage] = useState("")
  const [serverConfig, setServerConfig] = useState<SettingsServerConfig | null>(null)
  const [providerSmoke, setProviderSmoke] = useState<ProviderSmokeReport | null>(null)
  const [providerSmokeStatus, setProviderSmokeStatus] = useState<"idle" | "checking" | "done" | "fail">("idle")
  const [providerSmokeMessage, setProviderSmokeMessage] = useState("")
  const [runningRealSmokeTarget, setRunningRealSmokeTarget] = useState<ProviderRealSmokeTarget | null>(null)
  const [importingRealSmokeTarget, setImportingRealSmokeTarget] = useState<ProviderRealSmokeTarget | null>(null)
  const [realSmokeResults, setRealSmokeResults] = useState<Record<string, RealSmokeDisplayResult>>({})
  const [pendingRealSmokeConfirmation, setPendingRealSmokeConfirmation] = useState<RealSmokeConfirmationState | null>(null)
  const [realSmokeConfirmationInput, setRealSmokeConfirmationInput] = useState("")

  // AI Usage stats — use cached `stats` for React 19 ref stability
  const usageStats = useAIUsageStore((s) => s.stats)
  const usageRecords = useAIUsageStore((s) => s.usageRecords)
  const providerHealthSummary = useMemo(
    () =>
      buildProviderHealthSummary({
        serverConfig: serverConfig
          ? {
              ...serverConfig,
              baseUrl: useLocalOverride && apiBaseUrl ? apiBaseUrl : serverConfig.baseUrl,
              hasApiKey: Boolean(serverConfig.hasApiKey || sessionApiKey.trim()),
            }
          : null,
        sessionApiKey,
        useLocalOverride,
        useMock,
        defaultModel,
        imageModel,
        videoModel,
        timeoutMs,
        providers: serverConfig?.providers ?? [],
        voiceCloneBaseUrl: process.env.NEXT_PUBLIC_VOICE_CLONE_BASE_URL,
        voxcpmBaseUrlConfigured: Boolean(process.env.NEXT_PUBLIC_VOXCPM_URL),
      }),
    [
      apiBaseUrl,
      defaultModel,
      imageModel,
      serverConfig,
      sessionApiKey,
      timeoutMs,
      useLocalOverride,
      useMock,
      videoModel,
    ],
  )

  const taskReadinessSummary = useMemo(
    () => buildTaskReadinessSummary({
      providerHealthSummary,
      providerSmokeReport: providerSmoke,
    }),
    [providerHealthSummary, providerSmoke],
  )

  // ── Load from localStorage ──────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const defaults: ModelOption[] = [
        { value: "gpt-5.5", label: "GPT-5.5（文本）", provider: "default", desc: "默认对话模型", type: "text" as const },
        { value: "gpt-image-2", label: "GPT-Image-2（图片）", provider: "default", desc: "默认生图模型", type: "image" as const },
        { value: "vidu", label: "Vidu（视频）", provider: "dashscope", desc: "阿里云百炼视频生成", type: "video" as const },
        { value: "kling-v1", label: "Kling V1（视频）", provider: "kling", desc: "Kling AI 视频生成", type: "video" as const },
      ]
      const settings = loadProviderSettings(defaults)
      setApiBaseUrl(settings.apiBaseUrl)
      setUseMock(settings.useMock)
      setAllowAIAutoRun(settings.allowAIAutoRun)
      setModels(settings.models)
      setSessionApiKey(settings.sessionApiKey)
      setKeyStorageMode(settings.keyStorageMode)
      setUseLocalOverride(settings.useLocalOverride)
      setDefaultModel(settings.defaultModel)
      setImageModel(settings.imageModel)
      setVideoModel(settings.videoModel)
      setTimeoutMs(settings.timeoutMs)
    } catch { /* ignore */ }
  }, [isOpen])

  // ── Load server config on open ──────────────────────
  useEffect(() => {
    if (!isOpen) return
    const loadConfig = async () => {
      try {
        const res = await fetch("/api/ai/config")
        if (res.ok) {
          const data = await res.json()
          setServerConfig(data)
          // Pre-fill from server if no local override
          if (!useLocalOverride) {
            if (data.defaultModel) setDefaultModel(data.defaultModel)
            if (data.defaultImageModel) setImageModel(data.defaultImageModel)
            if (data.videoModel) setVideoModel(data.videoModel)
            if (data.timeoutMs) setTimeoutMs(String(data.timeoutMs))
          }
        }
      } catch { /* server unavailable */ }
    }
    loadConfig()
  }, [isOpen])

  // ── Test Connection (P2-5B fix) ────────────────────
  const handleTestConnection = async () => {
    setTestStatus("testing")
    setTestMessage("")
    try {
      // P2-5B fix: Local Override 模式下传入覆盖配置
      const overrides = useLocalOverride
        ? {
            baseUrl: apiBaseUrl || undefined,
            defaultModel: defaultModel || undefined,
            imageModel: imageModel || undefined,
            videoModel: videoModel || undefined,
            timeoutMs: timeoutMs ? Number(timeoutMs) : undefined,
            sessionApiKey: sessionApiKey || undefined,
          }
        : undefined
      const result = await checkAiHealth(overrides)
      setTestStatus(result.ok ? "ok" : "fail")
      setTestMessage(result.message)
    } catch (err: any) {
      setTestStatus("fail")
      setTestMessage(err.message || "Connection test failed")
    }
  }

  const handleCheckProviderSmoke = async () => {
    setProviderSmokeStatus("checking")
    setProviderSmokeMessage("")
    try {
      const overrides = useLocalOverride
        ? {
            baseUrl: apiBaseUrl || undefined,
            defaultModel: defaultModel || undefined,
            imageModel: imageModel || undefined,
            videoModel: videoModel || undefined,
            timeoutMs: timeoutMs ? Number(timeoutMs) : undefined,
            sessionApiKey: sessionApiKey || undefined,
          }
        : sessionApiKey
          ? { sessionApiKey }
          : undefined

      const report = await checkProviderSmoke(overrides)
      setProviderSmoke(report)
      setProviderSmokeStatus("done")
      setProviderSmokeMessage("这份报告只做就绪度预检，不会真实消耗图片 / 视频 / TTS 额度。")
    } catch (err: any) {
      setProviderSmokeStatus("fail")
      setProviderSmokeMessage(err.message || "Provider smoke 检查失败")
    }
  }

  const executeRealSmoke = async (
    target: ProviderRealSmokeTarget,
    confirmationText?: string,
  ) => {
    setRunningRealSmokeTarget(target)
    try {
      const overrides = useLocalOverride
        ? {
            baseUrl: apiBaseUrl || undefined,
            defaultModel: defaultModel || undefined,
            imageModel: imageModel || undefined,
            videoModel: videoModel || undefined,
            timeoutMs: timeoutMs ? Number(timeoutMs) : undefined,
            sessionApiKey: sessionApiKey || undefined,
          }
        : sessionApiKey
          ? { sessionApiKey }
          : undefined

      const result = await runProviderSmoke(target, {
        confirmCost: true,
        confirmationText,
        waitForResult: target === "video",
        overrides,
      })
      const summary = summarizeProviderSmokeResult(result)

      setRealSmokeResults((prev) => ({
        ...prev,
        [target]: {
          status: result.status,
          message: result.message,
          details: result.details,
          artifact: result.artifact,
          summaryTitle: summary.title,
          hints: summary.hints,
        },
      }))
    } finally {
      setRunningRealSmokeTarget(null)
    }
  }

  const buildRealSmokeConfirmationState = (
    target: ProviderRealSmokeTarget,
  ): RealSmokeConfirmationState => {
    const requiredText = getProviderRealSmokeConfirmationText(target)
    switch (target) {
      case "image":
        return {
          target,
          title: "确认真实生图 smoke",
          description: "这会发起一次单张最小规格真实生图请求，可能消耗图片额度。请输入指定短语后继续。",
          confirmLabel: "确认试跑",
          requiredText,
        }
      case "video":
        return {
          target,
          title: "确认真实生视频 smoke",
          description: "这会发起一次最小时长真实 Vidu 视频请求，并等待最终视频结果返回，可能消耗视频额度。请输入指定短语后继续。",
          confirmLabel: "确认试跑",
          requiredText,
        }
      case "tts-server":
        return {
          target,
          title: "确认服务端 TTS smoke",
          description: "这会发起一次真实服务端 TTS 请求，可能消耗少量服务资源。",
          confirmLabel: "继续试跑",
          requiredText: null,
        }
      case "text":
      default:
        return {
          target,
          title: "确认真实文本 smoke",
          description: "这会发起一次最小真实文本请求，可能消耗极少量 token。",
          confirmLabel: "继续试跑",
          requiredText: null,
        }
    }
  }

  const handleRunRealSmoke = (target: ProviderRealSmokeTarget) => {
    setRealSmokeConfirmationInput("")
    setPendingRealSmokeConfirmation(buildRealSmokeConfirmationState(target))
  }

  const handleCancelRealSmokeConfirmation = () => {
    if (runningRealSmokeTarget) return
    setPendingRealSmokeConfirmation(null)
    setRealSmokeConfirmationInput("")
  }

  const handleConfirmRealSmoke = async () => {
    if (!pendingRealSmokeConfirmation) return
    const confirmationText = pendingRealSmokeConfirmation.requiredText
      ? realSmokeConfirmationInput.trim()
      : undefined
    if (
      pendingRealSmokeConfirmation.requiredText
      && confirmationText !== pendingRealSmokeConfirmation.requiredText
    ) {
      return
    }

    const target = pendingRealSmokeConfirmation.target
    setPendingRealSmokeConfirmation(null)
    setRealSmokeConfirmationInput("")
    await executeRealSmoke(target, confirmationText)
  }

  const handleImportRealSmokeArtifact = async (target: ProviderRealSmokeTarget) => {
    const result = realSmokeResults[target]
    if (!result?.artifact || !onImportProviderSmokeArtifact) return

    setImportingRealSmokeTarget(target)
    try {
      await onImportProviderSmokeArtifact({
        target,
        artifact: result.artifact,
        result,
      })
    } finally {
      setImportingRealSmokeTarget(null)
    }
  }

  // ── Save ────────────────────────────────────────────
  const handleSave = () => {
    if (typeof window === "undefined") return
    saveProviderSettings({
      apiBaseUrl,
      useMock,
      allowAIAutoRun,
      models,
      sessionApiKey,
      keyStorageMode,
      useLocalOverride,
      defaultModel,
      imageModel,
      videoModel,
      timeoutMs,
    })

    onClose()
  }

  // ── Model management ────────────────────────────────
  const handleAddModel = () => {
    if (!newModel.value || !newModel.label) return
    setModels(prev => [...prev, { ...newModel }])
    setNewModel({ value: "", label: "", provider: "", desc: "", type: "text" })
  }

  const handleRemoveModel = (index: number) => {
    setModels(prev => prev.filter((_, i) => i !== index))
  }

  // ── Toggle local override ───────────────────────────
  const handleToggleLocalOverride = (enabled: boolean) => {
    setUseLocalOverride(enabled)
    if (!enabled) {
      // Reset to server config
      if (serverConfig) {
        setDefaultModel(serverConfig.defaultModel)
        setImageModel(serverConfig.defaultImageModel || "")
        setVideoModel(serverConfig.videoModel || "")
        setTimeoutMs(String(serverConfig.timeoutMs))
      }
      clearLocalProviderOverrides()
    }
  }

  if (!isOpen) return null
  if (typeof document === "undefined") return null

  // ── Style helpers ────────────────────────────────────
  const inputClass = "w-full rounded-lg border bg-black/40 px-3 py-1.5 text-sm text-white outline-none"
  const handleDialogInputFocus = (e: FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = T.accent
  }
  const handleDialogInputBlur = (e: FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = T.border
  }
  const labelStyle = { color: T.textMuted, fontSize: "11px", display: "block", marginBottom: "2px" } as const
  const realSmokeConfirmationMatches = pendingRealSmokeConfirmation?.requiredText
    ? realSmokeConfirmationInput.trim() === pendingRealSmokeConfirmation.requiredText
    : true

  return createPortal(
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        {/* Backdrop */}
        <div
          className="absolute inset-0"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
          onClick={onClose}
        />

        {/* Panel */}
        <div
          className="relative z-10 w-[480px] max-h-[85vh] overflow-y-auto rounded-2xl border p-6"
          style={{ backgroundColor: T.panelSolid, borderColor: T.border }}
        >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium" style={{ color: T.text }}>设置</h3>
          <button onClick={onClose} className="rounded-lg p-1 transition-colors hover:bg-white/10">
            <X size={16} strokeWidth={ICON_CONFIG.strokeWidth} style={{ color: T.textMuted }} />
          </button>
        </div>

        {/* ── Provider 模式（BYOK 三层模式） ──────────── */}
        <div className="mb-5">
          <h4 className="mb-2 text-xs font-medium" style={{ color: T.textSecondary }}>模型平台模式（BYOK）</h4>
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => handleToggleLocalOverride(false)}
              className="flex-1 flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs transition-colors"
              style={{
                borderColor: !useLocalOverride ? T.accent : T.border,
                backgroundColor: !useLocalOverride ? T.accentSoft : "transparent",
                color: !useLocalOverride ? T.text : T.textMuted,
              }}
            >
              <Server size={14} strokeWidth={1.5} />
              <div className="text-left">
                <div className="font-medium">服务端 .env</div>
                <div className="text-[10px] opacity-60">自部署/团队部署</div>
              </div>
            </button>
            <button
              onClick={() => handleToggleLocalOverride(true)}
              className="flex-1 flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs transition-colors"
              style={{
                borderColor: useLocalOverride ? T.accent : T.border,
                backgroundColor: useLocalOverride ? T.accentSoft : "transparent",
                color: useLocalOverride ? T.text : T.textMuted,
              }}
            >
              <Monitor size={14} strokeWidth={1.5} />
              <div className="text-left">
                <div className="font-medium">自建中转站</div>
                <div className="text-[10px] opacity-60">Key 放自己的 proxy</div>
              </div>
            </button>
          </div>

          {/* Local override warning */}
          {useLocalOverride && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 mb-3">
              <div className="flex items-start gap-1.5">
                <AlertCircle size={13} strokeWidth={1.5} style={{ color: "#f59e0b", marginTop: 1, flexShrink: 0 }} />
                <p className="text-[10px] leading-relaxed" style={{ color: "#fbbf24" }}>
                  在此模式下可自定义 Base URL 和模型。API Key 优先使用上方会话 Key，未填写时使用服务端 .env 配置。
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── 中转站配置 ────────────────────────────────── */}
        <div className="mb-5">
          <h4 className="mb-2 text-xs font-medium" style={{ color: T.textSecondary }}>中转站地址 & 模型</h4>
          <div className="mb-3 rounded-lg border px-3 py-2 text-[11px] leading-5" style={{ borderColor: T.border, backgroundColor: "rgba(255,255,255,0.03)", color: T.textSecondary }}>
            不确定怎么填时，可以直接去右侧对话里说：
            <div style={{ color: T.text, marginTop: 4 }}>
              帮我把 OpenRouter 的 key xxx 配到星轨画布，文本模型用 openai/gpt-4.1-mini，图片模型用 flux-dev
            </div>
          </div>
          <div className="space-y-2">
            {/* Base URL */}
            <div>
              <label style={labelStyle}>API Base URL（你的中转站地址）</label>
              <input
                type="text"
                value={apiBaseUrl}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setApiBaseUrl(e.target.value)}
                placeholder={serverConfig?.baseUrl || "https://your-relay.example.com/v1"}
                className={inputClass}
                style={{ borderColor: T.border }}
                onFocus={(e) => (e.target.style.borderColor = T.accent)}
                onBlur={(e) => (e.target.style.borderColor = T.border)}
              />
            </div>

            {/* API Key input — session-only (memory, no localStorage) */}
            <div>
              <label style={labelStyle}>
                API Key（会话模式 · 仅内存保存）
              </label>
              <div className="flex items-center gap-2">
                <input
                  type={showSessionKey ? "text" : "password"}
                  value={sessionApiKey}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setSessionApiKey(e.target.value)}
                  placeholder={serverConfig?.hasApiKey ? "留空使用服务端 Key · 填了覆盖" : "粘贴你的中转站 Key"}
                  className={inputClass}
                  style={{ borderColor: T.border }}
                  onFocus={(e) => (e.target.style.borderColor = T.accent)}
                  onBlur={(e) => (e.target.style.borderColor = T.border)}
                />
                <button
                  onClick={() => setShowSessionKey(!showSessionKey)}
                  className="rounded-lg p-1.5 transition-colors hover:bg-white/10"
                  style={{ color: T.textMuted }}
                  title={showSessionKey ? "隐藏 Key" : "显示 Key"}
                >
                  {showSessionKey ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>
              {sessionApiKey && (
                <div className="mt-2 space-y-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                  <p className="text-[10px] font-medium" style={{ color: "#fbbf24" }}>Key 保存方式</p>
                  <label className="flex items-start gap-2 text-[10px] cursor-pointer" style={{ color: "#fcd34d" }}>
                    <input type="radio" name="keyStorage" checked={keyStorageMode === "session"}
                      onChange={() => setKeyStorageMode("session")} className="mt-0.5" />
                    <div>标签页内记住（刷新不丢，关标签页清除）<span className="ml-1 opacity-60">— 推荐</span></div>
                  </label>
                  <label className="flex items-start gap-2 text-[10px] cursor-pointer" style={{ color: "#f59e0b" }}>
                    <input type="radio" name="keyStorage" checked={keyStorageMode === "local"}
                      onChange={() => setKeyStorageMode("local")} className="mt-0.5" />
                    <div>跨标签页记住（关浏览器也不丢）<br />
                      <span style={{ opacity: 0.7 }}>⚠ 存储在浏览器本地，他人使用此设备可能查看到</span></div>
                  </label>
                </div>
              )}
            </div>

            {/* API Key server status */}
            <div>
              <label style={labelStyle}>服务端 Key 状态</label>
              <div
                className="rounded-lg border px-3 py-2 text-xs"
                style={{
                  borderColor: serverConfig?.hasApiKey ? "rgba(16,185,129,0.35)" : T.border,
                  backgroundColor: serverConfig?.hasApiKey ? "rgba(16,185,129,0.08)" : "rgba(255,255,255,0.04)",
                  color: serverConfig?.hasApiKey ? "#86efac" : T.textMuted,
                }}
              >
                {serverConfig?.hasApiKey
                  ? "服务端 .env 已配置 API Key。"
                  : "服务端未配置 Key。需在上方填写会话 Key 或配置 .env。"}
              </div>
            </div>

            {/* Default Text Model */}
            <div>
              <label style={labelStyle}>文本模型（聊天 / 写脚本 / 分镜文案）</label>
              <input
                type="text"
                value={defaultModel}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setDefaultModel(e.target.value)}
                placeholder={serverConfig?.defaultModel || "如 gpt-4o"}
                className={inputClass}
                style={{ borderColor: T.border }}
                onFocus={(e) => (e.target.style.borderColor = T.accent)}
                onBlur={(e) => (e.target.style.borderColor = T.border)}
              />
            </div>

            {/* Image Model */}
            <div>
              <label style={labelStyle}>图片模型（文生图 / 图生图）</label>
              <input
                type="text"
                value={imageModel}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setImageModel(e.target.value)}
                placeholder={serverConfig?.defaultImageModel || "如 gpt-image-2"}
                className={inputClass}
                style={{ borderColor: T.border }}
                onFocus={(e) => (e.target.style.borderColor = T.accent)}
                onBlur={(e) => (e.target.style.borderColor = T.border)}
              />
            </div>

            {/* Video Model */}
            <div>
              <label style={labelStyle}>视频模型（图生视频 / 文生视频）</label>
              <input
                type="text"
                value={videoModel}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setVideoModel(e.target.value)}
                placeholder={serverConfig?.videoModel || "如 kling-v1 / vidu / cogvideox-v1"}
                className={inputClass}
                style={{ borderColor: T.border }}
                onFocus={(e) => (e.target.style.borderColor = T.accent)}
                onBlur={(e) => (e.target.style.borderColor = T.border)}
              />
            </div>

            {/* Timeout */}
            <div>
              <label style={labelStyle}>超时时间（毫秒）</label>
              <input
                type="number"
                value={timeoutMs}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setTimeoutMs(e.target.value)}
                placeholder="120000"
                min="5000"
                max="600000"
                step="1000"
                className={inputClass}
                style={{ borderColor: T.border }}
                onFocus={(e) => (e.target.style.borderColor = T.accent)}
                onBlur={(e) => (e.target.style.borderColor = T.border)}
              />
            </div>

            {/* Use Mock */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={useMock}
                onChange={(e) => setUseMock(e.target.checked)}
                id="use-mock"
                className="rounded"
              />
              <label htmlFor="use-mock" className="text-[11px]" style={{ color: T.textMuted }}>
                调试模式（仅用于本地演示，不调用真实 API）
              </label>
            </div>

            {/* AI 安全 */}
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={allowAIAutoRun}
                onChange={(e) => setAllowAIAutoRun(e.target.checked)}
                id="allow-ai-auto-run"
                className="mt-0.5 rounded"
              />
              <div className="flex flex-col gap-0.5">
                <label htmlFor="allow-ai-auto-run" className="text-[11px]" style={{ color: T.textMuted }}>
                  允许 AI 自动执行（批量生图/生视频等）
                </label>
                <p className="text-[10px]" style={{ color: T.textMuted, opacity: 0.6 }}>
                  关闭则需要每次手动确认，更安全；开启后 AI 可直接调用模型产生费用
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── P2-5B: Test Connection ──────────────────── */}
        <div className="mb-5">
          <h4 className="mb-2 text-xs font-medium" style={{ color: T.textSecondary }}>连接测试</h4>
          <div className="flex items-center gap-2">
            <button
              onClick={handleTestConnection}
              disabled={testStatus === "testing"}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors hover:bg-white/10 disabled:opacity-50"
              style={{ borderColor: T.border, color: T.textSecondary }}
            >
              {testStatus === "testing"
                ? <Loader2 size={13} strokeWidth={1.5} className="animate-spin" />
                : <Wifi size={13} strokeWidth={1.5} />
              }
              测试连接
            </button>
            {testStatus === "ok" && (
              <span className="flex items-center gap-1 text-[11px]" style={{ color: "#10b981" }}>
                <CheckCircle2 size={12} strokeWidth={1.5} /> 已连接
              </span>
            )}
            {testStatus === "fail" && (
              <span className="flex items-center gap-1 text-[11px]" style={{ color: "#ef4444" }}>
                <AlertCircle size={12} strokeWidth={1.5} /> 连接失败
              </span>
            )}
          </div>
          {testMessage && (
            <p className="mt-1.5 text-[10px]" style={{ color: testStatus === "ok" ? "#10b981" : "#ef4444" }}>
              {testMessage}
            </p>
          )}
        </div>

        <div className="mb-5">
          <h4 className="mb-2 text-xs font-medium" style={{ color: T.textSecondary }}>生产能力预检</h4>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCheckProviderSmoke}
              disabled={providerSmokeStatus === "checking"}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors hover:bg-white/10 disabled:opacity-50"
              style={{ borderColor: T.border, color: T.textSecondary }}
            >
              {providerSmokeStatus === "checking"
                ? <Loader2 size={13} strokeWidth={1.5} className="animate-spin" />
                : <Server size={13} strokeWidth={1.5} />
              }
              检查生产能力
            </button>
            <span className="text-[10px]" style={{ color: T.textMuted }}>
              不消耗额度，只告诉你 text / image / video / TTS 哪里还没配好
            </span>
          </div>
          {providerSmokeMessage && (
            <p
              className="mt-1.5 text-[10px]"
              style={{ color: providerSmokeStatus === "fail" ? "#ef4444" : T.textMuted }}
            >
              {providerSmokeMessage}
            </p>
          )}
          {providerSmoke && (
            <div className="mt-3 space-y-2">
              {providerSmoke.items.map((item) => {
                const statusColor =
                  item.status === "ready" ? "#10b981" : item.status === "warning" ? "#f59e0b" : "#ef4444"
                return (
                  <div
                    key={item.target}
                    data-testid={`provider-smoke-item-${item.target}`}
                    className="rounded-xl border p-3"
                    style={{ borderColor: T.border, backgroundColor: "rgba(255,255,255,0.03)" }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-medium" style={{ color: T.text }}>
                          {item.label}
                        </div>
                        <div className="mt-0.5 text-[10px]" style={{ color: T.textMuted }}>
                          {item.summary}
                        </div>
                      </div>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style={{ backgroundColor: `${statusColor}22`, color: statusColor }}
                      >
                        {item.status === "ready" ? "就绪" : item.status === "warning" ? "警告" : "阻塞"}
                      </span>
                    </div>
                    <ul className="mt-2 space-y-1 text-[10px]" style={{ color: T.textMuted }}>
                      {item.details.map((detail, index) => (
                        <li key={index}>- {detail}</li>
                      ))}
                      {item.realSmokeSupported && (
                        <li>
                          - 真实 smoke {item.realSmokeRequiresConsent ? "需要用户显式授权" : "可直接执行"}
                          {item.mayConsumeQuota ? "，且可能消耗额度。" : "。"}
                        </li>
                      )}
                    </ul>
                    {item.realSmokeSupported && (
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleRunRealSmoke(item.target as ProviderRealSmokeTarget)}
                          disabled={runningRealSmokeTarget === item.target}
                          data-testid={`provider-smoke-run-${item.target}`}
                          className="rounded-lg border px-2.5 py-1 text-[10px] transition-colors hover:bg-white/10 disabled:opacity-50"
                          style={{ borderColor: T.border, color: T.textSecondary }}
                        >
                          {runningRealSmokeTarget === item.target ? "试跑中…" : "真实试跑"}
                        </button>
                        {realSmokeResults[item.target] && (
                          <div
                            className="flex-1 rounded-lg border px-2.5 py-2"
                            data-testid={`provider-smoke-result-${item.target}`}
                            style={{
                              borderColor:
                                realSmokeResults[item.target]?.status === "passed"
                                  ? "rgba(16,185,129,0.28)"
                                  : realSmokeResults[item.target]?.status === "blocked"
                                    ? "rgba(245,158,11,0.28)"
                                    : "rgba(239,68,68,0.28)",
                              backgroundColor:
                                realSmokeResults[item.target]?.status === "passed"
                                  ? "rgba(16,185,129,0.08)"
                                  : realSmokeResults[item.target]?.status === "blocked"
                                    ? "rgba(245,158,11,0.08)"
                                    : "rgba(239,68,68,0.08)",
                            }}
                          >
                            <div
                              className="text-[10px] font-medium"
                              style={{
                                color:
                                  realSmokeResults[item.target]?.status === "passed"
                                    ? "#86efac"
                                    : realSmokeResults[item.target]?.status === "blocked"
                                      ? "#fcd34d"
                                      : "#fca5a5",
                              }}
                            >
                              {realSmokeResults[item.target]?.summaryTitle}
                            </div>
                            <div className="mt-1 text-[10px]" style={{ color: T.textMuted }}>
                              {realSmokeResults[item.target]?.message}
                            </div>
                            {realSmokeResults[item.target]?.hints?.length ? (
                              <ul className="mt-1.5 space-y-1 text-[10px]" style={{ color: T.textMuted }}>
                                {realSmokeResults[item.target]?.hints.map((hint, index) => (
                                  <li key={index}>- {hint}</li>
                                ))}
                              </ul>
                            ) : null}
                            {realSmokeResults[item.target]?.details?.length ? (
                              <div className="mt-1.5 text-[10px]" style={{ color: T.textMuted, opacity: 0.78 }}>
                                细节：{realSmokeResults[item.target]?.details?.join(" / ")}
                              </div>
                            ) : null}
                            {realSmokeResults[item.target]?.artifact?.type === "image" ? (
                              <div className="mt-2">
                                <img
                                  src={realSmokeResults[item.target]?.artifact?.url}
                                  alt="provider smoke preview"
                                  data-testid={`provider-smoke-artifact-${item.target}`}
                                  className="max-h-28 rounded-lg border object-cover"
                                  style={{ borderColor: T.border }}
                                />
                              </div>
                            ) : null}
                            {realSmokeResults[item.target]?.artifact?.type === "video" ? (
                              <div className="mt-2 text-[10px]" style={{ color: T.textMuted }}>
                                最终结果：
                                {" "}
                                <a
                                  href={realSmokeResults[item.target]?.artifact?.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  data-testid={`provider-smoke-artifact-${item.target}`}
                                  style={{ color: "#93c5fd" }}
                                >
                                  {realSmokeResults[item.target]?.artifact?.url}
                                </a>
                              </div>
                            ) : null}
                            {realSmokeResults[item.target]?.status === "passed"
                              && realSmokeResults[item.target]?.artifact
                              && onImportProviderSmokeArtifact ? (
                                <div className="mt-2 flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleImportRealSmokeArtifact(item.target as ProviderRealSmokeTarget)}
                                    disabled={importingRealSmokeTarget === item.target}
                                    data-testid={`provider-smoke-import-${item.target}`}
                                    className="rounded-lg border px-2.5 py-1 text-[10px] transition-colors hover:bg-white/10 disabled:opacity-50"
                                    style={{ borderColor: T.border, color: T.textSecondary }}
                                  >
                                    {importingRealSmokeTarget === item.target ? "导入中…" : "导入到画布与资产库"}
                                  </button>
                                </div>
                              ) : null}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Provider Health Summary ─────────────────── */}
        <div className="mb-5" data-testid="provider-health-summary">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-xs font-medium" style={{ color: T.textSecondary }}>运行前健康摘要</h4>
            <span className="text-[10px]" style={{ color: providerHealthSummary.blockingCount > 0 ? "#fca5a5" : T.textMuted }}>
              {providerHealthSummary.blockingCount > 0
                ? `${providerHealthSummary.blockingCount} 项阻塞`
                : providerHealthSummary.warningCount > 0
                  ? `${providerHealthSummary.warningCount} 项注意`
                  : "全部可用"}
            </span>
          </div>
          <div className="space-y-1.5">
            {providerHealthSummary.items.map((item) => {
              const statusStyle = HEALTH_STATUS_STYLE[item.status]
              return (
                <div
                  key={item.id}
                  className="rounded-lg border px-3 py-2"
                  style={{
                    borderColor: statusStyle.borderColor,
                    backgroundColor: statusStyle.backgroundColor,
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium" style={{ color: T.text }}>
                      {item.label}
                    </span>
                    <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ color: statusStyle.color, backgroundColor: "rgba(0,0,0,0.18)" }}>
                      {statusStyle.label}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] leading-4" style={{ color: T.textMuted }}>
                    {item.message}
                  </p>
                  {item.details?.length ? (
                    <p className="mt-1 text-[10px] leading-4" style={{ color: T.textMuted }}>
                      原因：{item.details[0]}
                    </p>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>

        <div className="mb-5" data-testid="task-readiness-summary">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-xs font-medium" style={{ color: T.textSecondary }}>正式开工判定</h4>
            <span
              className="text-[10px]"
              style={{ color: taskReadinessSummary.blockingCount > 0 ? "#fca5a5" : T.textMuted }}
            >
              {taskReadinessSummary.blockingCount > 0
                ? `${taskReadinessSummary.blockingCount} 项阻塞`
                : taskReadinessSummary.warningCount > 0
                  ? `${taskReadinessSummary.warningCount} 项注意`
                  : "可正式开工"}
            </span>
          </div>
          <div className="space-y-1.5">
            {taskReadinessSummary.items.map((item) => {
              const statusStyle = HEALTH_STATUS_STYLE[item.status]
              const firstFixHint = summarizeFixHint(getTaskReadinessPrimaryFixHint(item))
              return (
                <div
                  key={item.taskId}
                  data-testid={`task-readiness-item-${item.taskId}`}
                  className="rounded-lg border px-3 py-2"
                  style={{
                    borderColor: statusStyle.borderColor,
                    backgroundColor: statusStyle.backgroundColor,
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium" style={{ color: T.text }}>
                      {item.label}
                    </span>
                    <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ color: statusStyle.color, backgroundColor: "rgba(0,0,0,0.18)" }}>
                      {statusStyle.label}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] leading-4" style={{ color: T.textMuted }}>
                    {item.summary}
                  </p>
                  {firstFixHint ? (
                    <p
                      className="mt-1 text-[10px] leading-4"
                      data-testid={`task-readiness-fix-hint-${item.taskId}`}
                      title={getTaskReadinessPrimaryFixHint(item)}
                      style={{ color: item.status === "blocked" ? "#fca5a5" : "#fbbf24" }}
                    >
                      先修：{firstFixHint}
                    </p>
                  ) : null}
                  {item.recommendedFixes.length > 0 ? (
                    <p className="mt-1 text-[10px] leading-4" style={{ color: T.textMuted }}>
                      建议：{item.recommendedFixes[0]}
                    </p>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── 模型管理区 ──────────────────────────────── */}
        <div className="mb-5">
          <h4 className="mb-2 text-xs font-medium" style={{ color: T.textSecondary }}>模型管理</h4>

          {/* 当前模型列表 */}
          <div className="mb-2 max-h-36 overflow-y-auto space-y-1">
            {models.map((m, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg px-2 py-1" style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
                <span className="text-xs font-medium" style={{ color: T.accent }}>{m.label}</span>
                <span className="text-[10px]" style={{ color: T.textMuted }}>{m.value}</span>
                <span className="text-[10px] capitalize" style={{ color: T.textMuted }}>{m.type}</span>
                <button onClick={() => handleRemoveModel(i)} className="ml-auto rounded p-0.5 hover:bg-white/10">
                  <Trash2 size={12} strokeWidth={1.5} style={{ color: T.textMuted }} />
                </button>
              </div>
            ))}
            {models.length === 0 && (
              <p className="text-[11px]" style={{ color: T.textMuted }}>暂无自定义模型，请在下方添加</p>
            )}
          </div>

          {/* 添加新模型 */}
          <div className="space-y-1.5 rounded-xl border p-3" style={{ borderColor: T.border }}>
            <input
              type="text"
              value={newModel.label}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setNewModel(prev => ({ ...prev, label: e.target.value }))}
              placeholder="显示名称（如：My-GPT）"
              className="w-full rounded border bg-black/40 px-2 py-1 text-xs text-white outline-none"
              style={{ borderColor: T.border }}
            />
            <input
              type="text"
              value={newModel.value}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setNewModel(prev => ({ ...prev, value: e.target.value }))}
              placeholder="模型 ID（如：gpt-4o）"
              className="w-full rounded border bg-black/40 px-2 py-1 text-xs text-white outline-none"
              style={{ borderColor: T.border }}
            />
            <input
              type="text"
              value={newModel.provider}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setNewModel(prev => ({ ...prev, provider: e.target.value }))}
              placeholder="提供方（如：OpenAI、智谱、Vidu）"
              className="w-full rounded border bg-black/40 px-2 py-1 text-xs text-white outline-none"
              style={{ borderColor: T.border }}
            />
            {/* 类型选择 */}
            <div className="flex gap-1">
              {(["text", "image", "video"] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setNewModel(prev => ({ ...prev, type }))}
                  className="rounded-md px-2 py-0.5 text-[10px] transition-colors"
                  style={{
                    backgroundColor: newModel.type === type ? T.accentSoft : "transparent",
                    color: newModel.type === type ? T.accent : T.textMuted,
                  }}
                >
                  {type === "text" ? "文本" : type === "image" ? "图像" : "视频"}
                </button>
              ))}
            </div>
            <button
              onClick={handleAddModel}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] transition-colors hover:bg-white/10"
              style={{ color: T.accent }}
            >
              <Plus size={12} strokeWidth={1.5} /> 添加模型
            </button>
          </div>
        </div>

        {/* ── AI 使用统计 ─────────────────────────────── */}
        {usageRecords.length > 0 && (
          <div className="mb-5">
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium" style={{ color: T.textSecondary }}>
              <BarChart3 size={13} strokeWidth={1.5} />
              AI 用量提醒
            </h4>

            <div className="mb-3 grid grid-cols-3 gap-2">
              <div className="rounded-lg border px-2.5 py-2" style={{ borderColor: T.border, backgroundColor: "rgba(255,255,255,0.03)" }}>
                <p className="text-[10px] opacity-50" style={{ color: T.textMuted }}>今日请求</p>
                <p className="text-xs font-medium" style={{ color: T.text }}>
                  {usageStats.todayRuns}
                </p>
              </div>
              <div className="rounded-lg border px-2.5 py-2" style={{ borderColor: T.border, backgroundColor: "rgba(255,255,255,0.03)" }}>
                <p className="text-[10px] opacity-50" style={{ color: T.textMuted }}>本月请求</p>
                <p className="text-xs font-medium" style={{ color: T.text }}>
                  {usageStats.thisMonthRuns}
                </p>
              </div>
              <div className="rounded-lg border px-2.5 py-2" style={{ borderColor: T.border, backgroundColor: "rgba(255,255,255,0.03)" }}>
                <p className="text-[10px] opacity-50" style={{ color: T.textMuted }}>累计 tokens</p>
                <p className="text-xs font-medium" style={{ color: T.text }}>
                  {usageStats.totalTokens.toLocaleString()}
                </p>
              </div>
            </div>

            <div className="mb-2 flex gap-3 text-[10px]" style={{ color: T.textMuted }}>
              <span className="flex items-center gap-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400/80" />
                成功 {usageStats.successRuns}
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400/80" />
                失败 {usageStats.failedRuns}
              </span>
              <span>总计 {usageStats.totalRuns} 次</span>
              <span>图片 {usageStats.totalImages} 张</span>
              <span>视频 {usageStats.totalVideoSeconds.toFixed(1)} 秒</span>
            </div>

            {Object.keys(usageStats.byModel).length > 0 && (
              <div className="mb-2">
                <p className="mb-1 text-[10px] opacity-50" style={{ color: T.textMuted }}>按模型</p>
                <div className="space-y-0.5">
                  {Object.entries(usageStats.byModel)
                    .sort(([, a], [, b]) => b.runs - a.runs)
                    .map(([model, stat]) => (
                      <div key={model} className="flex items-center justify-between rounded px-2 py-1 text-[10px]" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
                        <span style={{ color: T.textSecondary }}>{model}</span>
                        <span style={{ color: T.accent }}>{stat.runs} 次</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {Object.keys(usageStats.byTaskType).length > 0 && (
              <div>
                <p className="mb-1 text-[10px] opacity-50" style={{ color: T.textMuted }}>按任务类型</p>
                <div className="flex gap-2">
                  {Object.entries(usageStats.byTaskType).map(([type, stat]) => (
                    <div key={type} className="rounded-full border px-2 py-0.5 text-[10px]" style={{ borderColor: T.border }}>
                      <span style={{ color: T.textMuted }}>{type}: </span>
                      <span style={{ color: T.accent }}>{stat.runs} 次</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── 操作按钮 ────────────────────────────────── */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs transition-colors hover:bg-white/10"
            style={{ color: T.textMuted }}
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-white"
            style={{ backgroundColor: T.accent }}
          >
            <Save size={12} strokeWidth={1.5} /> 保存
          </button>
        </div>
        </div>
      </div>

      {pendingRealSmokeConfirmation && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0"
            style={{ backgroundColor: "rgba(0,0,0,0.72)" }}
            onClick={handleCancelRealSmokeConfirmation}
          />
          <div
            data-testid="provider-real-smoke-confirm-dialog"
            className="relative z-10 flex w-[380px] flex-col gap-4 rounded-2xl border p-5 shadow-2xl"
            style={{ backgroundColor: T.panelSolid, borderColor: T.border }}
          >
            <div>
              <h4 className="text-sm font-medium" style={{ color: T.text }}>
                {pendingRealSmokeConfirmation.title}
              </h4>
              <p className="mt-2 text-xs leading-5" style={{ color: T.textMuted }}>
                {pendingRealSmokeConfirmation.description}
              </p>
            </div>

            {pendingRealSmokeConfirmation.requiredText && (
              <div className="space-y-2">
                <div
                  className="rounded-lg border px-3 py-2 text-xs"
                  style={{
                    borderColor: "rgba(245,158,11,0.32)",
                    backgroundColor: "rgba(245,158,11,0.08)",
                    color: "#fcd34d",
                  }}
                >
                  输入确认短语后才能继续：
                  <div className="mt-1 font-mono text-[11px]" style={{ color: "#fde68a" }}>
                    {pendingRealSmokeConfirmation.requiredText}
                  </div>
                </div>
                <input
                  data-testid="provider-real-smoke-confirm-input"
                  type="text"
                  value={realSmokeConfirmationInput}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setRealSmokeConfirmationInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && realSmokeConfirmationMatches) {
                      void handleConfirmRealSmoke()
                    }
                  }}
                  placeholder="请输入确认短语"
                  className={inputClass}
                  style={{ borderColor: T.border }}
                  onFocus={handleDialogInputFocus}
                  onBlur={handleDialogInputBlur}
                  autoFocus
                />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                data-testid="provider-real-smoke-confirm-cancel"
                onClick={handleCancelRealSmokeConfirmation}
                className="rounded-lg px-3 py-1.5 text-xs transition-colors hover:bg-white/10"
                style={{ color: T.textMuted }}
              >
                取消
              </button>
              <button
                type="button"
                data-testid="provider-real-smoke-confirm-submit"
                onClick={() => void handleConfirmRealSmoke()}
                disabled={!realSmokeConfirmationMatches}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: T.accent }}
              >
                {pendingRealSmokeConfirmation.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body,
  )
}
