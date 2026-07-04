// ============================================================================
// Workflow Node Component - Generic TapNow-style video workflow node
// P1-3: 统一使用 NodeRunStatus 六态模型驱动 UI
// ============================================================================
"use client"

import { memo, useMemo } from "react"
import {
  AudioLines,
  Captions,
  CheckCircle2,
  CircleAlert,
  Clapperboard,
  FileText,
  Film,
  Grid3X3,
  ImagePlus,
  Loader2,
  PanelsTopLeft,
  ScanEye,
  Sparkles,
  Video,
} from "lucide-react"
import { Handle, Position, NodeResizer, type NodeProps } from "@xyflow/react"
import { DESIGN_TOKENS, ICON_CONFIG } from "../../styles/designSystem"
import type { CanvasNodeData, CanvasNodeKind, NodeRunStatus, NodeRunSource } from "../canvas/types"
import { nodeToneStyles } from "../canvas/types"
import { useAIUsageStore } from "../../features/canvas/usage/useAIUsageStore"
import { getCompatibleRunMeta, isNodeBusy, isNodeFinished } from "../../utils/nodeRunMeta"

interface WorkflowNodeProps extends NodeProps {
  data: CanvasNodeData
}

const workflowLabels: Partial<Record<CanvasNodeKind, string>> = {
  script: "灵感",
  storyboard: "分镜",
  "image-generation": "文生图",
  "image-result": "图片结果",
  "video-generation": "图生视频",
  audio: "音频",
  subtitle: "字幕",
  composition: "合成",
  "video-result": "成片",
  "uploaded-video": "视频素材",
  "uploaded-audio": "音频素材",
  "uploaded-file": "文件素材",
  "video-sample-frames": "视频抽帧",
  "video-analyze": "视频分析",
}

// ── 六态标签 & 样式 ────────────────────────────────────────
const runStatusLabels: Record<NodeRunStatus, string> = {
  idle: "空闲",
  ready: "就绪",
  pending: "待确认",
  queued: "排队中",
  running: "运行中",
  succeeded: "成功",
  failed: "失败",
  stale: "需更新",
  cancelled: "已取消",
}

const runStatusClasses: Record<NodeRunStatus, string> = {
  idle: "border-white/10 bg-white/5 text-white/40",
  ready: "border-emerald-300/20 bg-emerald-400/8 text-emerald-200/70",
  pending: "border-amber-300/30 bg-amber-400/10 text-amber-200/80",
  queued: "border-sky-300/20 bg-sky-400/8 text-sky-200/70",
  running: "border-amber-300/20 bg-amber-400/8 text-amber-200/80",
  succeeded: "border-emerald-300/20 bg-emerald-400/8 text-emerald-200/80",
  failed: "border-red-300/20 bg-red-400/8 text-red-200/80",
  stale: "border-orange-300/20 bg-orange-400/10 text-orange-200/75",
  cancelled: "border-zinc-300/20 bg-zinc-400/8 text-zinc-200/60",
}

const sourceLabels: Record<NodeRunSource, string> = {
  manual: "手动",
  ai: "AI",
  workflow: "工作流",
  retry: "重试",
  system: "系统",
}

function getIcon(kind?: CanvasNodeKind) {
  switch (kind) {
    case "script":
      return FileText
    case "storyboard":
      return PanelsTopLeft
    case "image-generation":
    case "image-result":
      return ImagePlus
    case "video-generation":
      return Video
    case "audio":
    case "uploaded-audio":
      return AudioLines
    case "subtitle":
      return Captions
    case "composition":
      return Clapperboard
    case "video-result":
    case "uploaded-video":
      return Film
    case "video-sample-frames":
      return Grid3X3
    case "video-analyze":
      return ScanEye
    default:
      return Sparkles
  }
}

function getStatusIcon(status: NodeRunStatus) {
  if (status === "running") return Loader2
  if (status === "succeeded") return CheckCircle2
  if (status === "failed") return CircleAlert
  return null
}

// Whether this node kind supports AI execution
function isTextModelStep(kind?: CanvasNodeKind): boolean {
  return Boolean(kind && ["text", "script", "storyboard", "subtitle"].includes(kind))
}
function isImageModelStep(kind?: CanvasNodeKind): boolean {
  return Boolean(kind && ["image-generation", "image-result"].includes(kind))
}
function isVideoStep(kind?: CanvasNodeKind): boolean {
  return Boolean(kind && ["video-sample-frames", "video-analyze"].includes(kind))
}

// ── 主组件 ─────────────────────────────────────────────────
export const WorkflowNode = memo(function WorkflowNode({ id, data, selected }: WorkflowNodeProps) {
  const kind = data.nodeKind || "script"
  const tone = nodeToneStyles[kind]

  // P1-3: 统一从 runMeta 读取状态（兼容旧字段）
  const runMeta = getCompatibleRunMeta(data)
  const runStatus = runMeta.runStatus

  const Icon = getIcon(kind)
  const StatusIcon = getStatusIcon(runStatus)
  const title = data.title || workflowLabels[kind] || "工作流节点"
  const body = data.summary || data.instruction || data.prompt || data.content || data.fileName || "等待输入或连接上游节点。"
  const metaItems = [
    data.workflowRole,
    data.model,
    data.duration,
    data.fileSize ? `${Math.round(data.fileSize / 1024)} KB` : undefined,
  ].filter(Boolean)

  // ── AI Usage Summary ──────────────────────────────────
  const usageRecords = useAIUsageStore((s) => s.usageRecords)
  const nodeUsageSummary = useMemo(() => {
    const records = usageRecords.filter((record) => record.nodeId === id)
    const totalTokens = records.reduce((sum, record) => sum + (record.totalTokens ?? 0), 0)
    const totalImages = records.reduce((sum, record) => sum + (record.imageCount ?? 0), 0)
    const totalVideoSeconds = records.reduce((sum, record) => sum + (record.videoSeconds ?? 0), 0)
    return { runs: records.length, totalTokens, totalImages, totalVideoSeconds }
  }, [id, usageRecords])

  const isBusy = isNodeBusy(runStatus)
  const isFinished = isNodeFinished(runStatus)

  return (
    <>
      {selected && (
        <NodeResizer
          minWidth={240}
          minHeight={140}
          handleStyle={{ background: DESIGN_TOKENS.nodeHandle, border: "2px solid rgba(255,255,255,0.5)", borderRadius: "4px" }}
          lineStyle={{ stroke: DESIGN_TOKENS.nodeHandle, strokeWidth: 2, strokeDasharray: "6 3" }}
        />
      )}

      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !rounded-sm !border-2 !border-white/50 !bg-slate-400" />
      <Handle type="target" position={Position.Top} className="!h-3 !w-3 !rounded-sm !border-2 !border-white/50 !bg-slate-400" />
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !rounded-sm !border-2 !border-white/50 !bg-slate-500" />
      <Handle type="source" position={Position.Bottom} className="!h-3 !w-3 !rounded-sm !border-2 !border-white/50 !bg-slate-500" />

      <div
        className={`overflow-hidden rounded-2xl border transition-all ${selected ? "shadow-lg shadow-slate-500/20" : "hover:border-white/20"}`}
        style={{
          width: 280,
          minHeight: 150,
          border: selected ? "1px solid rgba(148, 163, 184, 0.4)" : tone.border,
          backgroundColor: DESIGN_TOKENS.panelSolid,
          boxShadow: selected ? DESIGN_TOKENS.shadowNode : "none",
        }}
      >
          {/* ── Header ─────────────────────────────────── */}
          <div className="flex items-center gap-2 border-b border-white/10 bg-black/20 px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ backgroundColor: tone.background }}>
              <Icon size={16} strokeWidth={ICON_CONFIG.strokeWidth} className={tone.eyebrow} />
            </div>
            <div className="min-w-0 flex-1">
              <p className={`truncate text-[10px] font-medium uppercase tracking-[0.18em] ${tone.eyebrow}`}>
                {workflowLabels[kind] || kind}
              </p>
              <p className="truncate text-sm font-medium text-white/90">{title}</p>
            </div>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] ${runStatusClasses[runStatus]}`}>
              {StatusIcon && <StatusIcon size={11} className={runStatus === "running" ? "animate-spin" : ""} />}
              {runStatusLabels[runStatus]}
            </span>
            {runMeta.source && runMeta.source !== "manual" && (
              <span className="rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] text-white/30" title={`触发来源: ${sourceLabels[runMeta.source]}`}>
                {sourceLabels[runMeta.source]}
              </span>
            )}
          </div>

          <div className="space-y-3 p-4">
            <p className={`line-clamp-4 text-sm leading-relaxed ${tone.body}`}>{body}</p>

            {metaItems.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {metaItems.map((item) => (
                  <span key={String(item)} className={`rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] ${tone.meta}`}>
                    {String(item)}
                  </span>
                ))}
              </div>
            )}

            {/* ── Progress Bar (running) ─────────────── */}
            {runStatus === "running" && (
              <>
                <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-1 rounded-full bg-amber-400 transition-all duration-300"
                    style={{ width: `${runMeta.progress ?? 20}%` }}
                  />
                </div>
                {runMeta.message && (
                  <p className="text-[10px] text-amber-200/60">{runMeta.message}</p>
                )}
              </>
            )}

            {/* ── Pending Reason ──────────────────────── */}
            {runStatus === "pending" && (
              <div className="rounded-lg border border-amber-400/30 bg-amber-400/8 px-3 py-2.5 text-xs text-amber-200/80">
                {runMeta.message ?? runMeta.pendingReason ?? "等待确认运行"}
              </div>
            )}

            {/* ── Error Message ──────────────────────── */}
            {runStatus === "failed" && (
              <div className="rounded-lg border border-red-400/20 bg-red-500/10 px-2 py-1.5 text-xs text-red-100/80">
                {runMeta.message && <p className="mb-0.5 font-medium text-red-200/90">{runMeta.message}</p>}
                {runMeta.error && <p className="opacity-80">{runMeta.error}</p>}
              </div>
            )}

            {/* ── Succeeded Message ──────────────────── */}
            {runStatus === "succeeded" && runMeta.message && (
              <p className="text-[10px] text-emerald-200/50">{runMeta.message}</p>
            )}

            {/* ── AI 用量摘要 ───────────────────────── */}
            {nodeUsageSummary.runs > 0 && (
              <div className="flex items-center gap-2 border-t border-white/10 pt-2.5 text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>
                <span>运行 {nodeUsageSummary.runs} 次</span>
                {nodeUsageSummary.totalTokens > 0 && <span>{nodeUsageSummary.totalTokens.toLocaleString()} tokens</span>}
                {nodeUsageSummary.totalImages > 0 && <span>{nodeUsageSummary.totalImages} 张图</span>}
                {nodeUsageSummary.totalVideoSeconds > 0 && <span>{nodeUsageSummary.totalVideoSeconds.toFixed(1)} 秒视频</span>}
              </div>
            )}

            {(data.inputs?.length || data.outputs?.length) && (
              <div className="grid grid-cols-2 gap-2 border-t border-white/10 pt-3 text-[10px] text-white/45">
                <div>
                  <p className="mb-1 uppercase tracking-wider">输入</p>
                  <p className="truncate">{data.inputs?.map((i) => i.label).join(" / ") || "—"}</p>
                </div>
                <div>
                  <p className="mb-1 uppercase tracking-wider">输出</p>
                  <p className="truncate">{data.outputs?.map((o) => o.label).join(" / ") || "—"}</p>
                </div>
              </div>
            )}

            {/* ── Pending Execution Confirmation ──────── */}
            {runStatus === "pending" && (
              <div className="rounded-lg border border-amber-400/30 bg-amber-400/8 px-3 py-2.5">
                <p className="mb-2 text-xs text-amber-200/80">
                  ⚠ AI 建议运行此节点
                </p>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    // 清除 pending，触发运行
                    if (typeof window !== "undefined") {
                      window.dispatchEvent(new CustomEvent("startrails-clear-pending", { detail: { nodeId: id } }))
                      window.dispatchEvent(new CustomEvent("startrails-run-node", { detail: { nodeId: id } }))
                    }
                  }}
                  className="nodrag nowheel flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-400/15 py-2 text-xs font-medium text-amber-200/90 transition-colors hover:bg-amber-400/25 hover:text-amber-100"
                >
                  <Sparkles size={12} />
                  确认运行
                </button>
              </div>
            )}

            {/* ── Run / Re-run Button ─────────────────── */}
            {(isTextModelStep(kind) || isImageModelStep(kind) || isVideoStep(kind)) && !isBusy && runStatus !== "pending" && (
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  if (typeof window !== "undefined") {
                    window.dispatchEvent(new CustomEvent("startrails-run-node", { detail: { nodeId: id } }))
                  }
                }}
                className="nodrag nowheel flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 py-2 text-xs text-white/60 transition-colors hover:bg-white/10 hover:text-white/80"
              >
                <Sparkles size={12} />
                {isFinished ? "重新运行" : "运行此节点"}
              </button>
            )}

            {kind === "script" && !isBusy && runStatus !== "pending" && (
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  if (typeof window !== "undefined") {
                    window.dispatchEvent(new CustomEvent("starcanvas:create-storyboard-assistant", { detail: { nodeId: id } }))
                  }
                }}
                className="nodrag nowheel flex w-full items-center justify-center gap-1.5 rounded-lg border border-sky-300/20 bg-sky-400/10 py-2 text-xs text-sky-100/70 transition-colors hover:bg-sky-400/15 hover:text-sky-50"
              >
                <Clapperboard size={12} />
                用故事种子继续分镜
              </button>
            )}
          </div>
        </div>
    </>
  )
})

export default WorkflowNode
