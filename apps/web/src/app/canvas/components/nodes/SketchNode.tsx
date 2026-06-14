// ============================================================================
// SketchNode — lightweight hand-drawing node for storyboard ideation
// Uses native Pointer Events + Canvas to avoid heavy dependencies while keeping
// pressure-aware drawing data persisted in React Flow node data.
// ============================================================================
"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Download, Eraser, PenLine } from "lucide-react"
import { Handle, Position, NodeResizer, type NodeProps, useReactFlow } from "@xyflow/react"
import { pushUndo } from "../../StarCanvas"
import { DESIGN_TOKENS, ICON_CONFIG } from "../../styles/designSystem"
import type { CanvasNodeData, SketchPoint, SketchStroke } from "../canvas/types"

interface SketchNodeProps extends NodeProps {
  data: CanvasNodeData
}

const CANVAS_WIDTH = 520
const CANVAS_HEIGHT = 320
const DEFAULT_STROKE_COLOR = "#e5e7eb"
const DEFAULT_BACKGROUND = "#0f172a"

function getCanvasPoint(event: React.PointerEvent<HTMLCanvasElement>): SketchPoint {
  const rect = event.currentTarget.getBoundingClientRect()
  return {
    x: ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH,
    y: ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
    pressure: event.pressure > 0 ? event.pressure : 0.55,
    t: Date.now(),
  }
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: SketchStroke) {
  const [firstPoint, ...restPoints] = stroke.points
  if (!firstPoint) return

  ctx.save()
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  ctx.strokeStyle = stroke.color
  ctx.lineWidth = stroke.size * Math.max(0.35, firstPoint.pressure ?? 0.55)
  ctx.beginPath()
  ctx.moveTo(firstPoint.x, firstPoint.y)

  for (const point of restPoints) {
    ctx.lineWidth = stroke.size * Math.max(0.35, point.pressure ?? 0.55)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(point.x, point.y)
  }

  ctx.closePath()
  ctx.restore()
}

function redrawCanvas(canvas: HTMLCanvasElement, strokes: SketchStroke[]) {
  const ctx = canvas.getContext("2d")
  if (!ctx) return

  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  ctx.fillStyle = DEFAULT_BACKGROUND
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  for (const stroke of strokes) {
    drawStroke(ctx, stroke)
  }
}

export const SketchNode = memo(function SketchNode({ id, data, selected }: SketchNodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const activeStrokeRef = useRef<SketchStroke | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const { setNodes, getNodes, getEdges } = useReactFlow()

  const strokes = useMemo(
    () => (Array.isArray(data.sketchStrokes) ? data.sketchStrokes : []),
    [data.sketchStrokes],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    redrawCanvas(canvas, strokes)
  }, [strokes])

  const commitStrokes = useCallback((nextStrokes: SketchStroke[]) => {
    const canvas = canvasRef.current
    const sketchImageDataUrl = canvas?.toDataURL("image/png")

    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                sketchStrokes: nextStrokes,
                sketchImageDataUrl,
                imageUrl: sketchImageDataUrl,
                updatedAt: Date.now(),
              },
            }
          : node,
      ),
    )
  }, [id, setNodes])

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)

    pushUndo({ nodes: getNodes(), edges: getEdges() }, "sketch")

    const point = getCanvasPoint(event)
    const stroke: SketchStroke = {
      id: `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      color: DEFAULT_STROKE_COLOR,
      size: 3.5,
      points: [point],
    }

    activeStrokeRef.current = stroke
    setIsDrawing(true)
  }, [])

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const activeStroke = activeStrokeRef.current
    const canvas = canvasRef.current
    if (!activeStroke || !canvas) return

    event.preventDefault()
    event.stopPropagation()

    const point = getCanvasPoint(event)
    activeStroke.points.push(point)

    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const previousPoint = activeStroke.points[activeStroke.points.length - 2]
    if (!previousPoint) return

    ctx.save()
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.strokeStyle = activeStroke.color
    ctx.lineWidth = activeStroke.size * Math.max(0.35, point.pressure ?? 0.55)
    ctx.beginPath()
    ctx.moveTo(previousPoint.x, previousPoint.y)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
    ctx.restore()
  }, [])

  const finishStroke = useCallback((event?: React.PointerEvent<HTMLCanvasElement>) => {
    if (event) {
      event.preventDefault()
      event.stopPropagation()
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    }

    const activeStroke = activeStrokeRef.current
    if (!activeStroke) return

    activeStrokeRef.current = null
    setIsDrawing(false)

    if (activeStroke.points.length < 2) return
    commitStrokes([...strokes, activeStroke])
  }, [commitStrokes, strokes])

  const handleClear = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const canvas = canvasRef.current
    if (canvas) redrawCanvas(canvas, [])
    commitStrokes([])
  }, [commitStrokes])

  const handleDownload = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const canvas = canvasRef.current
    if (!canvas) return

    const link = document.createElement("a")
    link.href = canvas.toDataURL("image/png")
    link.download = `${data.title || "storyboard-sketch"}.png`
    document.body.appendChild(link)
    link.click()
    link.remove()
  }, [data.title])

  return (
    <>
      {selected && (
        <NodeResizer
          minWidth={420}
          minHeight={300}
          handleStyle={{ background: DESIGN_TOKENS.nodeHandle, border: "2px solid rgba(255,255,255,0.5)", borderRadius: "4px" }}
          lineStyle={{ stroke: DESIGN_TOKENS.nodeHandle, strokeWidth: 2, strokeDasharray: "6 3" }}
        />
      )}

      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !rounded-sm !border-2 !border-white/50 !bg-indigo-400" />
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !rounded-sm !border-2 !border-white/50 !bg-indigo-500" />

      <div
        className={`overflow-hidden rounded-2xl border transition-all ${selected ? "shadow-lg shadow-indigo-500/20" : "hover:border-white/20"}`}
        style={{
          width: data.displayWidth ?? 560,
          minHeight: data.displayHeight ?? 430,
          backgroundColor: DESIGN_TOKENS.panelSolid,
          borderColor: selected ? "rgba(129, 140, 248, 0.65)" : "rgba(129, 140, 248, 0.22)",
          boxShadow: selected ? DESIGN_TOKENS.shadowNode : "none",
        }}
      >
        <div className="flex items-center justify-between border-b border-white/10 bg-black/20 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-400/10">
              <PenLine size={16} strokeWidth={ICON_CONFIG.strokeWidth} className="text-indigo-200" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[10px] font-medium uppercase tracking-[0.18em] text-indigo-200/75">Sketch</p>
              <p className="truncate text-sm font-medium text-white/90">{data.title || "手绘分镜"}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="nodrag nopan flex h-7 w-7 items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/10 hover:text-white/80"
              title="导出 PNG"
              onClick={handleDownload}
            >
              <Download size={13} strokeWidth={ICON_CONFIG.strokeWidth} />
            </button>
            <button
              type="button"
              className="nodrag nopan flex h-7 w-7 items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/10 hover:text-white/80"
              title="清空草图"
              onClick={handleClear}
            >
              <Eraser size={13} strokeWidth={ICON_CONFIG.strokeWidth} />
            </button>
          </div>
        </div>

        <div className="space-y-2 p-3">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="nodrag nopan nowheel block w-full rounded-xl border border-white/10"
            style={{
              aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}`,
              cursor: "crosshair",
              touchAction: "none",
              backgroundColor: DEFAULT_BACKGROUND,
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishStroke}
            onPointerCancel={finishStroke}
            onPointerLeave={(event) => {
              if (isDrawing) finishStroke(event)
            }}
          />
          <div className="flex items-center justify-between text-[10px] text-white/35">
            <span>支持鼠标 / 触控笔压感，自动保存到节点数据</span>
            <span>{strokes.length} strokes</span>
          </div>
        </div>
      </div>
    </>
  )
})

export default SketchNode
