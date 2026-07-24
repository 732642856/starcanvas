/**
 * CinematicParamPanel — 影视级参数化控制面板（基于 leva）
 *
 * 对标本小云雀 2.0 的独立参数面板，提供 6 维滑块式精确控制：
 *   - 景别 (Shot Size)
 *   - 镜头运动 (Camera Movement)
 *   - 光线 (Lighting)
 *   - 色调 (Color Tone)
 *   - 景深 (Depth of Field)
 *   - 画幅比 (Aspect Ratio)
 *
 * 每项参数映射为 leva 滑块/选择器，同时有 Preview 区实时
 * 展示组合后的英文 Prompt，支持"应用到选中节点"。
 */
"use client"

import React, { useMemo } from "react"
import { createPortal } from "react-dom"
import { Leva, useControls, folder } from "leva"
import { X, Camera, Check, Sparkles, RotateCcw } from "lucide-react"
import { DESIGN_TOKENS } from "../../styles/designSystem"

// ── 类型 ──────────────────────────────────────────────

export interface CinematicParams {
  /** 景别（归一化值 0–1，对应 extreme close-up → extreme wide） */
  shotSize: number
  /** 镜头运动（0–1，对应 static → handheld） */
  cameraMovement: number
  /** 光线硬度（0–1，soft → hard） */
  lightingHardness: number
  /** 光线角度（0–180°，0=正面, 90=侧光, 180=逆光） */
  lightingAngle: number
  /** 色调温度（0–1，cool → warm） */
  colorTemperature: number
  /** 色调饱和度（0–1，desaturated → vivid） */
  colorSaturation: number
  /** 景深（0–1，deep focus → shallow bokeh） */
  depthOfField: number
  /** 画幅比 */
  aspectRatio: string
}

export interface CinematicParamPanelProps {
  isOpen: boolean
  onClose: () => void
  selectedNodeId?: string | null
  onApplyToNode?: (nodeId: string, prompt: string, params: CinematicParams) => void
}

// ── 默认值 ────────────────────────────────────────────

const DEFAULT_PARAMS: CinematicParams = {
  shotSize: 0.5,
  cameraMovement: 0.2,
  lightingHardness: 0.4,
  lightingAngle: 45,
  colorTemperature: 0.6,
  colorSaturation: 0.5,
  depthOfField: 0.3,
  aspectRatio: "16:9",
}

// ── 参数 → Prompt 映射 ────────────────────────────────

function paramsToPrompt(p: CinematicParams): string {
  const shotLabels = [
    "extreme close-up, macro detail shot",
    "close-up shot, facial emotion visible",
    "medium close-up, head and shoulders",
    "medium shot, waist up",
    "medium full shot, knees up",
    "full body shot, entire figure",
    "long shot, subject small in frame",
    "extreme wide shot, establishing view",
  ]
  const shotIdx = Math.round(p.shotSize * (shotLabels.length - 1))

  const moveLabels = [
    "locked-off static camera",
    "slight handheld float",
    "subtle dolly movement",
    "smooth tracking shot",
    "dynamic crane motion",
    "energetic handheld shake",
  ]
  const moveIdx = Math.round(p.cameraMovement * (moveLabels.length - 1))

  const lightHardness = p.lightingHardness < 0.33
    ? "soft diffused lighting"
    : p.lightingHardness < 0.66
    ? "balanced key light"
    : "hard dramatic lighting, strong shadows"

  const lightAngle =
    p.lightingAngle < 30
      ? "front-lit, flat illumination"
      : p.lightingAngle < 80
      ? "three-quarter lighting, gentle modeling"
      : p.lightingAngle < 120
      ? "side-lit, chiaroscuro effect"
      : "backlit, rim light, dramatic silhouette"

  const colorTemp = p.colorTemperature < 0.33
    ? "cool blue tones, clinical atmosphere"
    : p.colorTemperature < 0.66
    ? "neutral balanced white balance"
    : "warm golden tones, nostalgic feel"

  const colorSat = p.colorSaturation < 0.33
    ? "desaturated muted colors"
    : p.colorSaturation < 0.66
    ? "natural color saturation"
    : "vivid saturated colors, high chroma"

  const dofDesc = p.depthOfField < 0.33
    ? "deep focus, everything sharp"
    : p.depthOfField < 0.66
    ? "moderate depth of field, slight background blur"
    : "shallow depth of field, creamy bokeh"

  return [
    `${shotLabels[shotIdx]}.`,
    `${moveLabels[moveIdx]}.`,
    `${lightHardness}, ${lightAngle}.`,
    `${colorTemp}, ${colorSat}.`,
    `${dofDesc}.`,
    `Aspect ratio: ${p.aspectRatio}.`,
  ].join(" ")
}

// ── 组件 ──────────────────────────────────────────────

function CinematicParamPanelInner({
  isOpen,
  onClose,
  selectedNodeId,
  onApplyToNode,
}: CinematicParamPanelProps) {
  const [applied, setApplied] = React.useState(false)

  const params = useControls("影视参数", () => ({
    景别: {
      value: DEFAULT_PARAMS.shotSize,
      min: 0,
      max: 1,
      step: 0.01,
      label: "shot size",
    },
    镜头运动: {
      value: DEFAULT_PARAMS.cameraMovement,
      min: 0,
      max: 1,
      step: 0.01,
      label: "movement",
    },
    光线: folder({
      硬度: {
        value: DEFAULT_PARAMS.lightingHardness,
        min: 0,
        max: 1,
        step: 0.01,
        label: "hardness",
      },
      角度: {
        value: DEFAULT_PARAMS.lightingAngle,
        min: 0,
        max: 180,
        step: 1,
        label: "angle",
      },
    }),
    色调: folder({
      色温: {
        value: DEFAULT_PARAMS.colorTemperature,
        min: 0,
        max: 1,
        step: 0.01,
        label: "temperature",
      },
      饱和度: {
        value: DEFAULT_PARAMS.colorSaturation,
        min: 0,
        max: 1,
        step: 0.01,
        label: "saturation",
      },
    }),
    景深: {
      value: DEFAULT_PARAMS.depthOfField,
      min: 0,
      max: 1,
      step: 0.01,
      label: "depth of field",
    },
    画幅比: {
      value: DEFAULT_PARAMS.aspectRatio,
      options: ["16:9", "9:16", "4:3", "1:1", "21:9", "2.35:1"],
      label: "aspect ratio",
    },
  }))

  // 类型窄化（leva 返回的 input 值可能是 number | string）
  const cinematicParams: CinematicParams = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = params as any
    return {
      shotSize: (p["景别"] as number) ?? DEFAULT_PARAMS.shotSize,
      cameraMovement: (p["镜头运动"] as number) ?? DEFAULT_PARAMS.cameraMovement,
      lightingHardness: (p["硬度"] as number) ?? DEFAULT_PARAMS.lightingHardness,
      lightingAngle: (p["角度"] as number) ?? DEFAULT_PARAMS.lightingAngle,
      colorTemperature: (p["色温"] as number) ?? DEFAULT_PARAMS.colorTemperature,
      colorSaturation: (p["饱和度"] as number) ?? DEFAULT_PARAMS.colorSaturation,
      depthOfField: (p["景深"] as number) ?? DEFAULT_PARAMS.depthOfField,
      aspectRatio: (p["画幅比"] as string) ?? DEFAULT_PARAMS.aspectRatio,
    }
  }, [params])

  const combinedPrompt = useMemo(
    () => paramsToPrompt(cinematicParams),
    [cinematicParams],
  )

  const handleApply = () => {
    if (selectedNodeId && onApplyToNode) {
      onApplyToNode(selectedNodeId, combinedPrompt, cinematicParams)
      setApplied(true)
      setTimeout(() => setApplied(false), 2000)
    }
  }

  if (!isOpen) return null

  return createPortal(
    <div
      className="fixed top-16 right-4 z-[90] flex flex-col gap-3"
      data-testid="cinematic-param-panel"
    >
      {/* 自带的 leva 面板 */}
      <div
        className="bg-[var(--color-bg-panel)] backdrop-blur-xl rounded-xl border border-[var(--color-border)] shadow-2xl overflow-hidden min-w-[280px]"
        data-testid="cinematic-param-panel-shell"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
            <Camera size={16} />
            参数化控制
          </div>
          <div className="flex items-center gap-1">
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

        {/* Leva panel rendered here */}
        <div className="[&>div]:!w-full [&>div]:!min-w-0 [&>div>div]:!grid-cols-[1fr_auto]">
          <Leva
            fill
            flat
            hideCopyButton
            titleBar={false}
            collapsed={false}
            theme={{
              colors: {
                elevation1: "var(--color-bg)",
                elevation2: "var(--color-bg-panel)",
                elevation3: "var(--color-hover)",
                accent1: "var(--color-accent)",
                accent2: "var(--color-accent)",
                accent3: "var(--color-accent)",
                highlight1: "var(--color-text)",
                highlight2: "var(--color-text-secondary)",
                highlight3: "var(--color-text-tertiary)",
              },
            }}
          />
        </div>
      </div>

      {/* Prompt Preview */}
      <div className="bg-[var(--color-bg-panel)] backdrop-blur-xl rounded-xl border border-[var(--color-border)] shadow-2xl p-3 max-w-[280px]">
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1">
          生成 Prompt
        </div>
        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed font-mono">
          {combinedPrompt}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => {
              navigator.clipboard.writeText(combinedPrompt)
            }}
            className="text-[10px] px-2 py-1 rounded bg-[var(--color-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
          >
            复制 Prompt
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── 导出 ──────────────────────────────────────────────

export { CinematicParamPanelInner }
export default CinematicParamPanelInner
