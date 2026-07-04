import type { Node } from "@xyflow/react";
import type { CanvasNodeData } from "../components/canvas/types";
import { sanitizeNodesForPersistence } from "../../../lib/storage/sanitizePersistedCanvas.ts";

export type ProjectPackageCanvasNode = {
  id: string;
  type: string;
  position: Node<CanvasNodeData>["position"];
  data: Pick<
    CanvasNodeData,
    | "title"
    | "nodeKind"
    | "workflowRole"
    | "status"
    | "runMeta"
    | "summary"
    | "prompt"
    | "content"
    | "duration"
    | "model"
    | "fileName"
    | "fileSize"
    | "mimeType"
    | "imageUrl"
    | "assetUrl"
    | "resultUrl"
    | "assetId"
    | "sourceImageAssetId"
    | "persistence"
    | "source"
    | "loadError"
    | "videoDurationMs"
    | "videoWidth"
    | "videoHeight"
    | "videoFps"
    | "srtContent"
    | "segments"
    | "totalDurationSeconds"
    | "format"
    | "inputs"
    | "outputs"
    | "createdAt"
  > & {
    audioUrl?: string;
    audioAssetId?: string;
    durationSeconds?: number;
  };
};

export function buildProjectPackageCanvasNodes(
  nodes: Array<Pick<Node<CanvasNodeData>, "id" | "type" | "position" | "data">>,
): ProjectPackageCanvasNode[] {
  return sanitizeNodesForPersistence(nodes as Node<CanvasNodeData>[]).map((node) => {
    const data = node.data || {};
    const extendedData = data as CanvasNodeData & {
      audioUrl?: string;
      audioAssetId?: string;
      durationSeconds?: number;
    };
    return {
      id: node.id,
      type: node.type || "workflow",
      position: node.position,
      data: {
        title: data.title,
        nodeKind: data.nodeKind,
        workflowRole: data.workflowRole,
        status: data.status,
        runMeta: data.runMeta ?? undefined,
        summary: data.summary,
        prompt: data.prompt,
        content: data.content,
        duration: data.duration,
        model: data.model,
        fileName: data.fileName,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
        imageUrl: data.imageUrl,
        assetUrl: data.assetUrl,
        resultUrl: data.resultUrl,
        audioUrl: extendedData.audioUrl,
        assetId: data.assetId,
        sourceImageAssetId: data.sourceImageAssetId,
        persistence: data.persistence,
        source: data.source,
        loadError: data.loadError,
        videoDurationMs: data.videoDurationMs,
        videoWidth: data.videoWidth,
        videoHeight: data.videoHeight,
        videoFps: data.videoFps,
        durationSeconds: extendedData.durationSeconds,
        srtContent: data.srtContent,
        segments: data.segments,
        totalDurationSeconds: data.totalDurationSeconds,
        format: data.format,
        audioAssetId: extendedData.audioAssetId,
        inputs: data.inputs,
        outputs: data.outputs,
        createdAt: data.createdAt,
      },
    };
  });
}
