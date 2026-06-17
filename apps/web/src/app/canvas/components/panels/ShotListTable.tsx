// ============================================================================
// ShotListTable - 分镜表格视图（小云雀/ArcReel 风格 Shot List）
// ============================================================================
"use client"

import { memo, useCallback, useMemo, useState } from "react"
import type { Node } from "@xyflow/react"
import {
  Play,
  ImageIcon,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Type,
  ArrowUpDown,
  Grid3X3,
  FileDown,
  Clapperboard,
} from "lucide-react"
import type { CanvasNodeData, StoryboardShotData } from "../canvas/types"
import { DESIGN_TOKENS } from "../../styles/designSystem"

// ============================================================================
// Types
// ============================================================================

export type ShotListViewMode = "grid" | "table"

export type ShotListSortKey = "order" | "shotType" | "cameraMovement" | "status"

export type ShotListSortDirection = "asc" | "desc"

interface ShotListTableProps {
  nodes: Node<CanvasNodeData>[]
  selectedNodeId?: string | null
  onSelectShot?: (nodeId: string) => void
  onRunShot?: (nodeId: string) => void
  onExportJianying?: () => void
  onExportScript?: () => void
}

interface ShotRow {
  nodeId: string
  shot: StoryboardShotData
  nodeData: CanvasNodeData
}

// ============================================================================
// Helpers
// ============================================================================

function getShotTypeLabel(type?: string): string {
  const map: Record<string, string> = {
    wide: "全景",
    medium: "中景",
    close_up: "特写",
    over_shoulder: "过肩",
    insert: "插入",
    custom: "自定义",
  }
  return map[type ?? ""] || type || "—"
}

function getCameraMovementLabel(movement?: string): string {
  const map: Record<string, string> = {
    static: "固定",
    pan: "摇镜头",
    tilt: "俯仰",
    dolly: "推拉",
    truck: "横移",
    zoom: "变焦",
    handheld: "手持",
    custom: "自定义",
  }
  return map[movement ?? ""] || movement || "—"
}

function getStatusBadge(status?: string) {
  switch (status) {
    case "succeeded":
      return { icon: CheckCircle2, label: "已完成", color: "#22c55e" }
    case "generating":
    case "retrying":
      return { icon: Loader2, label: "生成中", color: "#3b82f6" }
    case "failed":
      return { icon: XCircle, label: "失败", color: "#ef4444" }
    case "queued":
      return { icon: Clock, label: "排队中", color: "#f59e0b" }
    default:
      return { icon: null, label: "待生成", color: "#9ca3af" }
  }
}

function extractShots(nodes: Node<CanvasNodeData>[]): ShotRow[] {
  const rows: ShotRow[] = []
  for (const node of nodes) {
    if (node.type === "shot" && node.data?.shot) {
      rows.push({
        nodeId: node.id,
        shot: node.data.shot,
        nodeData: node.data,
      })
    }
  }
  return rows.sort((a, b) => (a.shot.order ?? 0) - (b.shot.order ?? 0))
}

// ============================================================================
// Component
// ============================================================================

export const ShotListTable = memo(function ShotListTable({
  nodes,
  selectedNodeId,
  onSelectShot,
  onRunShot,
  onExportJianying,
  onExportScript,
}: ShotListTableProps) {
  const [sortKey, setSortKey] = useState<ShotListSortKey>("order")
  const [sortDir, setSortDir] = useState<ShotListSortDirection>("asc")
  const [viewMode, setViewMode] = useState<ShotListViewMode>("table")

  const shots = useMemo(() => extractShots(nodes), [nodes])

  const sortedShots = useMemo(() => {
    const sorted = [...shots]
    sorted.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case "order":
          cmp = (a.shot.order ?? 0) - (b.shot.order ?? 0)
          break
        case "shotType":
          cmp = (a.shot.shotType || "").localeCompare(b.shot.shotType || "")
          break
        case "cameraMovement":
          cmp = (a.shot.cameraMovement || "").localeCompare(b.shot.cameraMovement || "")
          break
        case "status":
          cmp = (a.shot.generationStatus || "").localeCompare(b.shot.generationStatus || "")
          break
      }
      return sortDir === "asc" ? cmp : -cmp
    })
    return sorted
  }, [shots, sortKey, sortDir])

  const handleSort = useCallback(
    (key: ShotListSortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"))
      } else {
        setSortKey(key)
        setSortDir("asc")
      }
    },
    [sortKey],
  )

  const totalShots = shots.length
  const completedShots = shots.filter(
    (s) => s.shot.generationStatus === "succeeded",
  ).length
  const failedShots = shots.filter(
    (s) => s.shot.generationStatus === "failed",
  ).length

  if (totalShots === 0) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-3 p-8"
        style={{ color: DESIGN_TOKENS.textMuted }}
      >
        <Clapperboard size={40} strokeWidth={1.2} />
        <p className="text-sm">当前画布没有分镜节点</p>
        <p className="text-xs opacity-60">在故事板节点上右键选择&ldquo;拆分为分镜&rdquo;来创建</p>
      </div>
    )
  }

  // Grid View
  if (viewMode === "grid") {
    return (
      <div className="flex h-full flex-col">
        <ShotListHeader
          totalShots={totalShots}
          completedShots={completedShots}
          failedShots={failedShots}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onExportJianying={onExportJianying}
          onExportScript={onExportScript}
        />
        <div className="flex-1 overflow-auto p-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {sortedShots.map((row) => (
              <ShotCard
                key={row.nodeId}
                row={row}
                isSelected={row.nodeId === selectedNodeId}
                onSelect={() => onSelectShot?.(row.nodeId)}
                onRun={() => onRunShot?.(row.nodeId)}
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Table View
  return (
    <div className="flex h-full flex-col">
      <ShotListHeader
        totalShots={totalShots}
        completedShots={completedShots}
        failedShots={failedShots}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onExportJianying={onExportJianying}
        onExportScript={onExportScript}
      />

      <div className="flex-1 overflow-auto">
        <table className="w-full text-left text-xs">
          <thead
            className="sticky top-0 z-10"
            style={{ backgroundColor: "rgba(18,18,24,0.95)" }}
          >
            <tr style={{ borderBottom: `1px solid ${DESIGN_TOKENS.border}` }}>
              <SortableTh label="镜号" sortKey="order" active={sortKey} dir={sortDir} onSort={handleSort} width="60px" />
              <Th label="描述" />
              <SortableTh label="景别" sortKey="shotType" active={sortKey} dir={sortDir} onSort={handleSort} width="70px" />
              <SortableTh label="运镜" sortKey="cameraMovement" active={sortKey} dir={sortDir} onSort={handleSort} width="80px" />
              <Th label="时长" width="60px" />
              <Th label="对白" />
              <SortableTh label="状态" sortKey="status" active={sortKey} dir={sortDir} onSort={handleSort} width="90px" />
              <Th label="结果" width="80px" />
              <Th label="操作" width="70px" />
            </tr>
          </thead>
          <tbody>
            {sortedShots.map((row) => {
              const status = getStatusBadge(row.shot.generationStatus)
              const StatusIcon = status.icon
              const isSelected = row.nodeId === selectedNodeId
              return (
                <tr
                  key={row.nodeId}
                  className="cursor-pointer transition-colors hover:bg-white/5"
                  onClick={() => onSelectShot?.(row.nodeId)}
                  style={{
                    borderBottom: `1px solid ${DESIGN_TOKENS.border}`,
                    backgroundColor: isSelected ? "rgba(59,130,246,0.08)" : undefined,
                  }}
                >
                  <td className="px-2 py-2.5 font-mono text-xs" style={{ color: DESIGN_TOKENS.textSecondary }}>
                    {String(row.shot.order ?? 0).padStart(2, "0")}
                  </td>
                  <td className="px-2 py-2.5 max-w-[200px]">
                    <div className="truncate text-xs" style={{ color: DESIGN_TOKENS.text }} title={row.shot.description}>
                      {row.shot.title || row.shot.description || "—"}
                    </div>
                    {row.shot.visualPrompt && (
                      <div className="mt-0.5 truncate text-[10px] opacity-50" title={row.shot.visualPrompt}>
                        {row.shot.visualPrompt}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2.5">
                    <span
                      className="inline-block rounded px-1.5 py-0.5 text-[10px]"
                      style={{
                        backgroundColor: "rgba(255,255,255,0.06)",
                        color: DESIGN_TOKENS.textSecondary,
                      }}
                    >
                      {getShotTypeLabel(row.shot.shotType)}
                    </span>
                  </td>
                  <td className="px-2 py-2.5" style={{ color: DESIGN_TOKENS.textSecondary }}>
                    {getCameraMovementLabel(row.shot.cameraMovement)}
                  </td>
                  <td className="px-2 py-2.5 font-mono text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>
                    {row.shot.duration || "—"}
                  </td>
                  <td className="px-2 py-2.5 max-w-[150px]">
                    {row.shot.dialogue ? (
                      <div className="flex items-center gap-1">
                        <Type size={10} style={{ color: DESIGN_TOKENS.textMuted }} />
                        <span className="truncate text-[10px]" style={{ color: DESIGN_TOKENS.textSecondary }}>
                          {row.shot.dialogue}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[10px] opacity-30">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-1">
                      {StatusIcon && <StatusIcon size={12} color={status.color} />}
                      <span className="text-[10px]" style={{ color: status.color }}>
                        {status.label}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-2.5">
                    {row.shot.generatedImageUrl || row.nodeData.resultUrl ? (
                      <div className="relative h-8 w-12 overflow-hidden rounded">
                        <img
                          src={row.shot.generatedImageUrl || row.nodeData.resultUrl}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    ) : row.shot.generationStatus === "generating" || row.shot.generationStatus === "retrying" ? (
                      <Loader2 size={14} className="animate-spin" style={{ color: DESIGN_TOKENS.textMuted }} />
                    ) : (
                      <span className="text-[10px] opacity-30">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onRunShot?.(row.nodeId)
                      }}
                      className="rounded p-1 transition hover:bg-white/10"
                      title="生成画面"
                    >
                      <Play size={12} style={{ color: DESIGN_TOKENS.textSecondary }} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
})

// ============================================================================
// Sub-components
// ============================================================================

function ShotListHeader({
  totalShots,
  completedShots,
  failedShots,
  viewMode,
  onViewModeChange,
  onExportJianying,
  onExportScript,
}: {
  totalShots: number
  completedShots: number
  failedShots: number
  viewMode: ShotListViewMode
  onViewModeChange: (m: ShotListViewMode) => void
  onExportJianying?: () => void
  onExportScript?: () => void
}) {
  return (
    <div
      className="flex items-center justify-between px-3 py-2"
      style={{ borderBottom: `1px solid ${DESIGN_TOKENS.border}` }}
    >
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium" style={{ color: DESIGN_TOKENS.text }}>
          分镜列表
        </span>
        <span className="text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>
          共 {totalShots} 镜 · 已完成 {completedShots} · 失败 {failedShots}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        {onExportScript && (
          <button
            onClick={onExportScript}
            className="flex items-center gap-1 rounded px-2 py-1 text-[10px] transition hover:bg-white/10"
            style={{ color: DESIGN_TOKENS.textSecondary }}
            title="导出 FFmpeg 合成脚本"
          >
            <FileDown size={11} />
            合成脚本
          </button>
        )}
        {onExportJianying && (
          <button
            onClick={onExportJianying}
            className="flex items-center gap-1 rounded px-2 py-1 text-[10px] transition hover:bg-white/10"
            style={{ color: DESIGN_TOKENS.textSecondary }}
            title="导出剪映草稿"
          >
            <Clapperboard size={11} />
            剪映
          </button>
        )}
        <div className="mx-1 h-3 w-px bg-white/10" />
        <button
          onClick={() => onViewModeChange("table")}
          className="rounded p-1 transition"
          style={{
            backgroundColor: viewMode === "table" ? "rgba(255,255,255,0.1)" : "transparent",
            color: viewMode === "table" ? DESIGN_TOKENS.text : DESIGN_TOKENS.textMuted,
          }}
          title="表格视图"
        >
          <ArrowUpDown size={12} />
        </button>
        <button
          onClick={() => onViewModeChange("grid")}
          className="rounded p-1 transition"
          style={{
            backgroundColor: viewMode === "grid" ? "rgba(255,255,255,0.1)" : "transparent",
            color: viewMode === "grid" ? DESIGN_TOKENS.text : DESIGN_TOKENS.textMuted,
          }}
          title="网格视图"
        >
          <Grid3X3 size={12} />
        </button>
      </div>
    </div>
  )
}

function ShotCard({
  row,
  isSelected,
  onSelect,
  onRun,
}: {
  row: ShotRow
  isSelected: boolean
  onSelect: () => void
  onRun: () => void
}) {
  const status = getStatusBadge(row.shot.generationStatus)
  const StatusIcon = status.icon
  const hasImage = Boolean(row.shot.generatedImageUrl || row.nodeData.resultUrl)

  return (
    <div
      onClick={onSelect}
      className="cursor-pointer overflow-hidden rounded-lg transition hover:ring-1"
      style={{
        backgroundColor: "rgba(255,255,255,0.03)",
        border: `1px solid ${isSelected ? DESIGN_TOKENS.borderAccent : DESIGN_TOKENS.border}`,
        outlineColor: DESIGN_TOKENS.borderAccent,
      }}
    >
      <div className="relative aspect-video bg-black/20">
        {hasImage ? (
          <img
            src={row.shot.generatedImageUrl || row.nodeData.resultUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center" style={{ color: DESIGN_TOKENS.textMuted }}>
            <ImageIcon size={20} strokeWidth={1.2} />
          </div>
        )}
        <div
          className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded px-1 py-0.5 text-[9px]"
          style={{ backgroundColor: "rgba(0,0,0,0.6)", color: status.color }}
        >
          {StatusIcon && <StatusIcon size={9} />}
          {status.label}
        </div>
        {!hasImage && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRun()
            }}
            className="absolute right-1.5 top-1.5 rounded-full bg-black/50 p-1 transition hover:bg-black/70"
          >
            <Play size={10} color="white" />
          </button>
        )}
      </div>
      <div className="p-2">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>
            {String(row.shot.order ?? 0).padStart(2, "0")}
          </span>
          <span className="truncate text-[11px] font-medium" style={{ color: DESIGN_TOKENS.text }}>
            {row.shot.title || `Shot ${row.shot.order ?? 0}`}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <span
            className="rounded px-1 py-0.5 text-[9px]"
            style={{ backgroundColor: "rgba(255,255,255,0.06)", color: DESIGN_TOKENS.textMuted }}
          >
            {getShotTypeLabel(row.shot.shotType)}
          </span>
          <span className="text-[9px]" style={{ color: DESIGN_TOKENS.textMuted }}>
            {getCameraMovementLabel(row.shot.cameraMovement)}
          </span>
        </div>
      </div>
    </div>
  )
}

function Th({ label, width }: { label: string; width?: string }) {
  return (
    <th
      className="px-2 py-2 text-[10px] font-medium uppercase tracking-wider"
      style={{ color: DESIGN_TOKENS.textMuted, width }}
    >
      {label}
    </th>
  )
}

function SortableTh({
  label,
  sortKey,
  active,
  dir,
  onSort,
  width,
}: {
  label: string
  sortKey: ShotListSortKey
  active: ShotListSortKey
  dir: ShotListSortDirection
  onSort: (k: ShotListSortKey) => void
  width?: string
}) {
  const isActive = active === sortKey
  return (
    <th
      className="cursor-pointer px-2 py-2 text-[10px] font-medium uppercase tracking-wider transition hover:text-white/70"
      style={{ color: isActive ? DESIGN_TOKENS.textSecondary : DESIGN_TOKENS.textMuted, width }}
      onClick={() => onSort(sortKey)}
    >
      <div className="flex items-center gap-0.5">
        {label}
        {isActive && (
          <ArrowUpDown size={9} className={dir === "desc" ? "rotate-180" : ""} />
        )}
      </div>
    </th>
  )
}
