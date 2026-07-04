import type { Edge, Node } from "@xyflow/react"
import type { CanvasNodeData } from "../components/canvas/types"
import type { RemixAnalysisResult } from "./newWorkflowServices"
import type { ProductionRunQueue } from "../../../lib/storyboard/productionRunQueue.ts"
import { importStoryboardDraftToCanvas, type StoryboardDraftShot } from "../../../features/storyboard/importDraftToCanvas.ts"

type IdFactory = () => string

function toDurationSeconds(input: string): number {
  const value = Number.parseFloat(input)
  return Number.isFinite(value) && value > 0 ? value : 3
}

function buildPromptText(videoName: string, result: RemixAnalysisResult): string {
  const beats = result.template.structure
    .map((step, index) => `${index + 1}. ${step.timestamp} ${step.type}: ${step.description}`)
    .join("\n")

  return [
    `参考视频：${videoName}`,
    `类型：${result.template.category}`,
    `钩子：${result.template.hookPattern}`,
    "",
    "复刻目标：保留节奏结构、情绪推进与可复用镜头组织，但替换为我的题材、角色与场景。",
    "",
    "结构拆解：",
    beats,
    "",
    `可复用元素：${result.template.reusableElements.join(" / ") || "无"}`,
    `改编提示：${result.template.adaptationNotes || "无"}`,
  ]
    .filter(Boolean)
    .join("\n")
}

function buildStoryboardDrafts(videoName: string, result: RemixAnalysisResult): StoryboardDraftShot[] {
  return result.template.structure.map((step, index) => ({
    id: `remix-shot-${index + 1}`,
    title: `参考分镜 ${index + 1}`,
    description: step.description,
    durationSec: toDurationSeconds(step.duration),
    visualPrompt: [step.type, step.description, step.visualNotes, result.template.hookPattern]
      .filter(Boolean)
      .join(" | "),
    sourceType: "reference-video",
    sourceMeta: {
      videoName,
      timeSec: toDurationSeconds(step.timestamp),
      remixBeatType: step.type,
      audioNotes: step.audioNotes,
      emotionalValence: step.emotionalValence,
    },
  }))
}

function buildProductionQueue(shots: StoryboardDraftShot[]): ProductionRunQueue | null {
  if (shots.length === 0) return null

  const tasks = shots.map((shot, index) => ({
    id: `${shot.id}:generate-storyboard-image`,
    shotId: shot.id,
    order: index + 1,
    title: shot.title,
    action: "generate-storyboard-image" as const,
    status: "queued" as const,
    progress: 0,
  }))

  return {
    jobId: `remix-analysis:${shots.length}:${shots[0]?.id ?? "seed"}`,
    status: "queued",
    totalTasks: tasks.length,
    completedTasks: 0,
    failedTasks: 0,
    skippedTasks: 0,
    progress: 0,
    tasks,
    blockedActions: [],
  }
}

export function createRemixAnalysisArtifacts(input: {
  sourceNode: Node<CanvasNodeData>
  videoName: string
  result: RemixAnalysisResult
  idFactory: IdFactory
}): {
  promptNode: Node<CanvasNodeData>
  promptEdge: Edge
  storyboardNodes: Node<CanvasNodeData>[]
  storyboardEdges: Edge[]
  productionQueue: ProductionRunQueue | null
} {
  const { sourceNode, videoName, result, idFactory } = input
  const promptId = idFactory()
  const promptText = buildPromptText(videoName, result)
  const storyboardDrafts = buildStoryboardDrafts(videoName, result)
  const storyboardNodes = importStoryboardDraftToCanvas(storyboardDrafts, {
    baseX: sourceNode.position.x + 420,
    baseY: sourceNode.position.y - 40,
  })

  return {
    promptNode: {
      id: promptId,
      type: "content",
      position: { x: sourceNode.position.x + 420, y: sourceNode.position.y - 220 },
      data: {
        title: `复刻提示词：${videoName}`,
        nodeKind: "prompt",
        prompt: promptText,
        content: promptText,
        text: promptText,
        sourceType: "reference-video",
        sourcePromptId: sourceNode.id,
        createdAt: Date.now(),
      },
    },
    promptEdge: {
      id: `${sourceNode.id}->${promptId}`,
      source: sourceNode.id,
      target: promptId,
      type: "creative",
      animated: false,
      style: { stroke: "rgba(249, 115, 22, 0.35)", strokeWidth: 1.5 },
    },
    storyboardNodes,
    storyboardEdges: storyboardNodes.map((node) => ({
      id: `${sourceNode.id}->${node.id}`,
      source: sourceNode.id,
      target: node.id,
      type: "creative",
      animated: false,
      style: { stroke: "rgba(249, 115, 22, 0.28)", strokeWidth: 1.5 },
    })),
    productionQueue: buildProductionQueue(storyboardDrafts),
  }
}
