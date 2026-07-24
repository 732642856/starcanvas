import type { Edge, Node } from "@xyflow/react";
import type { AssetItem, CanvasNodeData } from "../components/canvas/types";
import type { ReversePromptResult } from "./reversePromptService.ts";
import { DESIGN_TOKENS } from "../styles/designSystem.ts";

type CreateReversePromptCanvasArtifactsInput = {
  sourceNode: Node<CanvasNodeData>;
  result: ReversePromptResult;
  idFactory?: () => string;
  now?: () => number;
};

const REVERSE_PROMPT_ASSET_TAGS = ["reverse-prompt", "image-to-prompt", "prompt"] as const;

function cleanAssetName(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

export function createReversePromptCanvasArtifacts({
  sourceNode,
  result,
  idFactory = () => `reverse-prompt-${sourceNode.id}-${Date.now()}`,
  now = () => Date.now(),
}: CreateReversePromptCanvasArtifactsInput): {
  node: Node<CanvasNodeData>;
  asset: AssetItem;
  edge: Edge;
} {
  const prompt = result.prompt.trim();
  const nodeId = idFactory();
  const createdAt = now();
  const generatedAt = new Date(createdAt).toISOString();
  const sourceTitle = cleanAssetName(sourceNode.data.title) || sourceNode.id;
  const sourceImageUrl = sourceNode.data.imageUrl || sourceNode.data.assetUrl || sourceNode.data.resultUrl;
  const summaryParts = [
    "由参考图反推得到，可直接用于图片生成或视频分镜。",
    result.negativePrompt ? `Negative prompt: ${result.negativePrompt}` : undefined,
    typeof result.qualityScore === "number" ? `Quality score: ${result.qualityScore}` : undefined,
  ].filter(Boolean);

  const sourceDisplayWidth =
    typeof sourceNode.data.displayWidth === "number"
      ? sourceNode.data.displayWidth
      : typeof sourceNode.width === "number"
        ? sourceNode.width
        : 340;

  const node: Node<CanvasNodeData> = {
    id: nodeId,
    type: "content",
    position: {
      x: sourceNode.position.x + sourceDisplayWidth + 60,
      y: sourceNode.position.y,
    },
    data: {
      title: "反推提示词",
      nodeKind: "prompt",
      content: prompt,
      text: prompt,
      prompt,
      negativePrompt: result.negativePrompt,
      summary: summaryParts.join("\n"),
      sourcePromptId: sourceNode.id,
      sourceType: "image",
      generatedAt,
      generationOutput: {
        type: "reverse-prompt",
        prompt,
        negativePrompt: result.negativePrompt,
        qualityScore: result.qualityScore,
        language: result.language,
        sourceNodeId: sourceNode.id,
        sourceAssetId: sourceNode.data.assetId,
        sourceImageUrl,
      },
      syncToAssetLibrary: true,
      assetLibraryType: "prompt",
      assetLibraryFolder: "Others",
      assetLibraryTags: [...REVERSE_PROMPT_ASSET_TAGS],
      runMeta: {
        runStatus: "succeeded",
        message: "反推提示词已生成",
        lastFinishedAt: generatedAt,
      },
      createdAt,
    },
  };

  const asset: AssetItem = {
    id: `asset_${nodeId}`,
    type: "prompt",
    name: `反推提示词：${sourceTitle}`,
    folder: "Others",
    tags: [...REVERSE_PROMPT_ASSET_TAGS],
    createdAt,
    metadata: {
      source: "reverse-prompt",
      prompt,
      negativePrompt: result.negativePrompt,
      qualityScore: result.qualityScore,
      language: result.language,
      sourceNodeId: sourceNode.id,
      promptNodeId: nodeId,
      sourceAssetId: sourceNode.data.assetId,
      sourceImageUrl,
      generatedAt,
    },
  };

  return {
    node,
    asset,
    edge: {
      id: `edge-${sourceNode.id}-${nodeId}`,
      source: sourceNode.id,
      target: nodeId,
      type: "creative",
      animated: true,
      style: { stroke: DESIGN_TOKENS.nodeEdge, strokeWidth: 1.5 },
    },
  };
}
