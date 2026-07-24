import type { Edge, Node } from "@xyflow/react";
import type { AssetItem, CanvasNodeData } from "../components/canvas/types";
import type { ReversePromptResult } from "./reversePromptService.ts";
import { reverseImagePrompt } from "./reversePromptService.ts";
import { createReversePromptCanvasArtifacts } from "./reversePromptCanvasArtifacts.ts";

type ReactFlowSetter<T> = (updater: (items: T[]) => T[]) => void;

type RunReversePromptNodeActionInput = {
  nodeId: string;
  getNodes: () => Node<CanvasNodeData>[];
  setNodes: ReactFlowSetter<Node<CanvasNodeData>>;
  setEdges: ReactFlowSetter<Edge>;
  addAsset?: (asset: AssetItem) => void;
  reverseImagePromptFn?: typeof reverseImagePrompt;
  createArtifactsInput?: {
    idFactory?: () => string;
    now?: () => number;
  };
};

export async function runReversePromptNodeAction({
  nodeId,
  getNodes,
  setNodes,
  setEdges,
  addAsset,
  reverseImagePromptFn = reverseImagePrompt,
  createArtifactsInput,
}: RunReversePromptNodeActionInput): Promise<ReversePromptResult> {
  const sourceNode = getNodes().find((node) => node.id === nodeId);
  if (!sourceNode) throw new Error("图片节点不存在。");

  const imageUrl = sourceNode.data.imageUrl || sourceNode.data.assetUrl || sourceNode.data.resultUrl || "";
  if (!imageUrl) throw new Error("请先上传或生成一张图片。");

  const result = await reverseImagePromptFn({
    imageUrl,
    assetId: sourceNode.data.assetId,
  });
  const { node: promptNode, edge, asset } = createReversePromptCanvasArtifacts({
    sourceNode,
    result,
    idFactory: createArtifactsInput?.idFactory,
    now: createArtifactsInput?.now,
  });

  setNodes((nds) => {
    const updatedNodes = nds.map((node) =>
      node.id === nodeId
        ? {
            ...node,
            data: {
              ...node.data,
              prompt: result.prompt,
              negativePrompt: result.negativePrompt,
              generationOutput: {
                ...(typeof node.data.generationOutput === "object" && node.data.generationOutput
                  ? node.data.generationOutput
                  : {}),
                reversePrompt: {
                  prompt: result.prompt,
                  negativePrompt: result.negativePrompt,
                  qualityScore: result.qualityScore,
                  language: result.language,
                  generatedAt: new Date().toISOString(),
                },
              },
            },
          }
        : node,
    );
    return [...updatedNodes, promptNode];
  });
  setEdges((eds) => [...eds, edge]);
  addAsset?.(asset);

  return result;
}
