import type { Edge, Node } from "@xyflow/react"
import type { CanvasNodeData, CharacterIdentityAsset, StoryboardShotData } from "@/app/canvas/components/canvas/types"
import type { ScriptPipelineResult, ScriptPipelineShot } from "./scriptPipeline"
import {
  createNormalizedShotTitle,
  createStoryboardSourceEdge,
  getStoryboardGridPosition,
  getStoryboardShotPosition,
} from "./layoutStoryboardShots.ts"

export type ScriptPipelineCanvasOutput = {
  shotNodes: Node<CanvasNodeData>[]
  gridNode: Node<CanvasNodeData>
  edges: Edge[]
}

function createShotCharacterIdentities(shot: ScriptPipelineShot): CharacterIdentityAsset[] | undefined {
  const identities = shot.characterBindings
    .map((binding): CharacterIdentityAsset | null => {
      const name = binding.name || binding.characterId
      if (!name) return null
      return {
        id: binding.characterId || name,
        name,
        referenceAssetId: binding.referenceAssetIds[0],
        notes: [
          binding.viewSetId ? `三视图：${binding.viewSetId}` : "",
          binding.referenceAssetIds.length ? `参考资产：${binding.referenceAssetIds.length}` : "",
          binding.faceLock ? "脸部锁定" : "",
          binding.costumeLock ? "服装锁定" : "",
        ].filter(Boolean).join("；"),
      }
    })
    .filter(Boolean) as CharacterIdentityAsset[]
  return identities.length ? identities : undefined
}

export function createScriptPipelineCanvasNodes({
  pipeline,
  sourceNode,
  generatedAt = new Date().toISOString(),
}: {
  pipeline: ScriptPipelineResult
  sourceNode: Node<CanvasNodeData>
  generatedAt?: string
}): ScriptPipelineCanvasOutput {
  const shotNodes = pipeline.shots.map((shot, index): Node<CanvasNodeData> => {
    const shotData: StoryboardShotData = {
      id: shot.id,
      order: shot.order,
      title: shot.title,
      shotType: shot.shotType,
      cameraMovement: shot.cameraMovement,
      duration: `${shot.durationSeconds}s`,
      description: shot.textStoryboard,
      visualPrompt: shot.imagePrompt,
      negativePrompt: shot.negativePrompt,
      characterIdentities: createShotCharacterIdentities(shot),
      notes: [
        shot.storyboardPrompt,
        `Video prompt: ${shot.videoPrompt}`,
        shot.characterBindings.length ? `Character bindings: ${shot.characterBindings.map((c) => c.characterId).join(", ")}` : "",
      ].filter(Boolean).join("\n"),
      sourceStoryboardNodeId: sourceNode.id,
      sourceType: "script-pipeline",
      sourceMeta: {
        projectTitle: pipeline.projectTitle,
        beat: shot.beat,
        storyboardPrompt: shot.storyboardPrompt,
        videoPrompt: shot.videoPrompt,
        characterBindings: shot.characterBindings,
      },
      status: "ready",
    }

    return {
      id: `${sourceNode.id}-pipeline-shot-${String(index + 1).padStart(2, "0")}`,
      type: "shot",
      position: getStoryboardShotPosition(sourceNode, index),
      data: {
        nodeKind: "shot",
        title: createNormalizedShotTitle(shotData),
        shot: shotData,
        generatedAt,
      },
    }
  })

  const gridNode: Node<CanvasNodeData> = {
    id: `${sourceNode.id}-pipeline-nine-grid`,
    type: "storyboardGrid",
    position: getStoryboardGridPosition(sourceNode),
    data: {
      nodeKind: "storyboard-grid",
      title: `${pipeline.projectTitle} / 连续9宫格`,
      content: pipeline.nineGridPrompt,
      prompt: pipeline.nineGridPrompt,
      generatedAt,
      generatedShotNodeIds: shotNodes.map((node) => node.id),
      sourceStoryboardNodeId: sourceNode.id,
      generationOutput: {
        type: "script-pipeline-nine-grid",
        continuityRules: pipeline.continuityRules,
        nextActions: pipeline.nextActions,
      },
    },
  }

  return {
    shotNodes,
    gridNode,
    edges: [
      ...shotNodes.map((node) => createStoryboardSourceEdge(sourceNode.id, node.id)),
      {
        id: `edge-script-pipeline-grid-${sourceNode.id}-${gridNode.id}`,
        source: sourceNode.id,
        target: gridNode.id,
        type: "creative",
        data: { relation: "script-pipeline-nine-grid", sourceType: "storyboard", targetType: "storyboard-grid" },
      },
    ],
  }
}
