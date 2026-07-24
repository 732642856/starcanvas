import type {
  VideoAnalysisResult,
  VideoEvent,
  VideoKeyframeRef,
} from "../../app/canvas/types/video-analysis.ts"
import type { StoryboardDraftShot } from "./importDraftToCanvas.ts"

export interface VideoAnalysisStoryboardDraftOptions {
  defaultLastShotDurationSec?: number
  maxShots?: number
  videoAnalysisNodeId?: string
  sourceTitle?: string
}

const DEFAULT_LAST_DURATION_SEC = 3

export function buildStoryboardDraftFromVideoAnalysis(
  analysis: VideoAnalysisResult,
  options: VideoAnalysisStoryboardDraftOptions = {},
): StoryboardDraftShot[] {
  const maxShots = Math.max(1, options.maxShots ?? analysis.keyframes.length)
  const frames = [...(analysis.keyframes ?? [])]
    .filter((frame) => Number.isFinite(frame.timestampMs))
    .sort((a, b) => a.timestampMs - b.timestampMs)
    .slice(0, maxShots)

  if (frames.length === 0) return []

  const lastDuration = options.defaultLastShotDurationSec ?? DEFAULT_LAST_DURATION_SEC
  const events = Array.isArray(analysis.events) ? analysis.events : []

  return frames.map((frame, index) => {
    const nextFrame = frames[index + 1]
    const timeSec = roundSeconds(frame.timestampMs / 1000)
    const durationSec = nextFrame
      ? Math.max(0.5, roundSeconds((nextFrame.timestampMs - frame.timestampMs) / 1000))
      : lastDuration
    const relatedEvents = findRelatedEvents(events, frame.timestampMs)
    const description = buildShotDescription(frame, relatedEvents)
    const visualPrompt = buildVisualPrompt(frame, analysis, relatedEvents)

    return {
      id: `video-analysis-shot-${sanitizeId(frame.sourceVideoId)}-${frame.frameIndex}-${frame.timestampMs}`,
      title: `参考视频镜头 ${index + 1}/${frames.length}`,
      description,
      durationSec,
      visualPrompt,
      thumbnail: frame.imageUrl,
      sourceType: "reference-video",
      sourceMeta: {
        videoAnalysisNodeId: options.videoAnalysisNodeId,
        sourceTitle: options.sourceTitle,
        sourceVideoId: frame.sourceVideoId,
        sourceFrameId: `${frame.sourceVideoId}:${frame.frameIndex}`,
        frameIndex: frame.frameIndex,
        timestampMs: frame.timestampMs,
        timeSec,
        width: frame.width,
        height: frame.height,
        eventLabels: relatedEvents.map((event) => event.label),
      },
    }
  })
}

function buildShotDescription(
  frame: VideoKeyframeRef,
  relatedEvents: VideoEvent[],
): string {
  const eventText = relatedEvents
    .map((event) => event.description || event.label)
    .filter(Boolean)
    .join("；")
  const sceneText = extractSceneText(frame, relatedEvents)
  const frameDescription = frame.description || "保留关键帧中的构图、光线、色彩和主体调度。"

  return [
    `参考视频 ${formatTime(frame.timestampMs)} 处关键帧。`,
    sceneText,
    frameDescription,
    eventText ? `本段视觉线索：${eventText}` : "",
  ].filter(Boolean).join("\n")
}

function buildVisualPrompt(
  frame: VideoKeyframeRef,
  analysis: VideoAnalysisResult,
  relatedEvents: VideoEvent[],
): string {
  const eventHints = relatedEvents
    .map((event) => event.description || event.label)
    .filter(Boolean)
    .join("; ")
  const frameDescription = frame.description || analysis.summary
  const sceneHints = extractSceneText(frame, relatedEvents)

  return [
    `Cinematic storyboard frame based on a reference video keyframe at ${roundSeconds(frame.timestampMs / 1000)}s.`,
    sceneHints,
    frameDescription,
    eventHints ? `Visual notes: ${eventHints}.` : "",
    "Preserve the original composition, lighting direction, color mood, camera blocking, and shot rhythm.",
    "Professional film storyboard panel, clear readable action, production-ready framing.",
  ].filter(Boolean).join(" ")
}

function extractSceneText(frame: VideoKeyframeRef, events: VideoEvent[]): string {
  const sceneEvent = events.find((event) => event.label === "scene-boundary")
  if (sceneEvent?.description) return sceneEvent.description
  return frame.description?.match(/候选场景段 \d+/)?.[0] ?? ""
}

function findRelatedEvents(events: VideoEvent[], timestampMs: number): VideoEvent[] {
  return events.filter((event) => {
    const start = Number.isFinite(event.startMs) ? event.startMs : 0
    const end = Number.isFinite(event.endMs) ? event.endMs : start
    return timestampMs >= start && timestampMs <= end
  })
}

function formatTime(timestampMs: number): string {
  const totalSec = timestampMs / 1000
  const mins = Math.floor(totalSec / 60)
  const secs = (totalSec % 60).toFixed(1)
  return mins > 0 ? `${mins}分${secs}秒` : `${secs}秒`
}

function roundSeconds(value: number): number {
  return Math.round(value * 10) / 10
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48) || "video"
}
