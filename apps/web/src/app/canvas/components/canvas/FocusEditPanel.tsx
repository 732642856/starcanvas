"use client"

import { memo, useRef, useCallback, useState } from "react"
import { MaskEditor } from "react-canvas-masker"
import "react-canvas-masker/dist/style.css"
import { Loader2, Sparkles, RotateCcw, ZoomIn, ZoomOut } from "lucide-react"
import { DESIGN_TOKENS } from "../../styles/designSystem"

interface FocusEditPanelProps {
  imageUrl: string
  onApplyEdit: (originalUrl: string, maskDataUrl: string, prompt: string) => void | Promise<void>
  onClose?: () => void
  isApplying?: boolean
  errorMessage?: string
}

export const FocusEditPanel = memo(function FocusEditPanel({
  imageUrl,
  onApplyEdit,
  onClose,
  isApplying = false,
  errorMessage,
}: FocusEditPanelProps) {
  const editorRef = useRef<any>(null)
  const [prompt, setPrompt] = useState("")
  const [cursorSize, setCursorSize] = useState(20)
  const [isDrawing, setIsDrawing] = useState(false)

  const handleDrawingChange = useCallback((drawing: boolean) => {
    setIsDrawing(drawing)
  }, [])

  const handleMaskChange = useCallback((_mask: string) => {
    // mask is stored in editorRef
  }, [])

  const handleApply = useCallback(() => {
    if (!editorRef.current) return
    const canvas = editorRef.current.maskCanvas
    if (!canvas) return
    const maskDataUrl = canvas.toDataURL()
    void onApplyEdit(imageUrl, maskDataUrl, prompt)
  }, [imageUrl, prompt, onApplyEdit])

  const handleClear = useCallback(() => {
    editorRef.current?.clear?.()
  }, [])

  return (
    <div className="rounded-xl border p-2 space-y-2" style={{ borderColor: DESIGN_TOKENS.border, backgroundColor: "rgba(255,255,255,0.02)" }}>
      {/* Header */}
      <div className="flex items-center justify-between text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>
        <span className="flex items-center gap-1">
          <Sparkles size={11} />
          焦点编辑（局部精修）
        </span>
        <div className="flex gap-1">
          <button onClick={() => editorRef.current?.zoomIn?.()} className="nodrag p-1 rounded hover:bg-white/10">
            <ZoomIn size={12} />
          </button>
          <button onClick={() => editorRef.current?.zoomOut?.()} className="nodrag p-1 rounded hover:bg-white/10">
            <ZoomOut size={12} />
          </button>
          <button onClick={handleClear} className="nodrag p-1 rounded hover:bg-white/10">
            <RotateCcw size={12} />
          </button>
        </div>
      </div>

      {/* Mask Editor */}
      <div className="rounded-lg overflow-hidden" style={{ borderColor: DESIGN_TOKENS.border, border: "1px solid" }}>
        <MaskEditor
          canvasRef={editorRef}
          src={imageUrl}
          cursorSize={cursorSize}
          onCursorSizeChange={setCursorSize}
          onDrawingChange={handleDrawingChange}
          onMaskChange={handleMaskChange}
          maskOpacity={0.4}
          maskColor="#a855f7"
        />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <label className="text-[10px] whitespace-nowrap" style={{ color: DESIGN_TOKENS.textMuted }}>
          笔刷: {cursorSize}px
        </label>
        <input
          type="range"
          min={5}
          max={100}
          value={cursorSize}
          onChange={(e) => setCursorSize(Number(e.target.value))}
          className="nodrag flex-1 h-1"
        />
      </div>

      {/* Prompt Input */}
      <input
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="描述要修改的内容（如：把裙子改成红色）"
        className="nodrag w-full rounded-lg border bg-transparent px-2 py-1.5 text-[11px] text-white/70 placeholder:text-white/25 outline-none"
        style={{ borderColor: DESIGN_TOKENS.border }}
      />

      {errorMessage && (
        <div className="rounded-lg border border-red-400/20 bg-red-500/10 px-2 py-1 text-[10px] leading-relaxed text-red-200/80">
          {errorMessage}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleApply}
          disabled={!prompt.trim() || isDrawing || isApplying}
          className="nodrag flex-1 flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] transition-colors hover:bg-white/5 disabled:opacity-40"
          style={{ borderColor: DESIGN_TOKENS.accentHover, color: DESIGN_TOKENS.accentHover, backgroundColor: "rgba(99,102,241,0.06)" }}
        >
          {isApplying ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
          {isApplying ? "精修中..." : "应用修改"}
        </button>
        {onClose && (
          <button onClick={onClose} className="nodrag rounded-lg border px-2 py-1.5 text-[11px]" style={{ borderColor: DESIGN_TOKENS.border, color: DESIGN_TOKENS.textMuted }}>
            取消
          </button>
        )}
      </div>
    </div>
  )
})

export default FocusEditPanel
