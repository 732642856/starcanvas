/**
 * P1-1: AI Script Generation — Types
 *
 * Structured data models for AI-generated script drafts.
 * Each shot references a ShotPreset from P1-4 for lens/camera/mood data.
 */
"use client"

// ── Input ─────────────────────────────────────────────

export interface AIScriptInput {
  brief: string
  genre?: string
  audience?: string
  durationSec?: number
  stylePresetId?: string
  tone?: string
  language?: "zh" | "en"
}

// ── Output: Script Draft ──────────────────────────────

export interface AIScriptDraft {
  id: string
  title: string
  logline: string
  synopsis: string
  genre?: string
  totalDurationSec: number
  scenes: AIScriptScene[]
  inputRef: {
    brief: string
    genre?: string
    tone?: string
  }
}

export interface AIScriptScene {
  id: string
  title: string
  summary: string
  location?: string
  timeOfDay?: string
  mood?: string
  shots: AIScriptShot[]
}

export interface AIScriptShot {
  id: string
  title: string
  description: string
  dialogue?: string
  voiceover?: string
  durationSec: number
  /** Reference to P1-4 ShotPreset */
  shotPresetId: string
  /** Filled from ShotPreset at conversion time */
  shotSize?: string
  cameraAngle?: string
  cameraMovement?: string
  lens?: string
  composition?: string
  mood?: string
  visualPrompt: string
}

// ── Source Metadata (for canvas nodes) ────────────────

export interface AIScriptSource {
  type: "ai-script"
  scriptId: string
  sceneId: string
  shotId: string
  shotPresetId: string
}

// ── Genre / Tone presets ──────────────────────────────

export const SCRIPT_GENRES = [
  { id: "commercial", name: "广告片", nameEn: "Commercial" },
  { id: "short-film", name: "剧情短片", nameEn: "Short Film" },
  { id: "product-demo", name: "产品展示", nameEn: "Product Demo" },
  { id: "social-media", name: "社媒短视频", nameEn: "Social Media" },
  { id: "documentary", name: "纪录片风格", nameEn: "Documentary" },
] as const

export const SCRIPT_TONES = [
  { id: "warm", name: "温暖" },
  { id: "premium", name: "高级感" },
  { id: "tense", name: "紧张" },
  { id: "humorous", name: "幽默" },
  { id: "scifi", name: "科幻" },
  { id: "realistic", name: "写实" },
] as const

export const DURATION_PRESETS = [
  { label: "15s", value: 15 },
  { label: "30s", value: 30 },
  { label: "60s", value: 60 },
  { label: "90s", value: 90 },
] as const
