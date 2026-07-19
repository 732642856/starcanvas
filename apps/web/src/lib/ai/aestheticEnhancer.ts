// ============================================================================
// Aesthetic Prompt Enhancer — taste-skill 启发式审美提升
// ============================================================================
// 灵感来源: taste-skill (36K⭐) — AI 审美能力增强
// 核心思路: 注入影视级审美关键词到图像生成prompt中
// 纯文本增强，零外部依赖，零API调用
// ============================================================================

// ============================================================================
// 审美层次定义
// ============================================================================

export interface AestheticLayer {
  name: string
  keywords: string[]
  weight: number // 0-1, higher = more impactful
}

// 构图审美
const COMPOSITION_AESTHETICS: AestheticLayer = {
  name: "composition",
  weight: 0.8,
  keywords: [
    "rule of thirds composition",
    "cinematic framing",
    "leading lines",
    "depth of field",
    "balanced negative space",
    "golden ratio composition",
  ],
}

// 光影审美
const LIGHTING_AESTHETICS: AestheticLayer = {
  name: "lighting",
  weight: 0.9,
  keywords: [
    "volumetric lighting",
    "rim light",
    "soft diffused shadows",
    "cinematic color grading",
    "atmospheric haze",
    "natural light falloff",
    "three-point lighting setup",
  ],
}

// 质感审美
const TEXTURE_AESTHETICS: AestheticLayer = {
  name: "texture",
  weight: 0.6,
  keywords: [
    "photorealistic texture detail",
    "subsurface scattering",
    "micro detail",
    "material definition",
    "fine grain texture",
  ],
}

// 色彩审美
const COLOR_AESTHETICS: AestheticLayer = {
  name: "color",
  weight: 0.7,
  keywords: [
    "harmonious color palette",
    "complementary color scheme",
    "muted tones with selective saturation",
    "cinematic color grading LUT",
    "teal and orange color grade",
    "filmic color response",
  ],
}

// 情感氛围
const MOOD_AESTHETICS: AestheticLayer = {
  name: "mood",
  weight: 0.85,
  keywords: [
    "evocative atmosphere",
    "emotional resonance",
    "cinematic storytelling",
    "immersive environment",
    "narrative tension in frame",
  ],
}

// 去AI味 — 减少塑料感
const DE_AI_AESTHETICS: AestheticLayer = {
  name: "de-ai",
  weight: 1.0, // 最高权重
  keywords: [
    "avoid plastic skin texture",
    "natural skin imperfections",
    "avoid oversaturated colors",
    "avoid unnaturally smooth surfaces",
    "organic imperfection",
    "film grain overlay",
    "analog photography aesthetic",
    "avoid CGI uncanny valley",
  ],
}

// ============================================================================
// 场景专项审美增强
// ============================================================================

export interface SceneAestheticPreset {
  name: string
  category: string
  keywords: string[]
}

export const SCENE_AESTHETIC_PRESETS: Record<string, SceneAestheticPreset> = {
  portrait: {
    name: "人像优化",
    category: "portrait",
    keywords: [
      "natural skin texture with visible pores",
      "catchlight in eyes",
      "shallow depth of field f/2.8",
      "85mm portrait lens compression",
      "Rembrandt lighting pattern",
      "natural expression, not posed",
      "hair detail with flyaway strands",
      "avoid plastic doll skin",
    ],
  },
  landscape: {
    name: "风景优化",
    category: "landscape",
    keywords: [
      "atmospheric perspective with depth layers",
      "golden hour warm light",
      "foreground interest leading to background",
      "natural weather conditions",
      "anamorphic wide aspect ratio",
    ],
  },
  action: {
    name: "动作场景优化",
    category: "action",
    keywords: [
      "dynamic motion blur on fast elements",
      "freeze frame sharpness on subject",
      "dramatic low angle perspective",
      "particle effects with realistic physics",
      "tension in composition",
    ],
  },
  interior: {
    name: "室内场景优化",
    category: "interior",
    keywords: [
      "practical light sources visible",
      "bounce light from walls",
      "ambient occlusion in corners",
      "material-specific reflections",
      "lived-in environment details",
    ],
  },
  night: {
    name: "夜景优化",
    category: "night",
    keywords: [
      "motivated light sources only",
      "noise grain in shadow areas",
      "neon reflection on wet surfaces",
      "bloom effect on bright lights",
      "deep blacks with detail retention",
    ],
  },
}

// ============================================================================
// 核心增强函数
// ============================================================================

export interface EnhanceOptions {
  layers?: AestheticLayer[]
  sceneType?: keyof typeof SCENE_AESTHETIC_PRESETS
  intensity?: "light" | "medium" | "strong"
  stylePrompt?: string
}

/**
 * 增强图像生成prompt的审美质量
 */
export function enhancePrompt(basePrompt: string, options: EnhanceOptions = {}): string {
  const {
    layers = [
      DE_AI_AESTHETICS,
      LIGHTING_AESTHETICS,
      COMPOSITION_AESTHETICS,
      MOOD_AESTHETICS,
      COLOR_AESTHETICS,
      TEXTURE_AESTHETICS,
    ],
    sceneType,
    intensity = "medium",
    stylePrompt,
  } = options

  // 按权重选择关键词数量
  const keywordCounts: Record<string, number> = {
    light: 1,
    medium: 2,
    strong: 3,
  }

  const maxPerLayer = keywordCounts[intensity] || 2
  const selectedKeywords: string[] = []

  for (const layer of layers) {
    const count = Math.max(1, Math.round(layer.weight * maxPerLayer))
    selectedKeywords.push(...layer.keywords.slice(0, count))
  }

  // 场景专项增强
  if (sceneType && SCENE_AESTHETIC_PRESETS[sceneType]) {
    const sceneKW = SCENE_AESTHETIC_PRESETS[sceneType].keywords
    const count = Math.min(3, sceneKW.length)
    selectedKeywords.push(...sceneKW.slice(0, count))
  }

  // 去重
  const unique = [...new Set(selectedKeywords)]

  // 构建增强prompt
  const aestheticSuffix = unique.join(", ")

  // 如果已有风格prompt，作为优先级最高的前缀
  if (stylePrompt) {
    return `${stylePrompt}, ${basePrompt}, ${aestheticSuffix}`
  }

  return `${basePrompt}, ${aestheticSuffix}`
}

/**
 * 快速去AI味 — 仅注入de-AI关键词
 */
export function deAIPrompt(prompt: string): string {
  return enhancePrompt(prompt, {
    layers: [DE_AI_AESTHETICS],
    intensity: "strong",
  })
}

/**
 * 人像美化 — 专用于角色生成的审美增强
 */
export function beautifyPortraitPrompt(prompt: string): string {
  return enhancePrompt(prompt, {
    layers: [DE_AI_AESTHETICS, LIGHTING_AESTHETICS, TEXTURE_AESTHETICS],
    sceneType: "portrait",
    intensity: "strong",
  })
}

/**
 * 电影感增强 — 全面提升电影质感
 */
export function cinematicEnhance(prompt: string): string {
  return enhancePrompt(prompt, {
    layers: [
      DE_AI_AESTHETICS,
      LIGHTING_AESTHETICS,
      COMPOSITION_AESTHETICS,
      MOOD_AESTHETICS,
      COLOR_AESTHETICS,
    ],
    intensity: "strong",
  })
}
