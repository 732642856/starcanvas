/**
 * convertAIScriptToStoryboard — Convert AI script draft to storyboard shots.
 *
 * Maps AIScriptDraft → ReverseStoryboardShot format for canvas import.
 * Enriches each shot with full ShotPreset data (shotSize, cameraAngle, etc.).
 */
import type {
  AIScriptDraft,
  AIScriptShot,
  AIScriptScene,
  AIScriptSource,
} from "./types.ts"
import { getShotPreset } from "../shot-library/shotPresets.ts"
import type { ShotPreset } from "../shot-library/types.ts"

// ── Output type (compatible with canvas storyboard shots) ─

export interface ConvertedStoryboardShot {
  id: string
  title: string
  description: string
  dialogue?: string
  voiceover?: string
  durationSec: number
  shotPresetId: string
  shotSize: string
  cameraAngle: string
  cameraMovement: string
  lens: string
  composition: string
  mood: string
  visualPrompt: string
  thumbnail: string // placeholder data URL
  source: AIScriptSource
}

// ── Fallback preset ───────────────────────────────────

const FALLBACK_PRESET: ShotPreset = {
  id: "fallback-medium",
  name: "中景默认",
  category: "character",
  shotSize: "medium shot",
  cameraAngle: "eye level",
  cameraMovement: "static",
  lens: "50mm",
  composition: "centered",
  mood: "neutral",
  useCases: ["通用"],
  prompt: "medium shot, eye level, static camera, neutral lighting",
  cinematicParams: {
    shotScale: 0.5,
    cameraMotion: 0.1,
    lighting: 0.5,
    tone: 0.5,
    depthOfField: 0.3,
    aspectRatio: 0.8,
  },
}

// ── Converter ─────────────────────────────────────────

export function convertAIScriptToStoryboard(
  draft: AIScriptDraft,
): ConvertedStoryboardShot[] {
  const results: ConvertedStoryboardShot[] = []

  for (const scene of draft.scenes) {
    for (const shot of scene.shots) {
      const preset = getShotPreset(shot.shotPresetId) ?? FALLBACK_PRESET

      results.push({
        id: shot.id,
        title: shot.title,
        description: shot.description,
        dialogue: shot.dialogue,
        voiceover: shot.voiceover,
        durationSec: shot.durationSec,
        shotPresetId: shot.shotPresetId,
        shotSize: preset.shotSize,
        cameraAngle: preset.cameraAngle,
        cameraMovement: preset.cameraMovement,
        lens: preset.lens ?? "50mm",
        composition: preset.composition ?? "centered",
        mood: preset.mood ?? "neutral",
        visualPrompt: shot.visualPrompt,
        thumbnail: "", // will be filled by UI or generation
        source: {
          type: "ai-script",
          scriptId: draft.id,
          sceneId: scene.id,
          shotId: shot.id,
          shotPresetId: shot.shotPresetId,
        },
      })
    }
  }

  return results
}

/**
 * Combine visual prompt with shot preset description.
 */
export function buildFullPrompt(
  shot: AIScriptShot,
  basePrompt?: string,
): string {
  const preset = getShotPreset(shot.shotPresetId)
  const parts = [shot.visualPrompt]
  if (basePrompt) parts.unshift(basePrompt)
  if (preset) {
    parts.push(
      `${preset.shotSize}, ${preset.cameraAngle}, ${preset.cameraMovement}`,
    )
    if (preset.lens) parts.push(`${preset.lens} lens`)
    if (preset.composition) parts.push(`${preset.composition} composition`)
  }
  return parts.join(". ")
}
