/**
 * ColorGradePanel — 色彩分级面板（基于 rgb-curve MIT）
 *
 * 提供 Master / R / G / B 四通道 RGB 曲线交互式调整 + 6 种电影级预设。
 * 支持实时 LUT 输出和 AI prompt 生成。
 *
 * 对标 Lightroom / Premiere Pro 色彩分级 + 小云雀 2.0 100+ 影视级画风库。
 */
"use client"

import React, { useCallback, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { RGBCurve, type CurveChangeData, type RGBCurveRef } from "@/vendor/rgb-curve"
import { X, Palette, Check, Copy, RotateCcw, Sparkles } from "lucide-react"

// ── 类型 ──────────────────────────────────────────────

export interface ColorGradeProfile {
  name: string
  nameCN: string
  curves: {
    master: [number, number][]
    red: [number, number][]
    green: [number, number][]
    blue: [number, number][]
  }
  sdPromptSuffix: string
}

export interface ColorGradePanelProps {
  isOpen: boolean
  onClose: () => void
  selectedNodeId?: string | null
  onApplyToNode?: (nodeId: string, promptSuffix: string) => void
}

// ── 6 种电影级预设曲线 ────────────────────────────────

const PRESETS: ColorGradeProfile[] = [
  {
    name: "default",
    nameCN: "默认",
    curves: {
      master: [[0,0],[255,255]],
      red: [[0,0],[255,255]],
      green: [[0,0],[255,255]],
      blue: [[0,0],[255,255]],
    },
    sdPromptSuffix: "natural color grade, balanced contrast",
  },
  {
    name: "film",
    nameCN: "胶片",
    curves: {
      master: [[0,5],[64,60],[128,128],[192,196],[255,250]],
      red: [[0,10],[128,130],[255,248]],
      green: [[0,8],[64,60],[128,128],[192,196],[255,252]],
      blue: [[0,2],[64,68],[128,128],[192,188],[255,248]],
    },
    sdPromptSuffix: "cinematic film look, Kodak Portra color grade, lifted blacks, warm highlights, filmic S-curve contrast",
  },
  {
    name: "cyberpunk",
    nameCN: "赛博朋克",
    curves: {
      master: [[0,0],[32,10],[128,128],[224,240],[255,255]],
      red: [[0,0],[64,48],[128,128],[192,208],[255,255]],
      green: [[0,0],[64,72],[128,128],[192,184],[255,255]],
      blue: [[0,0],[64,88],[128,128],[192,168],[255,255]],
    },
    sdPromptSuffix: "cyberpunk color grade, neon blue and magenta tones, crushed blacks, high contrast, Blade Runner aesthetic",
  },
  {
    name: "vintage",
    nameCN: "复古",
    curves: {
      master: [[0,10],[64,52],[128,128],[192,200],[255,248]],
      red: [[0,15],[128,135],[255,245]],
      green: [[0,8],[64,52],[128,130],[192,200],[255,250]],
      blue: [[0,5],[64,56],[128,128],[192,200],[255,255]],
    },
    sdPromptSuffix: "vintage 1970s color grade, faded warm tones, analog film grain, sepia undertones",
  },
  {
    name: "japanese",
    nameCN: "日系清新",
    curves: {
      master: [[0,8],[64,72],[128,135],[192,200],[255,248]],
      red: [[0,5],[128,132],[255,250]],
      green: [[0,10],[64,72],[128,138],[192,202],[255,245]],
      blue: [[0,15],[64,72],[128,135],[192,195],[255,240]],
    },
    sdPromptSuffix: "Japanese film aesthetic, soft pastel colors, overexposed highlights, fresh clean look, Fuji film simulation",
  },
  {
    name: "bw",
    nameCN: "黑白电影",
    curves: {
      master: [[0,0],[32,28],[128,128],[224,226],[255,255]],
      red: [[0,0],[255,255]],
      green: [[0,0],[255,255]],
      blue: [[0,0],[255,255]],
    },
    sdPromptSuffix: "black and white cinematic, high contrast monochrome, Ansel Adams zone system, silver gelatin print",
  },
]

// ── 辅助：根据 LUT 分析生成色彩描述 ────────────────────

function analyzeLUT(lut: CurveChangeData["lut"]): string {
  const countDiff = (ch: Uint8Array): { raised: number; lowered: number } => {
    let raised = 0, lowered = 0
    for (let i = 0; i < 256; i++) {
      if (ch[i] > i + 5) raised++
      else if (ch[i] < i - 5) lowered++
    }
    return { raised, lowered }
  }

  const master = countDiff(lut.master)
  const red = countDiff(lut.red)
  const green = countDiff(lut.green)
  const blue = countDiff(lut.blue)

  const parts: string[] = []

  // 整体对比度
  if (master.raised > 60 && master.lowered > 60)
    parts.push("S-curve contrast, deep blacks and bright highlights")
  else if (master.raised > 60)
    parts.push("lifted midtones, airy feel")
  else if (master.lowered > 60)
    parts.push("crushed shadows, high contrast punch")

  // 色偏检测
  if (red.raised > 30) parts.push("warm red push, golden skin tones")
  if (blue.raised > 30) parts.push("cool blue shift, cyan atmosphere")
  if (green.raised > 30) parts.push("green tint in midtones")
  if (red.lowered > 30) parts.push("reduced red saturation, teal bias")
  if (blue.lowered > 30) parts.push("blue suppression, warm amber cast")

  if (parts.length === 0) return "neutral color balance, linear tone curve"
  return parts.join(", ") + "."
}

// ── 组件 ──────────────────────────────────────────────

export function ColorGradePanel({
  isOpen,
  onClose,
  selectedNodeId,
  onApplyToNode,
}: ColorGradePanelProps) {
  const [activePreset, setActivePreset] = useState<string>("film")
  const [applied, setApplied] = useState(false)
  const [lastChange, setLastChange] = useState<CurveChangeData | null>(null)
  const [isCustomEdit, setIsCustomEdit] = useState(false)
  const curveRef = useRef<RGBCurveRef>(null)

  const current = useMemo(
    () => PRESETS.find((p) => p.name === activePreset) ?? PRESETS[0],
    [activePreset],
  )

  /** 从 LUT 数据生成更精确的色彩 prompt */
  const livePrompt = useMemo(() => {
    if (isCustomEdit && lastChange) {
      return analyzeLUT(lastChange.lut)
    }
    return current.sdPromptSuffix
  }, [isCustomEdit, lastChange, current])

  /** 应用预设曲线 */
  const applyPreset = useCallback((presetName: string) => {
    const preset = PRESETS.find((p) => p.name === presetName) ?? PRESETS[0]
    setActivePreset(presetName)
    setIsCustomEdit(false)

    // 通过 ref 设置曲线控制点
    const toPoints = (pts: [number, number][]) =>
      pts.map(([x, y]) => ({ x, y }))
    curveRef.current?.setPoints({
      master: toPoints(preset.curves.master),
      red: toPoints(preset.curves.red),
      green: toPoints(preset.curves.green),
      blue: toPoints(preset.curves.blue),
    })
  }, [])

  /** 曲线变化回调 */
  const handleCurveChange = useCallback((data: CurveChangeData) => {
    setLastChange(data)
    setIsCustomEdit(true)
  }, [])

  /** 应用到节点 */
  const handleApply = useCallback(() => {
    if (selectedNodeId && onApplyToNode) {
      onApplyToNode(selectedNodeId, `Color grade: ${livePrompt}`)
      setApplied(true)
      setTimeout(() => setApplied(false), 2000)
    }
  }, [selectedNodeId, onApplyToNode, livePrompt])

  /** 复制 prompt */
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(livePrompt)
  }, [livePrompt])

  /** 重置所有通道 */
  const handleReset = () => {
    curveRef.current?.reset()
    setIsCustomEdit(false)
    applyPreset("default")
  }

  if (!isOpen) return null

  return createPortal(
    <div className="fixed top-16 right-4 z-[90] flex flex-col gap-3">
      {/* 主面板 */}
      <div data-testid="color-grade-panel" className="bg-[var(--color-bg-panel)] backdrop-blur-xl rounded-xl border border-[var(--color-border)] shadow-2xl overflow-hidden min-w-[340px]">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
            <Palette size={16} />
            色彩分级
            {isCustomEdit && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-accent)]/20 text-[var(--color-accent)]">
                自定义
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleReset}
              className="p-1.5 rounded-lg hover:bg-[var(--color-hover)] transition-colors text-[var(--color-text-secondary)]"
              title="重置所有通道"
            >
              <RotateCcw size={14} />
            </button>
            <button
              onClick={handleApply}
              disabled={!selectedNodeId}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                applied
                  ? "bg-green-500/20 text-green-400"
                  : "bg-[var(--color-accent)] hover:brightness-110 text-white disabled:opacity-40 disabled:cursor-not-allowed"
              }`}
            >
              {applied ? <Check size={14} /> : <Sparkles size={14} />}
              {applied ? "已应用" : "应用"}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-[var(--color-hover)] transition-colors text-[var(--color-text-secondary)]"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* 预设选择器 */}
        <div className="px-3 pt-3">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => applyPreset(preset.name)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  activePreset === preset.name && !isCustomEdit
                    ? "bg-[var(--color-accent)] text-white"
                    : "bg-[var(--color-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                }`}
              >
                {preset.nameCN}
              </button>
            ))}
          </div>
        </div>

        {/* 交互式 RGB 曲线编辑器 */}
        <div className="p-3">
          <div className="rounded-lg overflow-hidden border border-[var(--color-border)]">
            <RGBCurve
              ref={curveRef}
              width={310}
              height={280}
              onChange={handleCurveChange}
              styles={{
                container: {
                  background: "var(--color-bg)",
                },
                canvasWrapper: {
                  background: "#0d0d0d",
                  borderRadius: 0,
                },
                grid: {
                  color: "#2a2a2a",
                  lineWidth: 1,
                  subdivisions: 4,
                  showDiagonal: true,
                  diagonalColor: "#333333",
                },
                curve: {
                  master: {
                    color: "#e0e0e0",
                    width: 2,
                    shadowColor: "rgba(255, 255, 255, 0.15)",
                    shadowBlur: 3,
                  },
                  red: {
                    color: "#ff6b6b",
                    width: 2,
                    shadowColor: "rgba(255, 107, 107, 0.25)",
                    shadowBlur: 3,
                  },
                  green: {
                    color: "#51cf66",
                    width: 2,
                    shadowColor: "rgba(81, 207, 102, 0.25)",
                    shadowBlur: 3,
                  },
                  blue: {
                    color: "#339af0",
                    width: 2,
                    shadowColor: "rgba(51, 154, 240, 0.25)",
                    shadowBlur: 3,
                  },
                },
                controlPoint: {
                  radius: 5,
                  fill: "#ffffff",
                  stroke: "#000000",
                  strokeWidth: 2,
                  activeFill: "#ffd43b",
                  activeStroke: "#000000",
                  hoverScale: 1.2,
                },
                tabs: {
                  background: "transparent",
                  gap: 2,
                  tab: {
                    padding: "6px 10px",
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#666666",
                    background: "transparent",
                    hoverBackground: "var(--color-hover)",
                    activeColor: "#ffffff",
                    activeBackground: "var(--color-hover)",
                  },
                },
              }}
            />
          </div>

          {/* 操作提示 */}
          <div className="mt-2 flex items-center gap-3 text-[10px] text-[var(--color-text-tertiary)]">
            <span>点击曲线添加控制点</span>
            <span>拖动调整曲线</span>
            <span>双击删除点</span>
          </div>
        </div>

        {/* Prompt 预览 */}
        <div className="px-3 pb-3">
          <div className="bg-[var(--color-bg)] rounded-lg p-2.5 border border-[var(--color-border)]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">
                色彩 Prompt
              </span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-[10px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
              >
                <Copy size={10} />
                复制
              </button>
            </div>
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
              {livePrompt}
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default ColorGradePanel
