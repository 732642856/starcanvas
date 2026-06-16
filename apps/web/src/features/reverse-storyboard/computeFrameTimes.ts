/**
 * computeFrameTimes — Pure function: calculate evenly-spaced key frame timestamps.
 *
 * Given a video duration and options, returns an array of time offsets (seconds)
 * at which to capture frames from the video.
 */
"use client"

export interface ComputeFrameTimesOptions {
  /** Desired number of frames (default 8) */
  count?: number
  /** Hard maximum frames (default 12) */
  maxFrames?: number
}

const DEFAULT_COUNT = 8
const DEFAULT_MAX = 12

/**
 * Compute evenly-spaced key frame timestamps in seconds.
 *
 * Rules:
 * - Always captures the first frame at 0s
 * - Distributes remaining frames evenly across the remaining duration
 * - Duration <= 0 returns empty array
 * - count is capped by maxFrames
 * - If duration is too short for 8 frames, distributes fewer frames
 *   (minimum spacing of 0.5s between frames)
 */
export function computeFrameTimes(
  durationSec: number,
  options: ComputeFrameTimesOptions = {},
): number[] {
  const count = Math.min(
    options.count ?? DEFAULT_COUNT,
    options.maxFrames ?? DEFAULT_MAX,
  )
  const max = options.maxFrames ?? DEFAULT_MAX

  if (durationSec <= 0 || count <= 0 || max <= 0) return []

  // For very short videos, reduce count to maintain minimum spacing
  const minSpacing = 0.5
  const maxPossibleFrames = Math.floor(durationSec / minSpacing) + 1
  const effectiveCount = Math.min(count, maxPossibleFrames)

  if (effectiveCount <= 1) {
    // Too short for distribution: just capture the first frame at 0s
    return [0]
  }

  const times: number[] = []
  const spacing = durationSec / (effectiveCount - 1)

  for (let i = 0; i < effectiveCount; i++) {
    const t = Math.round(i * spacing * 10) / 10 // round to 1 decimal
    times.push(Math.min(t, durationSec))
  }

  // Deduplicate any repeats at the end (eg. last frame at exactly durationSec)
  const unique: number[] = []
  for (const t of times) {
    if (unique.length === 0 || t !== unique[unique.length - 1]) {
      unique.push(t)
    }
  }

  return unique
}
