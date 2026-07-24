/**
 * P0-1: Reference Video → Reverse Storyboard — Types
 *
 * Data structures for video metadata, extracted key frames,
 * and generated storyboard shots.
 */
"use client"

// ── Video Metadata ────────────────────────────────────

export interface VideoMetadata {
  fileName: string
  fileSizeBytes: number
  durationSec: number
  width: number
  height: number
  fps?: number
  mimeType: string
}

export interface VideoLoadError {
  code: "unsupported-format" | "file-too-large" | "duration-too-long" | "read-error"
  message: string
}

// ── Frame Extraction ──────────────────────────────────

export interface ExtractedVideoFrame {
  id: string
  timeSec: number
  dataUrl: string
  width: number
  height: number
  score?: number
  strategy?: "uniform" | "scene-change"
}

export interface FrameExtractionOptions {
  /** Number of frames to extract (default 8) */
  count?: number
  /** Maximum frames allowed (default 12) */
  maxFrames?: number
  /** Output image format (default "image/jpeg") */
  format?: "image/jpeg" | "image/png"
  /** JPEG quality 0–1 (default 0.85) */
  quality?: number
  /** Sampling strategy. `scene-change` prefers shot-boundary-like changes. */
  strategy?: "uniform" | "scene-change"
  /** Pre-scan sample count for scene-change mode. */
  sampleCount?: number
}

// ── Reverse Storyboard Shot ────────────────────────────

export interface ReverseStoryboardShot {
  id: string
  sourceFrameId: string
  timeSec: number
  title: string
  description: string
  camera: string
  durationSec: number
  visualPrompt: string
  /** Data URL of the source thumbnail */
  thumbnail: string
}

export interface StoryboardDraftOptions {
  /** Default duration for the last shot (default 3s) */
  defaultLastShotDurationSec?: number
}

// ── Source Metadata (for canvas nodes) ────────────────

export interface ReverseStoryboardSource {
  type: "reference-video"
  videoName: string
  timeSec: number
  frameId: string
}

// ── Validation ────────────────────────────────────────

export const VIDEO_CONSTRAINTS = {
  maxFileSizeBytes: 100 * 1024 * 1024, // 100 MB
  maxDurationSec: 120,
  supportedMimeTypes: [
    "video/mp4",
    "video/webm",
    "video/quicktime", // .mov
  ],
  supportedExtensions: [".mp4", ".webm", ".mov"],
  defaultFrameCount: 8,
  maxFrames: 12,
  defaultLastShotDurationSec: 3,
} as const

/**
 * Validate a video file against constraints.
 * Returns error or null if valid.
 */
export function validateVideoFile(file: File): VideoLoadError | null {
  const mimeType = file.type as string
  if (!(VIDEO_CONSTRAINTS.supportedMimeTypes as readonly string[]).includes(mimeType)) {
    return {
      code: "unsupported-format",
      message: `不支持的视频格式: ${file.type || "未知"}。支持: ${VIDEO_CONSTRAINTS.supportedExtensions.join(", ")}`,
    }
  }
  if (file.size > VIDEO_CONSTRAINTS.maxFileSizeBytes) {
    const mb = (file.size / (1024 * 1024)).toFixed(1)
    return {
      code: "file-too-large",
      message: `文件过大 (${mb} MB)。上限: ${VIDEO_CONSTRAINTS.maxFileSizeBytes / (1024 * 1024)} MB`,
    }
  }
  return null
}

/**
 * Validate video metadata (after loading) against duration constraint.
 */
export function validateVideoDuration(durationSec: number): VideoLoadError | null {
  if (durationSec > VIDEO_CONSTRAINTS.maxDurationSec) {
    return {
      code: "duration-too-long",
      message: `视频时长 ${durationSec.toFixed(0)}s 超过上限 ${VIDEO_CONSTRAINTS.maxDurationSec}s`,
    }
  }
  return null
}
