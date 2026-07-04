"use client"

import { memo, useCallback, useState } from "react"
import { Sparkles, RefreshCw, RotateCcw, Loader2, AlertTriangle, Image } from "lucide-react"
import { DESIGN_TOKENS } from "../../styles/designSystem"
import type { CharacterIdentityAsset } from "../canvas/types"
import { generateCharacterViews, inferCharacterDescription } from "@/lib/services/characterViewService"
import type { CharacterViewProgress } from "@/lib/services/characterViewService"

// ============================================================================
// Types
// ============================================================================

interface CharacterViewPreviewCardProps {
  identity: CharacterIdentityAsset
  onUpdateViewUrls: (urls: {
    frontViewUrl?: string
    sideViewUrl?: string
    backViewUrl?: string
  }) => void
}

// ============================================================================
// View Card Sub-component
// ============================================================================

type ViewCardLabel = "正面" | "侧面" | "背面"

function ViewCard({
  label,
  imageUrl,
}: {
  label: ViewCardLabel
  imageUrl?: string
}) {
  return (
    <div
      className="flex flex-col items-center gap-1.5"
      style={{ minWidth: 0 }}
    >
      <div
        className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border"
        style={{
          borderColor: DESIGN_TOKENS.border,
          backgroundColor: DESIGN_TOKENS.card,
        }}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={`${label}视图`}
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="flex flex-col items-center gap-1.5 p-3">
            <Image size={20} style={{ color: DESIGN_TOKENS.textMuted }} />
            <span
              className="text-[10px] leading-tight text-center"
              style={{ color: DESIGN_TOKENS.textMuted }}
            >
              缺省
            </span>
          </div>
        )}
      </div>
      <span
        className="text-[10px] font-medium tracking-wide"
        style={{ color: DESIGN_TOKENS.textSecondary }}
      >
        {label}
      </span>
    </div>
  )
}

// ============================================================================
// Progress Bar Sub-component
// ============================================================================

function ProgressBar({ percent, message }: { percent: number; message: string }) {
  return (
    <div className="mt-2 space-y-1">
      <div
        className="h-1 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: DESIGN_TOKENS.card }}
      >
        <div
          className="h-full rounded-full transition-all duration-300 ease-out"
          style={{
            width: `${percent}%`,
            backgroundColor: DESIGN_TOKENS.accent,
          }}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <Loader2
          size={10}
          className="animate-spin"
          style={{ color: DESIGN_TOKENS.accent }}
        />
        <span
          className="text-[10px] truncate"
          style={{ color: DESIGN_TOKENS.textSecondary }}
        >
          {message || "生成中..."}
        </span>
        <span
          className="ml-auto text-[10px] tabular-nums"
          style={{ color: DESIGN_TOKENS.textMuted }}
        >
          {percent}%
        </span>
      </div>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export const CharacterViewPreviewCard = memo(function CharacterViewPreviewCard({
  identity,
  onUpdateViewUrls,
}: CharacterViewPreviewCardProps) {
  const [status, setStatus] = useState<"idle" | "generating" | "failed">(
    identity.viewGenerationStatus === "generating" ? "generating" : "idle"
  )
  const [progress, setProgress] = useState<CharacterViewProgress>({
    stage: "",
    percent: 0,
    message: "",
  })
  const [errorMessage, setErrorMessage] = useState<string>("")

  // 获取视图 URL（在 generating 过程中可能已有部分结果）
  const frontViewUrl = identity.frontViewUrl
  const sideViewUrl = identity.sideViewUrl
  const backViewUrl = identity.backViewUrl

  // 角色描述预览
  const descriptionPreview = useCallback(() => {
    const desc = inferCharacterDescription(identity)
    if (!desc) return "暂无角色描述信息"
    return desc.length > 80 ? desc.slice(0, 80) + "..." : desc
  }, [identity])

  // 处理进度回调
  const handleProgress = useCallback((p: CharacterViewProgress) => {
    setProgress(p)
  }, [])

  // 生成三视图
  const handleGenerate = useCallback(async () => {
    setStatus("generating")
    setProgress({ stage: "preparing", percent: 0, message: "准备生成..." })
    setErrorMessage("")

    try {
      const characterDescription = inferCharacterDescription(identity)
      if (!characterDescription) {
        throw new Error("角色描述不完整，请先填写角色的视觉特征信息")
      }

      const result = await generateCharacterViews(
        { characterDescription },
        handleProgress,
      )

      // 生成完成，回传 URL
      onUpdateViewUrls({
        frontViewUrl: result.frontViewUrl,
        sideViewUrl: result.sideViewUrl,
        backViewUrl: result.backViewUrl,
      })
      setStatus("idle")
      setProgress({ stage: "done", percent: 100, message: "生成完成" })
    } catch (err: any) {
      setStatus("failed")
      setErrorMessage(err?.message || "生成失败，请重试")
    }
  }, [identity, handleProgress, onUpdateViewUrls])

  // 失败重试
  const handleRetry = useCallback(() => {
    handleGenerate()
  }, [handleGenerate])

  return (
    <div className="mt-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sparkles
            size={14}
            className="shrink-0"
            style={{ color: DESIGN_TOKENS.textMuted }}
          />
          <span
            className="text-[11px] font-medium"
            style={{ color: DESIGN_TOKENS.textSecondary }}
          >
            角色视图
          </span>
        </div>

        <button
          type="button"
          className="flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[10px] font-medium transition opacity-40 cursor-not-allowed"
          style={{
            borderColor: DESIGN_TOKENS.border,
            color: DESIGN_TOKENS.textMuted,
            backgroundColor: DESIGN_TOKENS.card,
          }}
          disabled
          title="三视图生成正在接入中，当前版本暂不可用"
        >
          <Sparkles size={12} />
          生成三视图
        </button>
      </div>

      {/* Feature unavailable notice */}
      <div
        className="rounded-lg px-2.5 py-1.5"
        style={{
          backgroundColor: "rgba(245,158,11,0.06)",
          border: "0.5px solid rgba(245,158,11,0.2)",
        }}
      >
        <span
          className="block text-[10px] leading-relaxed"
          style={{ color: "#fbbf24" }}
        >
          三视图生成正在接入中，当前版本暂不可用。
        </span>
      </div>

      {/* View Cards Grid */}
      <div className="grid grid-cols-3 gap-2">
        <ViewCard label="正面" imageUrl={frontViewUrl} />
        <ViewCard label="侧面" imageUrl={sideViewUrl} />
        <ViewCard label="背面" imageUrl={backViewUrl} />
      </div>

      {/* Progress / Error State */}
      {status === "generating" && (
        <ProgressBar
          percent={progress.percent}
          message={progress.message || "生成中..."}
        />
      )}

      {status === "failed" && errorMessage && (
        <div
          className="flex items-start gap-2 rounded-lg p-2"
          style={{
            backgroundColor: "rgba(248, 113, 113, 0.06)",
            border: "1px solid rgba(248, 113, 113, 0.15)",
          }}
        >
          <AlertTriangle
            size={12}
            className="mt-0.5 shrink-0"
            style={{ color: "#f87171" }}
          />
          <div className="min-w-0 flex-1">
            <span
              className="block text-[10px] leading-relaxed"
              style={{ color: "#fca5a5" }}
            >
              {errorMessage}
            </span>
          </div>
          <button
            type="button"
            className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium transition hover:opacity-80"
            style={{
              color: "#f87171",
              backgroundColor: "rgba(248, 113, 113, 0.1)",
            }}
            onClick={handleRetry}
          >
            <RefreshCw size={10} />
            重试
          </button>
        </div>
      )}

      {/* Character Description Preview */}
      <div
        className="rounded-lg px-2.5 py-1.5"
        style={{
          backgroundColor: DESIGN_TOKENS.card,
          border: `1px solid ${DESIGN_TOKENS.border}`,
        }}
      >
        <span
          className="block text-[10px] leading-relaxed line-clamp-2"
          style={{ color: DESIGN_TOKENS.textMuted }}
        >
          角色描述预览: &ldquo;{descriptionPreview()}&rdquo;
        </span>
      </div>
    </div>
  )
})
