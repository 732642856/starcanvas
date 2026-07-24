"use client"

export interface SceneSamplePoint {
  timeSec: number
  imageData: ImageData
}

export interface ComputeSceneChangeFrameTimesOptions {
  count?: number
  maxFrames?: number
  minSpacingSec?: number
  threshold?: number
}

const DEFAULT_COUNT = 8
const DEFAULT_MAX_FRAMES = 12
const DEFAULT_MIN_SPACING_SEC = 0.8
const DEFAULT_THRESHOLD = 0.18
const HISTOGRAM_BINS = 32

type SceneScore = {
  timeSec: number
  score: number
}

export interface SceneChangeFrameSelection {
  timeSec: number
  sceneIndex: number
  score: number
  reason: "scene-change" | "representative" | "uniform-fallback"
}

export function computeSceneChangeFrameTimes(
  durationSec: number,
  samples: SceneSamplePoint[],
  options: ComputeSceneChangeFrameTimesOptions = {},
): number[] {
  return computeSceneChangeFrameSelections(durationSec, samples, options).map((item) => item.timeSec)
}

export function computeSceneChangeFrameSelections(
  durationSec: number,
  samples: SceneSamplePoint[],
  options: ComputeSceneChangeFrameTimesOptions = {},
): SceneChangeFrameSelection[] {
  const count = Math.min(
    options.count ?? DEFAULT_COUNT,
    options.maxFrames ?? DEFAULT_MAX_FRAMES,
  )

  if (durationSec <= 0 || count <= 0) return []
  if (samples.length === 0) {
    return [{
      timeSec: 0,
      sceneIndex: 0,
      score: 0,
      reason: "uniform-fallback",
    }]
  }

  const minSpacingSec = options.minSpacingSec ?? DEFAULT_MIN_SPACING_SEC
  const threshold = options.threshold ?? DEFAULT_THRESHOLD
  const chosen = new Map<number, SceneChangeFrameSelection>([
    [0, { timeSec: 0, sceneIndex: 0, score: 0, reason: "representative" }],
  ])
  const scores = computeSceneScores(samples)

  const priorityCandidates = scores
    .filter((item) => item.timeSec > 0)
    .filter((item) => item.score >= threshold)
    .sort((a, b) => b.score - a.score)

  for (const candidate of priorityCandidates) {
    if (chosen.size >= count) break
    if (isFarEnough(candidate.timeSec, new Set(chosen.keys()), minSpacingSec)) {
      chosen.set(candidate.timeSec, {
        timeSec: candidate.timeSec,
        sceneIndex: chosen.size,
        score: candidate.score,
        reason: "scene-change",
      })
    }
  }

  if (chosen.size < count) {
    for (const sample of samples) {
      if (chosen.size >= count) break
      if (sample.timeSec <= 0) continue
      if (isFarEnough(sample.timeSec, new Set(chosen.keys()), minSpacingSec)) {
        chosen.set(sample.timeSec, {
          timeSec: sample.timeSec,
          sceneIndex: chosen.size,
          score: scores.find((item) => item.timeSec === sample.timeSec)?.score ?? 0,
          reason: "uniform-fallback",
        })
      }
    }
  }

  return [...chosen.values()]
    .map((selection, index) => ({
      ...selection,
      timeSec: clampToDuration(selection.timeSec, durationSec),
      sceneIndex: index,
      score: roundScore(selection.score),
    }))
    .sort((a, b) => a.timeSec - b.timeSec)
    .map((selection, index) => ({ ...selection, sceneIndex: index }))
    .filter((selection, index, selections) =>
      index === 0 || selection.timeSec !== selections[index - 1].timeSec,
    )
}

function computeSceneScores(samples: SceneSamplePoint[]): SceneScore[] {
  const histograms = samples.map((sample) => ({
    timeSec: sample.timeSec,
    histogram: buildLumaHistogram(sample.imageData),
  }))

  const scores: SceneScore[] = []
  for (let i = 0; i < histograms.length; i++) {
    if (i === 0) {
      scores.push({ timeSec: histograms[i].timeSec, score: 1 })
      continue
    }
    scores.push({
      timeSec: histograms[i].timeSec,
      score: histogramDistance(histograms[i - 1].histogram, histograms[i].histogram),
    })
  }
  return scores
}

function buildLumaHistogram(imageData: ImageData): Float32Array {
  const histogram = new Float32Array(HISTOGRAM_BINS)
  const totalPixels = Math.max(1, imageData.width * imageData.height)
  const data = imageData.data

  for (let i = 0; i < data.length; i += 4) {
    const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    const bin = Math.min(HISTOGRAM_BINS - 1, Math.floor((luma / 256) * HISTOGRAM_BINS))
    histogram[bin] += 1
  }

  for (let i = 0; i < histogram.length; i++) {
    histogram[i] /= totalPixels
  }

  return histogram
}

function histogramDistance(a: Float32Array, b: Float32Array): number {
  let distance = 0
  for (let i = 0; i < a.length; i++) {
    distance += Math.abs(a[i] - b[i])
  }
  return Math.min(1, distance / 2)
}

function isFarEnough(timeSec: number, chosen: Set<number>, minSpacingSec: number): boolean {
  for (const existing of chosen) {
    if (Math.abs(existing - timeSec) < minSpacingSec) return false
  }
  return true
}

function clampToDuration(timeSec: number, durationSec: number): number {
  return Math.max(0, Math.min(durationSec, Math.round(timeSec * 10) / 10))
}

function dedupeSortedTimes(times: number[]): number[] {
  const unique: number[] = []
  for (const time of times) {
    if (unique.length === 0 || unique[unique.length - 1] !== time) {
      unique.push(time)
    }
  }
  return unique
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000
}
