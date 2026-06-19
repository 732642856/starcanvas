"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Canvas as FabricCanvas, Rect, Textbox, FabricImage } from "fabric"
import { X, Type, Square, Circle, Trash2, Download, ImagePlus } from "lucide-react"

interface PosterEditorModalProps {
  imageUrl: string
  onSave: (dataUrl: string) => void
  onClose: () => void
}

export default function PosterEditorModal({ imageUrl, onSave, onClose }: PosterEditorModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fabricRef = useRef<FabricCanvas | null>(null)
  const [selectedCount, setSelectedCount] = useState(0)

  // Initialize Fabric canvas
  useEffect(() => {
    if (!canvasRef.current || fabricRef.current) return

    const canvas = new FabricCanvas(canvasRef.current, {
      width: 800,
      height: 600,
      backgroundColor: "#1a1a2e",
    })
    fabricRef.current = canvas

    // Load background image
    FabricImage.fromURL(imageUrl, { crossOrigin: "anonymous" }).then((img) => {
      const scale = Math.min(800 / (img.width || 800), 600 / (img.height || 600))
      img.set({
        scaleX: scale,
        scaleY: scale,
        left: (800 - (img.width || 800) * scale) / 2,
        top: (600 - (img.height || 600) * scale) / 2,
        selectable: false,
        evented: false,
      })
      canvas.add(img)
      canvas.sendObjectToBack(img)
      canvas.renderAll()
    }).catch(() => {
      // If image fails to load, just use blank canvas
    })

    canvas.on("selection:created", () => setSelectedCount(canvas.getActiveObjects().length))
    canvas.on("selection:updated", () => setSelectedCount(canvas.getActiveObjects().length))
    canvas.on("selection:cleared", () => setSelectedCount(0))

    return () => {
      canvas.dispose()
      fabricRef.current = null
    }
  }, [imageUrl])

  // Add text
  const addText = useCallback(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    const text = new Textbox("双击编辑文字", {
      left: 200,
      top: 250,
      fontSize: 32,
      fontFamily: "sans-serif",
      fill: "#ffffff",
      width: 300,
      editable: true,
    })
    canvas.add(text)
    canvas.setActiveObject(text)
    canvas.renderAll()
  }, [])

  // Add rectangle
  const addRect = useCallback(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    const rect = new Rect({
      left: 300,
      top: 200,
      width: 200,
      height: 100,
      fill: "rgba(168, 85, 247, 0.3)",
      stroke: "#a855f7",
      strokeWidth: 2,
      rx: 8,
      ry: 8,
    })
    canvas.add(rect)
    canvas.setActiveObject(rect)
    canvas.renderAll()
  }, [])

  // Delete selected
  const deleteSelected = useCallback(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    const active = canvas.getActiveObjects()
    active.forEach((obj) => canvas.remove(obj))
    canvas.discardActiveObject()
    canvas.renderAll()
    setSelectedCount(0)
  }, [])

  // Export
  const handleSave = useCallback(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    const dataUrl = canvas.toDataURL({ format: "png", multiplier: 2 })
    onSave(dataUrl)
  }, [onSave])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.85)" }}>
      <div className="flex flex-col rounded-2xl overflow-hidden shadow-2xl" style={{ backgroundColor: "#18181b", border: "1px solid rgba(255,255,255,0.08)", width: 900, maxHeight: "90vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <span className="text-sm font-semibold" style={{ color: "#e4e4e7" }}>海报编辑器</span>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-white/5 transition-colors">
            <X size={18} style={{ color: "#71717a" }} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1 px-4 py-2 border-b" style={{ borderColor: "rgba(255,255,255,0.06)", backgroundColor: "rgba(255,255,255,0.02)" }}>
          <button onClick={addText} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs hover:bg-white/5 transition-colors" style={{ color: "#a1a1aa" }} title="添加文字">
            <Type size={14} /> 文字
          </button>
          <button onClick={addRect} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs hover:bg-white/5 transition-colors" style={{ color: "#a1a1aa" }} title="添加矩形">
            <Square size={14} /> 矩形
          </button>
          {selectedCount > 0 && (
            <button onClick={deleteSelected} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs hover:bg-white/5 transition-colors" style={{ color: "#f87171" }} title="删除选中">
              <Trash2 size={14} /> 删除
            </button>
          )}
          <div className="flex-1" />
          <button onClick={handleSave} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors" style={{ backgroundColor: "rgba(168,85,247,0.15)", color: "#a855f7" }}>
            <Download size={14} /> 保存
          </button>
        </div>

        {/* Canvas */}
        <div className="flex-1 flex items-center justify-center p-4" style={{ backgroundColor: "#0f0f13" }}>
          <canvas ref={canvasRef} className="rounded-lg shadow-lg" style={{ border: "1px solid rgba(255,255,255,0.06)" }} />
        </div>
      </div>
    </div>
  )
}
