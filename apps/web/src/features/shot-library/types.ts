/**
 * P1-4: Shot Library — Types
 *
 * Structured shot preset catalog for quick application to storyboard nodes.
 * Maps to CinematicParamPanel's 6-dim parameter space.
 */
"use client"

// ── Shot Preset Categories ────────────────────────────

export type ShotCategory =
  | "establishing"
  | "character"
  | "action"
  | "product"
  | "transition"
  | "tension"

export interface ShotCategoryMeta {
  id: ShotCategory
  name: string
  nameEn: string
  icon: string
  description: string
}

export const SHOT_CATEGORIES: ShotCategoryMeta[] = [
  { id: "establishing", name: "建立环境", nameEn: "Establishing", icon: "🏞️", description: "远景、全景、航拍、城市开场等" },
  { id: "character", name: "人物情绪", nameEn: "Character", icon: "👤", description: "特写、过肩、侧脸、眼神等" },
  { id: "action", name: "动作叙事", nameEn: "Action", icon: "🎬", description: "跟拍、手持、推拉、摇移等" },
  { id: "product", name: "商业产品", nameEn: "Product", icon: "💎", description: "微距、旋转展示、质感特写等" },
  { id: "transition", name: "转场衔接", nameEn: "Transition", icon: "🔄", description: "遮挡转场、甩镜、匹配剪辑等" },
  { id: "tension", name: "戏剧张力", nameEn: "Tension", icon: "⚡", description: "低角度、压迫构图、对称构图等" },
]

// ── Shot Preset ────────────────────────────────────────

/**
 * Structured shot preset for the shot library.
 *
 * Maps to CinematicParamPanel parameters:
 *   shotScale       → 景别 (0=close-up, 1=extreme wide)
 *   cameraMotion    → 镜头运动 (0=static, 1=handheld)
 *   lighting        → 光线硬度 (0=soft, 1=hard)
 *   tone            → 色调温度 (0=cool, 1=warm)
 *   depthOfField    → 景深 (0=deep focus, 1=shallow bokeh)
 *   aspectRatio     → 画幅比 (0=1:1, 1=2.39:1)
 */
export interface ShotPreset {
  id: string
  name: string
  nameEn?: string
  category: ShotCategory
  shotSize: string // e.g. "close-up", "medium shot", "extreme wide"
  cameraAngle: string // e.g. "eye level", "low angle", "dutch angle"
  cameraMovement: string // e.g. "static", "push-in", "tracking"
  lens?: string // e.g. "85mm", "24mm", "anamorphic"
  composition?: string // e.g. "rule of thirds", "symmetrical", "leading lines"
  mood?: string // e.g. "tense", "dreamy", "intimate"
  useCases: string[] // e.g. ["对话场景", "揭示人物情绪"]
  prompt: string // English prompt snippet for AI generation
  /** Direct mapping to CinematicParamPanel slider values (0-1) */
  cinematicParams: {
    shotScale: number
    cameraMotion: number
    lighting: number
    tone: number
    depthOfField: number
    aspectRatio: number
  }
}

// ── Helpers ────────────────────────────────────────────

/**
 * Search presets by name, useCases, category, or shotSize.
 */
export function searchShotPresets(
  presets: ShotPreset[],
  query: string,
  category?: ShotCategory | "all",
): ShotPreset[] {
  const q = query.toLowerCase().trim()

  return presets.filter((p) => {
    if (category && category !== "all" && p.category !== category) return false
    if (!q) return true
    return (
      p.name.includes(q) ||
      (p.nameEn ?? "").toLowerCase().includes(q) ||
      p.shotSize.toLowerCase().includes(q) ||
      p.cameraMovement.toLowerCase().includes(q) ||
      p.useCases.some((u) => u.includes(q))
    )
  })
}

/**
 * Get the prompt suffix from a shot preset for injection into a node.
 */
export function getShotPrompt(preset: ShotPreset): string {
  const parts = [preset.prompt]
  if (preset.composition) parts.push(`${preset.composition} composition`)
  if (preset.mood) parts.push(`${preset.mood} mood`)
  if (preset.lens) parts.push(`${preset.lens} lens`)
  return parts.join(", ")
}
