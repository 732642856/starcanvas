import type { Edge, Node } from "@xyflow/react";
import type { CanvasNodeData } from "../components/canvas/types";
import { createReadyRunMeta, createSucceededRunMeta } from "./nodeRunMeta.ts";

export const VIDEO_WORKFLOW_CHAIN_NODE_SIZE = {
  width: 280,
  height: 160,
} as const;

export type VideoWorkflowAssetInput = {
  id: string;
  title: string;
  url: string;
  position: { x: number; y: number };
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  durationMs?: number;
  width?: number;
  height?: number;
  thumbnailUrl?: string;
  assetId?: string;
  persistence?: CanvasNodeData["persistence"];
  createdAt?: number;
  source?: "upload" | "generated" | "remote";
};

export type BuildVideoWorkflowChainInput = {
  sourceNode: Node<CanvasNodeData>;
  generateId: () => string;
  edgeStyle?: Edge["style"];
};

export type BuildVideoWorkflowChainResult = {
  nodes: Node<CanvasNodeData>[];
  edges: Edge[];
};

export function createUploadedVideoNode(
  input: VideoWorkflowAssetInput,
): Node<CanvasNodeData> {
  const aspectRatio =
    input.width && input.height ? input.width / input.height : 16 / 9;
  const title = input.title || input.fileName || "上传视频素材";

  return {
    id: input.id,
    type: "video",
    position: input.position,
    width: VIDEO_WORKFLOW_CHAIN_NODE_SIZE.width,
    height: VIDEO_WORKFLOW_CHAIN_NODE_SIZE.height,
    measured: VIDEO_WORKFLOW_CHAIN_NODE_SIZE,
    data: {
      title,
      nodeKind: "uploaded-video",
      workflowRole: "Video Asset",
      status: "ready",
      runMeta: createSucceededRunMeta({ message: "视频素材已上传" }),
      summary: "真实上传的视频素材，可直接创建抽帧与分析链路。",
      assetUrl: input.url,
      imageUrl: input.url,
      resultUrl: input.url,
      assetId: input.assetId,
      fileName: input.fileName ?? title,
      fileSize: input.fileSize,
      mimeType: input.mimeType,
      videoDurationMs: input.durationMs,
      videoWidth: input.width,
      videoHeight: input.height,
      thumbnailUrl: input.thumbnailUrl,
      aspectRatio,
      source: input.source ?? "upload",
      persistence:
        input.persistence ?? (input.assetId ? "indexeddb" : undefined),
      outputs: [{ label: "视频素材", type: "video" }],
      createdAt: input.createdAt ?? Date.now(),
      uploadedAt: new Date().toISOString(),
    },
  };
}

export function buildVideoWorkflowChain(
  input: BuildVideoWorkflowChainInput,
): BuildVideoWorkflowChainResult {
  const source = input.sourceNode;
  const baseX = source.position.x;
  const baseY = source.position.y;
  const sampleNodeId = input.generateId();
  const analyzeNodeId = input.generateId();
  const sourceTitle = source.data.title || source.data.fileName || "上传视频";

  const sampleNode: Node<CanvasNodeData> = {
    id: sampleNodeId,
    type: "workflow",
    position: { x: baseX + 360, y: baseY },
    width: VIDEO_WORKFLOW_CHAIN_NODE_SIZE.width,
    height: VIDEO_WORKFLOW_CHAIN_NODE_SIZE.height,
    measured: VIDEO_WORKFLOW_CHAIN_NODE_SIZE,
    data: {
      title: `${sourceTitle} · 抽帧`,
      nodeKind: "video-sample-frames",
      workflowRole: "Frame Extractor",
      status: "ready",
      runMeta: createReadyRunMeta({ message: "等待真实视频输入" }),
      summary: "从上游真实视频中抽取关键帧，输出给分析节点。",
      inputs: [{ label: "视频输入", type: "video" }],
      outputs: [{ label: "关键帧", type: "image" }],
      createdAt: Date.now(),
    },
  };

  const analyzeNode: Node<CanvasNodeData> = {
    id: analyzeNodeId,
    type: "workflow",
    position: { x: baseX + 720, y: baseY },
    width: VIDEO_WORKFLOW_CHAIN_NODE_SIZE.width,
    height: VIDEO_WORKFLOW_CHAIN_NODE_SIZE.height,
    measured: VIDEO_WORKFLOW_CHAIN_NODE_SIZE,
    data: {
      title: `${sourceTitle} · 分析`,
      nodeKind: "video-analyze",
      workflowRole: "Video Analyzer",
      status: "ready",
      runMeta: createReadyRunMeta({ message: "等待关键帧输入" }),
      summary: "基于真实抽帧做本地像素分析，生成镜头、色彩和节奏摘要。",
      inputs: [{ label: "关键帧", type: "image" }],
      outputs: [{ label: "分析结果", type: "text" }],
      createdAt: Date.now(),
    },
  };

  const edges: Edge[] = [
    {
      id: input.generateId(),
      source: source.id,
      target: sampleNode.id,
      type: "creative",
      animated: true,
      style: input.edgeStyle,
      data: { relation: "video-to-frame-extraction" },
    },
    {
      id: input.generateId(),
      source: sampleNode.id,
      target: analyzeNode.id,
      type: "creative",
      animated: true,
      style: input.edgeStyle,
      data: { relation: "frames-to-video-analysis" },
    },
  ];

  return { nodes: [sampleNode, analyzeNode], edges };
}
