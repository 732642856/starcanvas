"use client"

import { memo } from "react"
import { Handle, Position, NodeResizer, type NodeProps } from "@xyflow/react"
import { Grid3X3, Images, Loader2 } from "lucide-react"
import type { CanvasNodeData } from "../canvas/types"
import { DESIGN_TOKENS } from "../../styles/designSystem"

interface StoryboardGridNodeProps extends NodeProps {
  data: CanvasNodeData
}

export const StoryboardGridNode = memo(function StoryboardGridNode({ id, data, selected, width, height }: StoryboardGridNodeProps) {
  const grid = data.storyboardGrid
  const nodeWidth = typeof width === "number" ? width : data.displayWidth || 360
  const nodeHeight = typeof height === "number" ? height : data.displayHeight || 360
  const isGenerating = grid?.status === "generating"
  const shotStates = grid?.shotStates ?? []
  const readyCount = shotStates.filter((shot) => shot.status === "ready").length
  const failedCount = shotStates.filter((shot) => shot.status === "failed").length
  const generatingCount = shotStates.filter((shot) => shot.status === "generating").length
  const totalCount = grid?.shotNodeIds?.length || shotStates.length || (grid?.maxShots || 0) || 0
  const gridColumns = grid?.columns || (totalCount <= 1 ? 1 : totalCount <= 2 ? 2 : 3)
  const isWaitingForFirstImage = !isGenerating && !grid?.outputImageUrl && readyCount === 0 && failedCount === 0
  const statusLabel = isGenerating
    ? "合成中"
    : grid?.status === "done"
      ? "已输出"
      : grid?.status === "error"
        ? failedCount > 0 ? `${failedCount} 个失败` : "等待镜头图"
        : isWaitingForFirstImage
          ? "等待镜头图"
          : `${readyCount}/${totalCount} 已出图`

  return (
    <>
      {selected && (
        <NodeResizer
          minWidth={320}
          minHeight={300}
          handleStyle={{ background: DESIGN_TOKENS.nodeHandle, border: "2px solid rgba(255,255,255,0.3)", borderRadius: "4px" }}
          lineStyle={{ stroke: DESIGN_TOKENS.nodeHandle, strokeWidth: 1.5, strokeDasharray: "6 3" }}
        />
      )}
      <Handle type="target" position={Position.Left} className="!bg-slate-400 !h-2.5 !w-2.5 !rounded-sm !border !border-white/30" />
      <Handle type="source" position={Position.Right} className="!bg-slate-500 !h-2.5 !w-2.5 !rounded-sm !border !border-white/30" />

      <div
        className="flex flex-col overflow-hidden rounded-2xl border transition-all"
        style={{
          width: nodeWidth,
          height: nodeHeight,
          minWidth: 320,
          minHeight: 300,
          backgroundColor: DESIGN_TOKENS.panelSolid,
          borderColor: selected ? "rgba(148, 163, 184, 0.4)" : DESIGN_TOKENS.border,
          boxShadow: selected ? DESIGN_TOKENS.shadowNode : "none",
        }}
      >
        <div className="flex items-center justify-between border-b px-3 py-2" style={{ borderColor: DESIGN_TOKENS.border, backgroundColor: "rgba(0,0,0,0.18)" }}>
          <div className="flex items-center gap-2">
            <Grid3X3 size={14} strokeWidth={1.5} style={{ color: DESIGN_TOKENS.accentHover }} />
            <span className="text-xs" style={{ color: DESIGN_TOKENS.textSecondary }}>{grid?.title || data.title || "分镜合成预览"}</span>
          </div>
          <span className="text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>{statusLabel}</span>
        </div>

        <div className="border-b px-3 py-2" style={{ borderColor: DESIGN_TOKENS.border }}>
          <div className="flex items-center justify-between text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>
            <span>可合成镜头图 {readyCount}/{totalCount}</span>
            <span>{generatingCount > 0 ? `${generatingCount} 生成中` : failedCount > 0 ? `${failedCount} 失败` : grid?.outputImageUrl ? "已有合成图" : "等待合成"}</span>
          </div>
          {grid?.errorMessage && (
            <div className="mt-1 rounded-lg px-2 py-1.5 text-[11px] text-amber-200/80" style={{ backgroundColor: "rgba(245, 158, 11, 0.1)" }}>
              {grid.errorMessage}
            </div>
          )}
          {!grid?.errorMessage && !grid?.outputImageUrl && readyCount === 0 && (
            <div className="mt-1 rounded-lg px-2 py-1.5 text-[11px]" style={{ color: DESIGN_TOKENS.textMuted, backgroundColor: "rgba(148, 163, 184, 0.08)" }}>
              正在等待镜头图片生成。这个节点只是过程预览，最终会输出一张分镜合成图。
            </div>
          )}
        </div>

        <div className="grid min-h-0 flex-1 gap-1.5 p-3" style={{ gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` }}>
          {Array.from({ length: totalCount }).map((_, index) => {
            const shotState = shotStates[index]
            const image = shotState?.imageUrl
            const label = shotState?.order ? `镜头 ${String(shotState.order).padStart(2, "0")}` : `镜头 ${String(index + 1).padStart(2, "0")}`
            return (
              <div key={shotState?.shotNodeId || index} className="relative flex items-center justify-center overflow-hidden rounded-lg border bg-white/[0.03]" style={{ borderColor: DESIGN_TOKENS.border }}>
                {image ? (
                  <img src={image} alt={label} className="h-full w-full object-cover" />
                ) : shotState?.status === "generating" ? (
                  <div className="flex flex-col items-center gap-1 text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>
                    <Loader2 size={12} className="animate-spin" />
                    <span>{label}</span>
                  </div>
                ) : shotState?.status === "failed" ? (
                  <span className="px-1 text-center text-[10px] text-amber-200/80">{label}<br />失败</span>
                ) : (
                  <span className="text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>{label}</span>
                )}
                {shotState?.status && (
                  <span className="absolute right-1 top-1 rounded bg-black/45 px-1 text-[9px]" style={{ color: DESIGN_TOKENS.textMuted }}>
                    {shotState.status === "ready" ? "图" : shotState.status === "missing" ? "缺" : shotState.status === "generating" ? "生成" : "错"}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        <div className="shrink-0 flex items-center justify-end gap-2 border-t px-3 py-2" style={{ borderColor: DESIGN_TOKENS.border }}>
          <button
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors hover:bg-white/5 disabled:opacity-40"
            style={{ color: DESIGN_TOKENS.textSecondary }}
            disabled={isGenerating}
            onClick={() => window.dispatchEvent(new CustomEvent("starcanvas:generate-grid", { detail: { nodeId: id } }))}
          >
            {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <Images size={12} />}
            <span>输出分镜合成图</span>
          </button>
        </div>
      </div>
    </>
  )
})

export default StoryboardGridNode
