// ============================================================================
// Jianying Draft Export — 剪映草稿导出器
// ============================================================================
// 参考: pyJianYingDraft (MIT), 剪映 5.x draft_content.json schema
// ============================================================================

import type { Node } from "@xyflow/react"
import type { CanvasNodeData } from "@/app/canvas/components/canvas/types"

// ============================================================================
// Types — 剪映 Draft Schema
// ============================================================================

interface JyTimeRange {
  start: number
  duration: number
}

interface JyClip {
  alpha: number
  rotation: number
  scale: { x: number; y: number }
  transform: { x: number; y: number }
  flip: { horizontal: boolean; vertical: boolean }
}

interface JySegment {
  id: string
  material_id: string
  target_timerange: JyTimeRange
  source_timerange: JyTimeRange
  speed: number
  volume: number
  render_index: number
  clip: JyClip | null
  extra_material_refs: string[]
  hdr_settings: { intensity: number; mode: number; nits: number }
  cartoon: boolean
  reverse: boolean
  visible: boolean
  uniform_scale: { on: boolean; value: number }
  enable_adjust: boolean
  enable_color_curves: boolean
  enable_color_wheels: boolean
  enable_lut: boolean
  common_keyframes: unknown[]
  keyframe_refs: unknown[]
  transition?: { material_id: string; duration: number }
}

interface JyDraftContent {
  canvas_config: { height: number; width: number; ratio: string }
  duration: number
  fps: number
  materials: Record<string, unknown[]>
  tracks: Array<{
    id: string
    type: "video" | "audio" | "text"
    attribute: number
    flag: number
    is_default_name: boolean
    name: string
    render_index: number
    segments: JySegment[]
  }>
  version: number
  new_version: string
}

interface JyDraftMetaInfo {
  draft_id: string
  draft_name: string
  draft_root_path: string
  draft_fold_path: string
  draft_cover: string
  draft_materials: Array<{ type: number; value: unknown[] }>
  tm_draft_create: number
  tm_draft_modified: number
  tm_duration: number
}

// ============================================================================
// UUID Generator
// ============================================================================
function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16).toUpperCase()
  })
}

// ============================================================================
// Default crop + matting templates
// ============================================================================
const DEFAULT_CROP = {
  lower_left_x: 0, lower_left_y: 1,
  lower_right_x: 1, lower_right_y: 1,
  upper_left_x: 0, upper_left_y: 0,
  upper_right_x: 1, upper_right_y: 0,
}
const DEFAULT_MATTING = { flag: 0, path: "", strokes: [] }
const DEFAULT_STABLE = { stable_level: 0, time_range: { duration: 0, start: 0 } }
const DEFAULT_ALGO = { algorithms: [], path: "", time_range: null }
const DEFAULT_CLIP: JyClip = {
  alpha: 1, rotation: 0,
  scale: { x: 1, y: 1 },
  transform: { x: 0, y: 0 },
  flip: { horizontal: false, vertical: false },
}
const DEFAULT_HDR = { intensity: 1, mode: 1, nits: 1000 }
const DEFAULT_UNIFORM = { on: true, value: 1 }

// ============================================================================
// Shot extraction
// ============================================================================
interface ExportableShot {
  id: string
  order: number
  title: string
  description: string
  videoUrl?: string
  audioUrl?: string
  subtitle?: string
  durationMs: number
  width: number
  height: number
}

function parseDuration(dur?: string): number {
  if (!dur) return 3
  const m = dur.match(/(\d+(?:\.\d+)?)\s*s?/)
  return m ? parseFloat(m[1]) : 3
}

function extractShots(nodes: Node<CanvasNodeData>[]): ExportableShot[] {
  return nodes
    .filter((n) => n.type === "shot" && n.data?.shot)
    .map((n) => {
      const s = n.data.shot!
      return {
        id: s.id || n.id,
        order: s.order ?? 0,
        title: s.title || `Shot ${s.order ?? 0}`,
        description: s.description || "",
        videoUrl: n.data.resultUrl || s.generatedImageUrl || undefined,
        audioUrl: s.voiceAudioUrl || undefined,
        subtitle: s.dialogue || undefined,
        durationMs: Math.max(parseDuration(s.duration) * 1000, 1000),
        width: 1920,
        height: 1080,
      }
    })
    .sort((a, b) => a.order - b.order)
}

// ============================================================================
// Builder
// ============================================================================
export interface JianyingExportResult {
  draftContent: JyDraftContent
  draftMeta: JyDraftMetaInfo
  projectName: string
}

export function buildJianyingDraft(
  nodes: Node<CanvasNodeData>[],
  projectName = "StarCanvas_Project",
): JianyingExportResult | null {
  const shots = extractShots(nodes)
  if (shots.length === 0) return null

  const draftId = uuid()
  const nowMs = Date.now()
  const nowSec = Math.floor(nowMs / 1000)

  const initMaterialPool = () => ({
    videos: [] as unknown[], audios: [] as unknown[], texts: [] as unknown[],
    transitions: [] as unknown[], speeds: [] as unknown[],
    sound_channel_mappings: [] as unknown[], vocal_separations: [] as unknown[],
    canvases: [] as unknown[], video_effects: [] as unknown[], beats: [] as unknown[],
  })

  const materials = initMaterialPool()
  const videoTrack = { id: uuid(), type: "video" as const, attribute: 0, flag: 0, is_default_name: true, name: "", render_index: 0, segments: [] as JySegment[] }
  const audioTrack = { ...videoTrack, id: uuid(), type: "audio" as const, segments: [] as JySegment[] }
  const textTrack = { ...videoTrack, id: uuid(), type: "text" as const, render_index: 15000, segments: [] as JySegment[] }
  const metaMaterials: unknown[] = []
  let currentUs = 0

  const makeAux = () => {
    const speedId = uuid(), canvasId = uuid(), soundId = uuid(), vocalId = uuid()
    materials.speeds.push({ id: speedId, speed: 1, mode: 0, curve_speed: null, type: "speed" })
    materials.sound_channel_mappings.push({ id: soundId, audio_channel_mapping: 0, is_config_open: false, type: "none" })
    materials.vocal_separations.push({ id: vocalId, type: "vocal_separation", choice: 0, production_path: "", time_range: null })
    materials.canvases.push({ id: canvasId, type: "canvas_color", color: "", blur: 0, album_image: "", image: "", image_id: "" })
    return [speedId, canvasId, soundId, vocalId]
  }

  const makeVideoSegment = (matId: string, durUs: number, refs: string[]): JySegment => ({
    id: uuid(), material_id: matId,
    target_timerange: { start: currentUs, duration: durUs },
    source_timerange: { start: 0, duration: durUs },
    speed: 1, volume: 1, render_index: 0, clip: DEFAULT_CLIP,
    extra_material_refs: refs,
    hdr_settings: DEFAULT_HDR, cartoon: false, reverse: false, visible: true,
    uniform_scale: DEFAULT_UNIFORM,
    enable_adjust: true, enable_color_curves: true, enable_color_wheels: true, enable_lut: true,
    common_keyframes: [], keyframe_refs: [],
  })

  for (const shot of shots) {
    const durUs = shot.durationMs * 1000
    const vidMatId = uuid()
    const refs = makeAux()

    materials.videos.push({
      id: vidMatId, path: shot.videoUrl || `videos/shot_${String(shot.order).padStart(3, "0")}.mp4`,
      material_name: `${shot.title}.mp4`, type: "photo", duration: durUs,
      width: shot.width, height: shot.height, has_audio: false, category_name: "local",
      check_flag: 63487, crop: DEFAULT_CROP, crop_ratio: "free", crop_scale: 1,
      matting: DEFAULT_MATTING, stable: DEFAULT_STABLE, video_algorithm: DEFAULT_ALGO,
      aigc_type: "none", is_ai_generate_content: false,
    })

    metaMaterials.push({
      id: vidMatId, file_Path: shot.videoUrl || "", duration: durUs,
      width: shot.width, height: shot.height, metetype: "photo", type: 0,
      create_time: nowSec, import_time: nowSec, import_time_ms: nowMs,
      item_source: 1, extra_info: `${shot.title}.mp4`,
    })

    videoTrack.segments.push(makeVideoSegment(vidMatId, durUs, refs))

    // Audio
    if (shot.audioUrl) {
      const audioMatId = uuid()
      const aRefs = makeAux()
      materials.audios.push({
        id: audioMatId, path: shot.audioUrl, name: `${shot.title}_audio.mp3`,
        type: "extract_music", duration: durUs, category_name: "local",
        check_flag: 1, local_material_id: uuid(), music_id: uuid(), wave_points: [],
      })
      audioTrack.segments.push(makeVideoSegment(audioMatId, durUs, aRefs))
      metaMaterials.push({
        id: audioMatId, file_Path: shot.audioUrl, duration: durUs,
        width: 0, height: 0, metetype: "music", type: 1,
        create_time: nowSec, import_time: nowSec, import_time_ms: nowMs,
        item_source: 1, extra_info: `${shot.title}_audio.mp3`,
      })
    }

    // Subtitle
    if (shot.subtitle) {
      const textMatId = uuid()
      const escaped = shot.subtitle.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      materials.texts.push({ id: textMatId, content: `<font id=\"\" size=\"9.0\"><color_val>${escaped}</color_val></font>`, type: "subtitle" })
      textTrack.segments.push({
        id: uuid(), material_id: textMatId,
        target_timerange: { start: currentUs, duration: durUs },
        source_timerange: { start: 0, duration: durUs },
        speed: 1, volume: 1, render_index: 15000, clip: DEFAULT_CLIP,
        extra_material_refs: [],
        hdr_settings: DEFAULT_HDR, cartoon: false, reverse: false, visible: true,
        uniform_scale: DEFAULT_UNIFORM, enable_adjust: true, enable_color_curves: true, enable_color_wheels: true, enable_lut: true,
        common_keyframes: [], keyframe_refs: [],
      })
    }

    currentUs += durUs
  }

  const tracks: JyDraftContent["tracks"] = [videoTrack]
  if (audioTrack.segments.length > 0) tracks.push(audioTrack)
  if (textTrack.segments.length > 0) tracks.push(textTrack)

  return {
    draftContent: { canvas_config: { height: 1920, width: 1080, ratio: "original" }, duration: currentUs, fps: 30, materials, tracks, version: 360000, new_version: "87.0.0" },
    draftMeta: { draft_id: draftId, draft_name: projectName, draft_root_path: "C:/Users/User/Documents/JianYingPro/Drafts", draft_fold_path: `C:/Users/User/Documents/JianYingPro/Drafts/${projectName}`, draft_cover: "draft_cover.jpg", draft_materials: [{ type: 0, value: metaMaterials }], tm_draft_create: nowMs, tm_draft_modified: nowMs, tm_duration: currentUs },
    projectName,
  }
}

// ============================================================================
// ZIP Export
// ============================================================================
export async function exportJianyingDraftZip(result: JianyingExportResult): Promise<Blob> {
  const JSZip = (await import("jszip")).default
  const zip = new JSZip()
  const folder = zip.folder(result.projectName)
  if (!folder) throw new Error("Failed to create ZIP folder")
  folder.file("draft_content.json", JSON.stringify(result.draftContent, null, 2))
  folder.file("draft_meta_info.json", JSON.stringify(result.draftMeta, null, 2))
  return await zip.generateAsync({ type: "blob" })
}

function dispatchCanvasNotice(title: string, description: string) {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent("starcanvas:notice", {
      detail: { kind: "warning", title, description },
    }),
  )
}

export async function downloadJianyingDraft(nodes: Node<CanvasNodeData>[], name?: string): Promise<boolean> {
  const result = buildJianyingDraft(nodes, name)
  if (!result) {
    dispatchCanvasNotice("还没有可导出的剪映草稿", "请先生成分镜节点后再导出。")
    return false
  }
  const blob = await exportJianyingDraftZip(result)
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url; a.download = `${result.projectName}.zip`
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
  return true
}
