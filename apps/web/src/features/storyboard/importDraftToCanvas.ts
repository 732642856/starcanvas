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
import type { CanvasNodeData } from "../../app/canvas/components/canvas/types.ts"
import { generateId } from "../../app/canvas/utils/generateId.ts"

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
 * Create React Flow content nodes from storyboard draft shots.
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
    nodeWidth = 320,
    nodeHeight = 240,
    baseX = 100,
    baseY = 100,
    existingNodeCount = 0,
  } = options

  return shots.map((shot, i) => {
    const nodeId = generateId()

    return {
      id: nodeId,
      type: "content" as const,
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
        content: shot.description,
        prompt: shot.visualPrompt,
        imageUrl: shot.thumbnail,
        source: "generated",
        timelineStartTimeSeconds: 0,
        timelineDurationSeconds: shot.durationSec,
        timelineTrackId: 0,
        createdAt: Date.now(),
      } as CanvasNodeData,
    }
  })
}
