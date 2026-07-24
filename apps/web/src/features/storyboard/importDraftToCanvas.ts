/**
 * Storyboard Draft Import — Unified adapter for importing shots into the canvas.
 *
 * Both P0-1 (reverse-storyboard) and P1-1 (ai-script) produce storyboard
 * drafts. This module provides a single `importStoryboardDraftToCanvas`
 * function that creates React Flow nodes from any draft shot.
 *
 * Future use: production run queue, external import, etc.
 */
import type { Node } from "@xyflow/react"
import type {
  CanvasNodeData,
  StoryboardShotData,
} from "../../app/canvas/components/canvas/types.ts"
import { generateId } from "../../app/canvas/utils/generateId.ts"
import { STORYBOARD_SHOT_LAYOUT } from "../../lib/storyboard/layoutStoryboardShots.ts"

// ── Common Draft Shot type ────────────────────────────

export interface StoryboardDraftShot {
  id: string
  title: string
  description: string
  durationSec: number
  visualPrompt: string
  /** Optional thumbnail data URL (from video frame extraction) */
  thumbnail?: string
  /** Source metadata preserved in node data for traceability */
  sourceType?: "reference-video" | "ai-script"
  sourceMeta?: Record<string, unknown>
}

export interface ImportOptions {
  /** Number of nodes per row (default 4) */
  columns?: number
  /** Node width in pixels (default 320) */
  nodeWidth?: number
  /** Node height in pixels (default 240) */
  nodeHeight?: number
  /** Base X position for the first node (default 100) */
  baseX?: number
  /** Base Y position for the first node (default 100) */
  baseY?: number
  /** Existing node count for stacking offset */
  existingNodeCount?: number
}

// ── Import function ───────────────────────────────────

/**
 * Create React Flow shot nodes from storyboard draft shots.
 *
 * Returns an array of new nodes ready to be merged into the canvas
 * via `setNodes((nds) => [...nds, ...newNodes])`.
 */
export function importStoryboardDraftToCanvas(
  shots: StoryboardDraftShot[],
  options: ImportOptions = {},
): Node<CanvasNodeData>[] {
  const {
    columns = 4,
    nodeWidth = STORYBOARD_SHOT_LAYOUT.shotWidth,
    nodeHeight = STORYBOARD_SHOT_LAYOUT.shotHeight,
    baseX = 100,
    baseY = 100,
    existingNodeCount = 0,
  } = options

  let timelineCursorSeconds = 0

  return shots.map((shot, i) => {
    const nodeId = generateId()
    const durationSec = Math.max(0.1, shot.durationSec || 0.1)
    const sourceTimeSec =
      typeof shot.sourceMeta?.timeSec === "number"
        ? shot.sourceMeta.timeSec
        : undefined
    const timelineStartTimeSeconds = sourceTimeSec ?? timelineCursorSeconds
    timelineCursorSeconds = timelineStartTimeSeconds + durationSec
    const hasReferenceFrame = Boolean(shot.thumbnail)
    const shotData: StoryboardShotData = {
      id: shot.id || generateId(),
      order: i + 1,
      title: shot.title,
      description: shot.description,
      duration: `${durationSec}s`,
      visualPrompt: shot.visualPrompt,
      referenceImageUrl: shot.thumbnail,
      sourceType: shot.sourceType,
      sourceMeta: shot.sourceMeta,
      notes: hasReferenceFrame ? "参考视频关键帧已保留为镜头参考图，并非最终生成分镜图。" : undefined,
      generationStatus: "idle",
      status: "ready",
    }

    return {
      id: nodeId,
      type: "shot" as const,
      position: {
        x: baseX + (i % columns) * (nodeWidth + 40),
        y: baseY + Math.floor(i / columns) * (nodeHeight + 80) + existingNodeCount * 10,
      },
      width: nodeWidth,
      height: nodeHeight,
      measured: { width: nodeWidth, height: nodeHeight },
      data: {
        title: shot.title,
        nodeKind: "shot",
        shot: shotData,
        content: shot.description,
        prompt: shot.visualPrompt,
        imageUrl: shot.thumbnail,
        thumbnailUrl: shot.thumbnail,
        source: "generated",
        sourceType: shot.sourceType,
        sourceMeta: shot.sourceMeta,
        sourceShotId: shot.id,
        sourceShotOrder: i + 1,
        sourceShotTitle: shot.title,
        timelineStartTimeSeconds,
        timelineDurationSeconds: durationSec,
        timelineTrackId: 0,
        displayWidth: nodeWidth,
        displayHeight: nodeHeight,
        createdAt: Date.now(),
      } as CanvasNodeData,
    }
  })
}
