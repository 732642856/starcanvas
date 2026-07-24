import type { Edge, Node } from "@xyflow/react";
import type { CanvasNodeData } from "@/app/canvas/components/canvas/types";
import {
  createShotImageNode,
  type CreateShotImageNodeInput,
  type CreateShotImageNodeOutput,
} from "./createShotImageNode.ts";

export type CreateShotImageArtifactsInput = CreateShotImageNodeInput & {
  generationFinishedAt?: number;
};

export type CreateShotImageArtifactsOutput = CreateShotImageNodeOutput & {
  shotNode: Node<CanvasNodeData>;
};

export function createShotImageArtifacts({
  shotNode,
  generationResult,
  prompt,
  generatedAt,
  generationFinishedAt,
  ...rest
}: CreateShotImageArtifactsInput): CreateShotImageArtifactsOutput {
  const shot = shotNode.data.shot;
  if (!shot) {
    throw new Error("Shot node data is required");
  }

  const imageArtifacts = createShotImageNode({
    shotNode,
    generationResult,
    prompt,
    generatedAt,
    ...rest,
  });

  return {
    ...imageArtifacts,
    shotNode: {
      ...shotNode,
      data: {
        ...shotNode.data,
        prompt,
        imageUrl: generationResult.imageUrl,
        generatedImageUrl: generationResult.imageUrl,
        errorMessage: undefined,
        shot: {
          ...shot,
          generatedImageUrl: generationResult.imageUrl,
          generatedImageAssetId: generationResult.assetId,
          generatedImageNodeId: imageArtifacts.imageNode.id,
          status: "done",
          generationStatus: "succeeded",
          generationFinishedAt: generationFinishedAt ?? Date.now(),
          generationRequestId: generationResult.generationId,
          generationErrorCode: undefined,
          generationRetryable: undefined,
          errorMessage: undefined,
          generationError: undefined,
          lastGeneratedAt: generatedAt,
        },
      },
    },
  };
}
