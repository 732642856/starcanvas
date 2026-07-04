/**
 * @deprecated Legacy prototype kept only for reference.
 * Current runtime path uses `components/panels/CinematicParamPanel.tsx`.
 *
 * AngleControlPanel — 早期运镜参数化控制面板原型
 * 独立于节点，提供运镜参数调节、Prompt 自动组合、应用到选中节点
 */
"use client"

import { useState, useMemo } from "react"
import { createPortal } from "react-dom"
import { X, Camera, Check, Sparkles, RotateCcw } from "lucide-react"
import { DESIGN_TOKENS, ICON_CONFIG } from "../../styles/designSystem"

// ============================================================================
// 参数类型定义
// ============================================================================

export interface CameraControlParams {
  /** 景别 */
  shotSize: string
  /** 镜头运动 */
  cameraMovement: string
  /** 光线类型 */
  lighting: string
  /** 色调 */
  colorTone: string
  /** 景深 */
  depthOfField: string
  /** 画幅比 */
  aspectRatio: string
}

interface AngleControlPanelProps {
  isOpen: boolean
  onClose: () => void
  /** 选中节点的 ID，用于"应用到选中节点" */
  selectedNodeId?: string | null
  /** 应用到节点的回调：参数 + 组合后的 Prompt */
  onApplyToNode?: (nodeId: string, prompt: string, params: CameraControlParams) => void
}

// ============================================================================
// 参数选项
// ============================================================================

const SHOT_SIZE_OPTIONS = [
  { value: "close-up", label: "特写", promptDesc: "close-up shot, strong facial emotion and details" },
  { value: "medium", label: "中景", promptDesc: "medium shot, upper body visible, balanced composition" },
  { value: "full", label: "全景", promptDesc: "full body shot, character and environment in frame" },
  { value: "wide", label: "远景", promptDesc: "wide establishing shot, emphasizes environment scale" },
]

const CAMERA_MOVEMENT_OPTIONS = [
  { value: "static", label: "固定", promptDesc: "locked-off camera, stable composition" },
  { value: "dolly-in", label: "推", promptDesc: "slow dolly in, draws attention to subject" },
  { value: "dolly-out", label: "拉", promptDesc: "gentle dolly out, reveals broader context" },
  { value: "pan", label: "摇", promptDesc: "slow pan, horizontal reveal" },
  { value: "truck", label: "移", promptDesc: "lateral tracking move, side-to-side motion" },
  { value: "follow", label: "跟", promptDesc: "following camera movement, keeps subject in frame" },
]

const LIGHTING_OPTIONS = [
  { value: "natural", label: "自然光", promptDesc: "natural lighting, soft daylight, realistic shadows" },
  { value: "hard", label: "硬光", promptDesc: "hard lighting, strong contrast, dramatic shadows" },
  { value: "soft", label: "柔光", promptDesc: "soft lighting, diffused, gentle transitions" },
  { value: "backlight", label: "逆光", promptDesc: "backlit, rim light, silhouette effect" },
  { value: "side", label: "侧光", promptDesc: "side lighting, chiaroscuro, deep shadows" },
]

const COLOR_TONE_OPTIONS = [
  { value: "warm", label: "暖调", promptDesc: "warm color palette, golden hour tones, amber highlights" },
  { value: "cool", label: "冷调", promptDesc: "cool color palette, blue tones, clinical feel" },
  { value: "vintage", label: "复古", promptDesc: "vintage color grade, faded tones, retro film look" },
  { value: "film", label: "胶片", promptDesc: "film stock aesthetic, cinematic color grading" },
]

const DEPTH_OF_FIELD_OPTIONS = [
  { value: "shallow", label: "浅景深", promptDesc: "shallow depth of field, bokeh background" },
  { value: "medium", label: "中等", promptDesc: "moderate depth of field, subject in focus with readable background" },
  { value: "deep", label: "深景深", promptDesc: "deep depth of field, everything in sharp focus" },
]

const ASPECT_RATIO_OPTIONS = [
  { value: "16:9", label: "16:9 横屏", size: "1920x1080" },
  { value: "9:16", label: "9:16 竖屏", size: "1080x1920" },
  { value: "4:3", label: "4:3 经典", size: "1600x1200" },
  { value: "1:1", label: "1:1 方形", size: "1024x1024" },
]

// ============================================================================
// 默认参数
// ============================================================================

const DEFAULT_PARAMS: CameraControlParams = {
  shotSize: "medium",
  cameraMovement: "static",
  lighting: "natural",
  colorTone: "warm",
  depthOfField: "medium",
  aspectRatio: "16:9",
}

// ============================================================================
// 组件
// ============================================================================

export function AngleControlPanel({
  isOpen,
  onClose,
  selectedNodeId,
  onApplyToNode,
}: AngleControlPanelProps) {
  const [params, setParams] = useState<CameraControlParams>(DEFAULT_PARAMS)
  const [applied, setApplied] = useState(false)

  // 自动组合 Prompt
  const combinedPrompt = useMemo(() => {
    const shot = SHOT_SIZE_OPTIONS.find((o) => o.value === params.shotSize)!
    const move = CAMERA_MOVEMENT_OPTIONS.find((o) => o.value === params.cameraMovement)!
    const light = LIGHTING_OPTIONS.find((o) => o.value === params.lighting)!
    const tone = COLOR_TONE_OPTIONS.find((o) => o.value === params.colorTone)!
    const dof = DEPTH_OF_FIELD_OPTIONS.find((o) => o.value === params.depthOfField)!

    const parts = [
      `Shot: ${shot.promptDesc}.`,
      `Camera: ${move.promptDesc}.`,
      `Lighting: ${light.promptDesc}.`,
      `Color: ${tone.promptDesc}.`,
      `Depth of field: ${dof.promptDesc}.`,
      `Aspect ratio: ${params.aspectRatio}`,
    ]

    return parts.join(" ")
  }, [params])

  // 应用到选中节点
  const handleApply = () => {
    if (selectedNodeId && onApplyToNode) {
      onApplyToNode(selectedNodeId, combinedPrompt, params)
      setApplied(true)
      setTimeout(() => setApplied(false), 2000)
    }
  }

  // 重置参数
  const handleReset = () => {
    setParams(DEFAULT_PARAMS)
    setApplied(false)
  }

  // 更新参数辅助函数
  const updateParam = <K extends keyof CameraControlParams>(
    key: K,
    value: CameraControlParams[K]
  ) => {
    setParams((prev) => ({ ...prev, [key]: value }))
    setApplied(false)
  }

  if (!isOpen) return null
  if (typeof document === "undefined") return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="relative z-10 w-[480px] max-h-[90vh] overflow-hidden rounded-2xl border flex flex-col"
        style={{
          backgroundColor: DESIGN_TOKENS.panelSolid,
          borderColor: DESIGN_TOKENS.border,
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-4 border-b shrink-0"
          style={{ borderColor: DESIGN_TOKENS.border }}
        >
          <div className="flex items-center gap-2">
            <Camera size={18} strokeWidth={ICON_CONFIG.strokeWidth} style={{ color: DESIGN_TOKENS.accent }} />
            <h3 className="text-sm font-medium" style={{ color: DESIGN_TOKENS.text }}>
              运镜参数控制
            </h3>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleReset}
              className="rounded-lg p-1.5 transition-colors hover:bg-white/10"
              title="重置参数"
            >
              <RotateCcw size={14} strokeWidth={1.5} style={{ color: DESIGN_TOKENS.textMuted }} />
            </button>
            <button onClick={onClose} className="rounded-lg p-1 transition-colors hover:bg-white/10">
              <X size={16} strokeWidth={ICON_CONFIG.strokeWidth} style={{ color: DESIGN_TOKENS.textMuted }} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* 景别 */}
          <ParamSelectField
            label="景别"
            options={SHOT_SIZE_OPTIONS}
            value={params.shotSize}
            onChange={(v) => updateParam("shotSize", v)}
          />

          {/* 镜头运动 */}
          <ParamSelectField
            label="镜头运动"
            options={CAMERA_MOVEMENT_OPTIONS}
            value={params.cameraMovement}
            onChange={(v) => updateParam("cameraMovement", v)}
          />

          {/* 光线类型 */}
          <ParamSelectField
            label="光线类型"
            options={LIGHTING_OPTIONS}
            value={params.lighting}
            onChange={(v) => updateParam("lighting", v)}
          />

          {/* 色调 */}
          <ParamSelectField
            label="色调"
            options={COLOR_TONE_OPTIONS}
            value={params.colorTone}
            onChange={(v) => updateParam("colorTone", v)}
          />

          {/* 景深 */}
          <ParamSelectField
            label="景深"
            options={DEPTH_OF_FIELD_OPTIONS}
            value={params.depthOfField}
            onChange={(v) => updateParam("depthOfField", v)}
          />

          {/* 画幅比 */}
          <div>
            <label className="mb-1.5 block text-xs font-medium" style={{ color: DESIGN_TOKENS.textSecondary }}>
              画幅比
            </label>
            <div className="grid grid-cols-2 gap-2">
              {ASPECT_RATIO_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => updateParam("aspectRatio", opt.value)}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all"
                  style={{
                    borderColor: params.aspectRatio === opt.value ? DESIGN_TOKENS.accent : DESIGN_TOKENS.border,
                    backgroundColor: params.aspectRatio === opt.value ? DESIGN_TOKENS.accentSoft : "transparent",
                    color: params.aspectRatio === opt.value ? DESIGN_TOKENS.accent : DESIGN_TOKENS.textSecondary,
                  }}
                >
                  <span className="font-medium">{opt.label}</span>
                  <span className="text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>
                    {opt.size}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* 组合 Prompt 预览 */}
          <div>
            <label className="mb-1.5 block text-xs font-medium" style={{ color: DESIGN_TOKENS.textSecondary }}>
              组合 Prompt 预览
            </label>
            <div
              className="rounded-xl border p-3"
              style={{
                backgroundColor: "rgba(0,0,0,0.3)",
                borderColor: DESIGN_TOKENS.border,
              }}
            >
              <p className="text-xs leading-relaxed" style={{ color: DESIGN_TOKENS.textSecondary }}>
                {combinedPrompt}
              </p>
              <button
                onClick={() => navigator.clipboard.writeText(combinedPrompt)}
                className="mt-2 text-[10px] transition-colors hover:text-white"
                style={{ color: DESIGN_TOKENS.textMuted }}
              >
                复制 Prompt
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between p-4 border-t shrink-0"
          style={{ borderColor: DESIGN_TOKENS.border }}
        >
          <div className="text-xs" style={{ color: DESIGN_TOKENS.textMuted }}>
            {selectedNodeId ? "已选中节点" : "请先选中一个节点"}
          </div>
          <button
            onClick={handleApply}
            disabled={!selectedNodeId}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium transition-all"
            style={{
              backgroundColor: selectedNodeId ? DESIGN_TOKENS.accent : DESIGN_TOKENS.accentSoft,
              color: selectedNodeId ? "#fff" : DESIGN_TOKENS.textMuted,
              opacity: selectedNodeId ? 1 : 0.5,
              cursor: selectedNodeId ? "pointer" : "not-allowed",
            }}
          >
            {applied ? (
              <>
                <Check size={14} strokeWidth={1.5} />
                已应用
              </>
            ) : (
              <>
                <Sparkles size={14} strokeWidth={1.5} />
                应用到选中节点
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ============================================================================
// 辅助组件：参数选择下拉
// ============================================================================

function ParamSelectField({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: string; label: string; promptDesc?: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium" style={{ color: DESIGN_TOKENS.textSecondary }}>
        {label}
      </label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className="rounded-lg border px-3 py-1.5 text-xs transition-all"
            style={{
              borderColor: value === opt.value ? DESIGN_TOKENS.accent : DESIGN_TOKENS.border,
              backgroundColor: value === opt.value ? DESIGN_TOKENS.accentSoft : "transparent",
              color: value === opt.value ? DESIGN_TOKENS.accent : DESIGN_TOKENS.textSecondary,
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
