/**
 * ExportPreflightPanel — 导出预检面𤋈
 *
 * 在对标小云雀 2.0 / TapNow 的导出流程中补全以下缺失：
 * 1. 导出前素材预检查（缺失视频/音频/字幕提示）
 * 2. 导出进度（含耗时预估）
 * 3. 错误说明
 * 4. 导出结果路径 / 下载入口
 * 5. 接入 TimelinePanel 中的 clips 顺序
 *
 * 参考 ComfyUI (GPL v3) Queue UI 的进度显示 + 任务管理设计
 */
"use client"

import React, { useCallback, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  X,
  Film,
  Music,
  Subtitles,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Download,
  FileArchive,
  Play,
  List,
  Wand2,
} from "lucide-react"
import type { ProductionPreflightReport } from "@/lib/storyboard/productionPreflight"
import { DESIGN_TOKENS } from "../../styles/designSystem"
import {
  normalizeExportPreflightType,
  runExportPreflightCheck,
  type ExportPreflightType,
} from "./exportPreflightCheck"
export type { ExportAssetCheck } from "./exportPreflightCheck"

// ── 类型 ──────────────────────────────────────────────

export interface ExportPreflightPanelProps {
  isOpen: boolean
  onClose: () => void
  /** 画布中所有节点，用于预检 */
  nodes?: Array<{ id: string; type?: string; data?: Record<string, unknown> }>
  /** 从 TimelinePanel 提取的 clips 顺序 */
  timelineOrder?: string[]
  /** 从具体导出入口传入的默认导出类型 */
  initialExportType?: ExportPreflightType
  /** 镜头投产预检报告，用于导出前提示生图/生视频风险 */
  productionPreflight?: ProductionPreflightReport | null
  /** 点击镜头预检项后定位到对应镜头 */
  onResolveProductionIssue?: (shotId: string, action: string) => void
  /** 为镜头预检项应用可编辑修复草案 */
  onApplyProductionFix?: (shotId: string, action: string, source?: "production-queue" | "export-preflight") => void
  /** 实际的导出函数引用 */
  onPerformExport?: (type: "json" | "zip") => Promise<ExportResult>
}

export interface ExportResult {
  success: boolean
  filePath?: string
  downloadUrl?: string
  message?: string
  files?: Array<{ path: string; size: number }>
}

// ── 组件 ──────────────────────────────────────────────

export function ExportPreflightPanel({
  isOpen,
  onClose,
  nodes = [],
  timelineOrder,
  initialExportType,
  productionPreflight,
  onResolveProductionIssue,
  onApplyProductionFix,
  onPerformExport,
}: ExportPreflightPanelProps) {
  const [exportType, setExportType] = useState<ExportPreflightType>(() =>
    normalizeExportPreflightType(initialExportType),
  )
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [exportResult, setExportResult] = useState<ExportResult | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const checks = useCallback(() => runExportPreflightCheck(nodes, timelineOrder), [nodes, timelineOrder])

  const assetChecks = checks()
  const totalAssets = assetChecks.length
  const missingAssets = assetChecks.filter((c) => !c.hasContent).length
  const readyAssets = totalAssets - missingAssets
  const preflightSummary = productionPreflight?.summary
  const blockingShots = preflightSummary?.blockedShots ?? 0
  const reviewShots = preflightSummary?.reviewShots ?? 0
  const topPreflightIssues = productionPreflight?.shots
    .filter((shot) => shot.status !== "ready")
    .slice(0, 5) ?? []

  const handleExport = useCallback(async () => {
    if (!onPerformExport) return
    setIsExporting(true)
    setExportProgress(0)
    setExportResult(null)
    setExportError(null)

    // 模拟进度条
    progressTimerRef.current = setInterval(() => {
      setExportProgress((prev) => Math.min(prev + 8, 90))
    }, 500)

    try {
      const result = await onPerformExport(exportType)
      clearInterval(progressTimerRef.current!)
      setExportProgress(100)
      setExportResult(result)
    } catch (err) {
      clearInterval(progressTimerRef.current!)
      setExportError(err instanceof Error ? err.message : "导出失败")
    } finally {
      setIsExporting(false)
    }
  }, [onPerformExport, exportType])

  if (!isOpen) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
    >
      <div
        className="relative w-[480px] max-h-[80vh] overflow-hidden rounded-2xl border shadow-2xl flex flex-col"
        style={{
          backgroundColor: DESIGN_TOKENS.panel,
          borderColor: DESIGN_TOKENS.border,
          backdropFilter: "blur(20px)",
        }}
      >
        {/* ── 标题栏 ── */}
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: DESIGN_TOKENS.border }}
        >
          <div className="flex items-center gap-2">
            <Film size={18} style={{ color: DESIGN_TOKENS.accent }} />
            <span className="text-sm font-semibold" style={{ color: DESIGN_TOKENS.text }}>
              导出预检
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg transition-all hover:bg-white/10"
            style={{ color: DESIGN_TOKENS.textMuted }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {/* ── 概览 ── */}
          <div className="mb-4 flex gap-3">
            <div
              className="flex-1 rounded-xl border p-3 text-center"
              style={{ borderColor: DESIGN_TOKENS.border }}
            >
              <span className="text-2xl font-bold" style={{ color: DESIGN_TOKENS.accentHover }}>
                {totalAssets}
              </span>
              <p className="text-[10px] mt-1" style={{ color: DESIGN_TOKENS.textMuted }}>
                总素材
              </p>
            </div>
            <div
              className="flex-1 rounded-xl border p-3 text-center"
              style={{ borderColor: readyAssets === totalAssets ? "rgba(34,197,94,0.3)" : DESIGN_TOKENS.border }}
            >
              <span
                className="text-2xl font-bold"
                style={{
                  color: readyAssets === totalAssets ? "#22c55e" : DESIGN_TOKENS.textMuted,
                }}
              >
                {readyAssets}
              </span>
              <p className="text-[10px] mt-1" style={{ color: DESIGN_TOKENS.textMuted }}>
                就绪
              </p>
            </div>
            <div
              className="flex-1 rounded-xl border p-3 text-center"
              style={{ borderColor: missingAssets > 0 ? "rgba(239,68,68,0.3)" : DESIGN_TOKENS.border }}
            >
              <span
                className="text-2xl font-bold"
                style={{ color: missingAssets > 0 ? "#ef4444" : DESIGN_TOKENS.textMuted }}
              >
                {missingAssets}
              </span>
              <p className="text-[10px] mt-1" style={{ color: DESIGN_TOKENS.textMuted }}>
                缺失
              </p>
            </div>
          </div>

          {/* ── 投产预检 ── */}
          {preflightSummary && (
            <div
              className="mb-4 rounded-xl border p-3"
              style={{
                borderColor:
                  blockingShots > 0
                    ? "rgba(239,68,68,0.28)"
                    : reviewShots > 0
                      ? "rgba(234,179,8,0.28)"
                      : "rgba(34,197,94,0.24)",
                backgroundColor:
                  blockingShots > 0
                    ? "rgba(239,68,68,0.06)"
                    : reviewShots > 0
                      ? "rgba(234,179,8,0.06)"
                      : "rgba(34,197,94,0.05)",
              }}
              data-testid="export-production-preflight"
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {blockingShots > 0 ? (
                    <AlertCircle size={14} style={{ color: "#ef4444" }} />
                  ) : reviewShots > 0 ? (
                    <AlertTriangle size={14} style={{ color: "#facc15" }} />
                  ) : (
                    <CheckCircle2 size={14} style={{ color: "#22c55e" }} />
                  )}
                  <span className="text-xs font-medium" style={{ color: DESIGN_TOKENS.textSecondary }}>
                    投产预检
                  </span>
                </div>
                <span className="text-[11px]" style={{ color: DESIGN_TOKENS.textMuted }}>
                  {preflightSummary.averageScore}/100
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                <span className="rounded-lg py-1.5" style={{ backgroundColor: "rgba(34,197,94,0.10)", color: "#22c55e" }}>
                  {preflightSummary.readyShots} 就绪
                </span>
                <span className="rounded-lg py-1.5" style={{ backgroundColor: "rgba(234,179,8,0.10)", color: "#facc15" }}>
                  {preflightSummary.reviewShots} 复核
                </span>
                <span className="rounded-lg py-1.5" style={{ backgroundColor: "rgba(239,68,68,0.10)", color: "#ef4444" }}>
                  {preflightSummary.blockedShots} 阻塞
                </span>
              </div>
              {topPreflightIssues.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {topPreflightIssues.map((shot) => {
                    const primaryAction = shot.requiredActions[0] ?? "review-shot";
                    return (
                    <div
                      key={shot.shotId}
                      data-testid="export-production-preflight-issue"
                      className="w-full rounded-lg px-2 py-1.5 text-left transition hover:bg-white/10"
                      style={{
                        backgroundColor: "rgba(255,255,255,0.04)",
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => onResolveProductionIssue?.(shot.shotId, primaryAction)}
                          className="min-w-0 flex-1 truncate text-left text-[11px] transition hover:text-white"
                          style={{
                            color: DESIGN_TOKENS.text,
                            cursor: onResolveProductionIssue ? "pointer" : "default",
                          }}
                        >
                          #{shot.order} {shot.title || "未命名镜头"}
                        </button>
                        <span style={{ color: shot.status === "blocked" ? "#ef4444" : "#facc15" }} className="text-[10px]">
                          {shot.status === "blocked" ? "阻塞" : "需复核"}
                        </span>
                        {onApplyProductionFix && (
                          <button
                            type="button"
                            data-testid="export-production-preflight-apply-fix"
                            onClick={() => onApplyProductionFix(shot.shotId, primaryAction, "export-preflight")}
                            className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] transition hover:bg-white/10"
                            style={{ color: "#93c5fd" }}
                          >
                            <Wand2 size={10} strokeWidth={1.8} />
                            草案
                          </button>
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>
                        {shot.issues[0]?.message ?? "需要补齐投产信息"}
                      </div>
                    </div>
                  )})}
                </div>
              )}
            </div>
          )}

          {/* ── 素材清单 ── */}
          <div className="mb-4">
            <div className="mb-2 flex items-center gap-2">
              <List size={14} style={{ color: DESIGN_TOKENS.textMuted }} />
              <span className="text-xs font-medium" style={{ color: DESIGN_TOKENS.textSecondary }}>
                素材清单
              </span>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {assetChecks.map((check) => (
                <div
                  key={`${check.type}:${check.nodeId}`}
                  className="flex items-center gap-3 rounded-lg border px-3 py-2"
                  style={{
                    borderColor: check.warningReason
                      ? "rgba(250,204,21,0.28)"
                      : check.hasContent
                      ? "rgba(34,197,94,0.2)"
                      : "rgba(239,68,68,0.2)",
                    backgroundColor: check.warningReason
                      ? "rgba(250,204,21,0.06)"
                      : check.hasContent
                      ? "rgba(34,197,94,0.05)"
                      : "rgba(239,68,68,0.05)",
                  }}
                >
                  {check.type === "video" && <Film size={14} style={{ color: check.hasContent ? "#22c55e" : "#ef4444" }} />}
                  {check.type === "audio" && <Music size={14} style={{ color: check.hasContent ? "#22c55e" : "#ef4444" }} />}
                  {check.type === "subtitle" && <Subtitles size={14} style={{ color: check.hasContent ? "#22c55e" : "#ef4444" }} />}
                  <div className="flex-1 min-w-0">
                    <span className="text-xs truncate block" style={{ color: DESIGN_TOKENS.text }}>
                      {check.title}
                    </span>
                    <span className="text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>
                      {check.label}
                    </span>
                  </div>
                  {check.hasContent && check.warningReason ? (
                    <span className="text-[10px] flex items-center gap-1" style={{ color: "#facc15", flexShrink: 0 }}>
                      <AlertTriangle size={12} />
                      注意
                    </span>
                  ) : check.hasContent ? (
                    <CheckCircle2 size={14} style={{ color: "#22c55e", flexShrink: 0 }} />
                  ) : (
                    <span className="text-[10px] flex items-center gap-1" style={{ color: "#ef4444", flexShrink: 0 }}>
                      <AlertTriangle size={12} />
                      缺失
                    </span>
                  )}
                  {(check.missingReason || check.warningReason) && (
                    <span
                      className="text-[10px] hidden group-hover:block"
                      style={{ color: DESIGN_TOKENS.textMuted }}
                    >
                      {check.missingReason || check.warningReason}
                    </span>
                  )}
                </div>
              ))}
              {assetChecks.length === 0 && (
                <p className="text-xs text-center py-8" style={{ color: DESIGN_TOKENS.textMuted }}>
                  无可导出的素材节点
                </p>
              )}
            </div>
          </div>

          {/* ── 导出类型选择 ── */}
          <div className="mb-4">
            <div className="flex gap-2">
              <button
                onClick={() => setExportType("json")}
                className="flex-1 rounded-lg border px-3 py-2 text-xs transition-all"
                style={{
                  borderColor: exportType === "json" ? DESIGN_TOKENS.accent : DESIGN_TOKENS.border,
                  backgroundColor: exportType === "json" ? DESIGN_TOKENS.accentSoft : "transparent",
                  color: exportType === "json" ? DESIGN_TOKENS.accentHover : DESIGN_TOKENS.textMuted,
                }}
              >
                <FileArchive size={14} className="mx-auto mb-1" />
                JSON 草稿
              </button>
              <button
                onClick={() => setExportType("zip")}
                className="flex-1 rounded-lg border px-3 py-2 text-xs transition-all"
                style={{
                  borderColor: exportType === "zip" ? DESIGN_TOKENS.accent : DESIGN_TOKENS.border,
                  backgroundColor: exportType === "zip" ? DESIGN_TOKENS.accentSoft : "transparent",
                  color: exportType === "zip" ? DESIGN_TOKENS.accentHover : DESIGN_TOKENS.textMuted,
                }}
              >
                <FileArchive size={14} className="mx-auto mb-1" />
                兼容包 ZIP
              </button>
            </div>
          </div>

          {/* ── 进度条 ── */}
          {isExporting && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <Loader2 size={14} className="animate-spin" style={{ color: DESIGN_TOKENS.accent }} />
                <span className="text-xs" style={{ color: DESIGN_TOKENS.textSecondary }}>
                  导出中 {exportProgress}%
                </span>
              </div>
              <div
                className="h-2 rounded-full overflow-hidden"
                style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${exportProgress}%`,
                    backgroundColor: DESIGN_TOKENS.accent,
                  }}
                />
              </div>
            </div>
          )}

          {/* ── 导出结果 ── */}
          {exportResult?.success && (
            <div
              className="mb-4 rounded-xl border p-4"
              style={{
                backgroundColor: "rgba(34,197,94,0.08)",
                borderColor: "rgba(34,197,94,0.2)",
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 size={16} style={{ color: "#22c55e" }} />
                <span className="text-xs font-medium" style={{ color: "#22c55e" }}>
                  导出成功
                </span>
              </div>
              {exportResult.files && (
                <div className="space-y-1">
                  {exportResult.files.map((f) => (
                    <div
                      key={f.path}
                      className="flex items-center justify-between rounded-lg px-3 py-1.5 text-[11px]"
                      style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
                    >
                      <span style={{ color: DESIGN_TOKENS.textSecondary }}>{f.path.split("/").pop()}</span>
                      <span style={{ color: DESIGN_TOKENS.textMuted }}>
                        {(f.size / 1024).toFixed(1)} KB
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {exportResult.message && (
                <p className="text-[11px] mt-2" style={{ color: DESIGN_TOKENS.textSecondary }}>
                  {exportResult.message}
                </p>
              )}
            </div>
          )}

          {/* ── 错误提示 ── */}
          {exportError && (
            <div
              className="mb-4 rounded-xl border p-3"
              style={{
                backgroundColor: "rgba(239,68,68,0.08)",
                borderColor: "rgba(239,68,68,0.2)",
              }}
            >
              <div className="flex items-center gap-2">
                <AlertCircle size={14} style={{ color: "#ef4444" }} />
                <span className="text-xs" style={{ color: "#ef4444" }}>
                  {exportError}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── 操作按钮 ── */}
        <div
          className="border-t px-4 py-3"
          style={{ borderColor: DESIGN_TOKENS.border }}
        >
          <button
            onClick={handleExport}
            disabled={isExporting || totalAssets === 0}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-medium transition-all"
            style={{
              backgroundColor:
                missingAssets > 0
                  ? DESIGN_TOKENS.accentSoft
                  : DESIGN_TOKENS.accent,
              color: isExporting || totalAssets === 0
                ? DESIGN_TOKENS.textMuted
                : "#fff",
            }}
          >
            {isExporting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                导出中...
              </>
            ) : (
              <>
                <Play size={14} />
                {missingAssets > 0
                  ? `仍导出 (${missingAssets} 个素材缺失)`
                  : blockingShots > 0
                    ? `仍导出 (${blockingShots} 个镜头阻塞)`
                  : `导出 ${exportType === "json" ? "JSON 草稿" : "ZIP 兼容包"}`}
              </>
            )}
          </button>
          {(missingAssets > 0 || blockingShots > 0) && (
            <p className="mt-1.5 text-[10px] text-center" style={{ color: DESIGN_TOKENS.textMuted }}>
              {missingAssets > 0
                ? `${missingAssets} 个素材缺失，导出结果可能不完整`
                : `${blockingShots} 个镜头未通过投产预检，后续生成前需要修复`}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
