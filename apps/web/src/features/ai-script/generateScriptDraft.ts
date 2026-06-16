/**
 * generateScriptDraft — Deterministic local script draft generator (P1-1 MVP).
 *
 * Generates a structured AIScriptDraft from user input, using rule-based
 * shot count allocation and shot library preset selection.
 *
 * No LLM / API required — pure deterministic logic for CI-safe testing.
 * Replaceable with LLMScriptGenerator later via the ScriptGenerator interface.
 */
import type { AIScriptInput, AIScriptDraft, AIScriptScene, AIScriptShot } from "./types.ts"
import { SHOT_PRESETS } from "../shot-library/shotPresets.ts"
import type { ShotCategory, ShotPreset } from "../shot-library/types.ts"

// ── Config ────────────────────────────────────────────

/** Shot counts by total script duration */
const SHOT_COUNT_MAP: Record<number, { min: number; max: number }> = {
  15: { min: 3, max: 4 },
  30: { min: 5, max: 6 },
  60: { min: 8, max: 10 },
  90: { min: 12, max: 15 },
}

/** Category progression for scene positions */
const SCENE_CATEGORY_PROGRESSION: ShotCategory[][] = [
  // Opening scene: establishing + action
  ["establishing", "action"],
  // Middle scenes: character + action
  ["character", "action"],
  // Closing scene: tension + transition
  ["tension", "transition"],
]

/** Genre-specific titles and prompts */
const GENRE_TEMPLATES: Record<string, {
  openingTitle: string
  loglinePrefix: string
  synopsisStyle: string
}> = {
  commercial: {
    openingTitle: "品牌亮相",
    loglinePrefix: "一支展示",
    synopsisStyle: "产品视觉叙事",
  },
  "short-film": {
    openingTitle: "序幕",
    loglinePrefix: "一段关于",
    synopsisStyle: "情感叙事",
  },
  "product-demo": {
    openingTitle: "产品登场",
    loglinePrefix: "一个演示",
    synopsisStyle: "功能展示",
  },
  "social-media": {
    openingTitle: "开场钩子",
    loglinePrefix: "一个爆款",
    synopsisStyle: "快节奏社媒",
  },
  documentary: {
    openingTitle: "开场",
    loglinePrefix: "一部记录",
    synopsisStyle: "纪实叙事",
  },
}

// ── ScriptGenerator Interface ─────────────────────────

export interface ScriptGenerator {
  generate(input: AIScriptInput): Promise<AIScriptDraft>
}

// ── Helpers ───────────────────────────────────────────

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function pickByCategory(category: ShotCategory): ShotPreset {
  const candidates = SHOT_PRESETS.filter((p) => p.category === category)
  return candidates.length > 0 ? pickRandom(candidates) : SHOT_PRESETS[0]
}

/**
 * Deterministic-ish preset selection for a scene position.
 * Uses a seed derived from scene index for stability.
 */
function pickPresetForScene(sceneIndex: number, totalScenes: number): ShotPreset {
  const progress = totalScenes > 1 ? sceneIndex / (totalScenes - 1) : 0.5
  let category: ShotCategory

  if (progress <= 0.2) category = "establishing"
  else if (progress <= 0.6) category = "character"
  else if (progress <= 0.8) category = "action"
  else category = "tension"

  const candidates = SHOT_PRESETS.filter((p) => p.category === category)
  if (candidates.length === 0) return SHOT_PRESETS[0]

  // Use index for deterministic pick within category
  const idx = sceneIndex % candidates.length
  return candidates[idx]
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

// ── Generator ─────────────────────────────────────────

export function generateScriptDraft(input: AIScriptInput): AIScriptDraft {
  const durationSec = input.durationSec ?? 30
  const genre = input.genre ?? "short-film"
  const language = input.language ?? "zh"
  const tone = input.tone ?? "realistic"
  const isZh = language === "zh"

  // Determine shot count
  const shotConfig = SHOT_COUNT_MAP[durationSec] ?? SHOT_COUNT_MAP[30]
  const totalShots = shotConfig.min + Math.floor(Math.random() * (shotConfig.max - shotConfig.min + 1))

  // Determine scene count (2-4 scenes based on total shots)
  const sceneCount = totalShots <= 4 ? 2 : totalShots <= 8 ? 3 : 4
  const shotsPerScene = Math.ceil(totalShots / sceneCount)

  // Genre template
  const tpl = GENRE_TEMPLATES[genre] ?? GENRE_TEMPLATES["short-film"]

  // Build scenes
  const scenes: AIScriptScene[] = []
  let shotIndex = 0

  for (let si = 0; si < sceneCount; si++) {
    const sceneShotCount = Math.min(shotsPerScene, totalShots - shotIndex)
    if (sceneShotCount <= 0) break

    const isFirst = si === 0
    const isLast = si === sceneCount - 1

    const sceneTitle = isFirst
      ? tpl.openingTitle
      : isLast
      ? (isZh ? "尾声" : "Finale")
      : (isZh ? `场景 ${si + 1}` : `Scene ${si + 1}`)

    const shots: AIScriptShot[] = []

    for (let shi = 0; shi < sceneShotCount; shi++) {
      const globalIdx = shotIndex + shi
      const progress = totalShots > 1 ? globalIdx / (totalShots - 1) : 0.5

      // Pick preset based on position in script
      const preset = pickPresetForScene(globalIdx, totalShots)

      const shotNum = globalIdx + 1

      const title = isZh
        ? `镜头 ${shotNum}: ${preset.name}`
        : `Shot ${shotNum}: ${preset.nameEn ?? preset.name}`

      const description = isZh
        ? `${tpl.synopsisStyle}镜头，${preset.cameraMovement}，${preset.shotSize}`
        : `${tpl.synopsisStyle} shot, ${preset.cameraMovement}, ${preset.shotSize}`

      const visualPrompt = [
        preset.prompt,
        tone ? `mood: ${tone}` : "",
        genre ? `genre: ${genre}` : "",
      ].filter(Boolean).join(", ")

      // Allocate duration: opening/closing get slightly more time
      const isEdge = progress <= 0.15 || progress >= 0.85
      const baseDuration = durationSec / totalShots
      const duration = Math.round(isEdge ? baseDuration * 1.3 : baseDuration * 0.9)

      shots.push({
        id: generateId("shot"),
        title,
        description,
        dialogue: isZh ? `（${tone}氛围对白或旁白）` : `(${tone} tone dialogue or voiceover)`,
        voiceover: isZh && isFirst
          ? `开场旁白: ${input.brief.slice(0, 30)}...`
          : undefined,
        durationSec: Math.max(1, duration),
        shotPresetId: preset.id,
        visualPrompt,
      })

      shotIndex++
    }

    // Allocate remaining shots to last scene
    if (isLast && shotIndex < totalShots) {
      const remaining = totalShots - shotIndex
      for (let r = 0; r < remaining; r++) {
        const preset = pickPresetForScene(shotIndex, totalShots)
        const shotNum = shotIndex + 1
        shots.push({
          id: generateId("shot"),
          title: isZh ? `镜头 ${shotNum}: ${preset.name}` : `Shot ${shotNum}: ${preset.nameEn ?? preset.name}`,
          description: isZh
            ? `补充镜头，${preset.cameraMovement}，${preset.shotSize}`
            : `Additional shot, ${preset.cameraMovement}, ${preset.shotSize}`,
          durationSec: Math.max(1, Math.round(durationSec / totalShots)),
          shotPresetId: preset.id,
          visualPrompt: `${preset.prompt}, mood: ${tone}`,
        })
        shotIndex++
      }
    }

    scenes.push({
      id: generateId("scene"),
      title: sceneTitle,
      summary: isZh
        ? `${sceneTitle}阶段，共${shots.length}个镜头`
        : `${sceneTitle} phase, ${shots.length} shots`,
      location: isFirst ? "户外/建筑" : isLast ? "室内/近景" : "多样化场景",
      timeOfDay: isFirst ? "黄金时刻" : isLast ? "黄昏/夜景" : "日间/室内",
      mood: tone,
      shots,
    })
  }

  return {
    id: generateId("draft"),
    title: isZh ? `AI 剧本: ${input.brief.slice(0, 20)}` : `AI Script: ${input.brief.slice(0, 20)}`,
    logline: `${tpl.loglinePrefix}${input.brief.slice(0, 40)}的${genre}剧本`,
    synopsis: isZh
      ? `基于"${input.brief}"生成的${genre}风格${durationSec}秒短片剧本，包含${scenes.length}个场景、${totalShots}个分镜。`
      : `A ${genre} ${durationSec}s short script based on "${input.brief}", ${scenes.length} scenes, ${totalShots} shots.`,
    genre,
    totalDurationSec: durationSec,
    scenes,
    inputRef: {
      brief: input.brief,
      genre: input.genre,
      tone: input.tone,
    },
  }
}

// ── Default Export: LocalScriptGenerator ──────────────

export class LocalScriptGenerator implements ScriptGenerator {
  async generate(input: AIScriptInput): Promise<AIScriptDraft> {
    return generateScriptDraft(input)
  }
}
