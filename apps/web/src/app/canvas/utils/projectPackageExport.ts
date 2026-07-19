import type { Node } from "@xyflow/react";
import type { CanvasNodeData } from "../components/canvas/types";
import { getLocalImageAsset } from "../../../lib/assets/localImageStore.ts";
import { getLocalMediaAsset } from "../../../lib/assets/localMediaStore.ts";
import { sanitizeNodesForPersistence } from "../../../lib/storage/sanitizePersistedCanvas.ts";
import { blobToDataUrl } from "./providerMediaDataUrl.ts";

export const PROJECT_PACKAGE_WARNING_BYTES = 100 * 1024 * 1024;

export function getProjectPackageExportWarning(
  serializedPackage: string,
  warningBytes = PROJECT_PACKAGE_WARNING_BYTES,
): string | null {
  const byteLength = new TextEncoder().encode(serializedPackage).byteLength;
  if (byteLength <= warningBytes) return null;

  return `项目包约 ${(byteLength / 1024 / 1024).toFixed(2)} MiB，包含较大媒体素材，导出和再次导入可能占用较多内存。是否继续导出？`;
}

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
    shot?: CanvasNodeData["shot"];
  };
};

export type ProjectPackageAsset = {
  id: string;
  dataUrl: string;
  mimeType?: string;
  fileName?: string;
};

function isInlineAssetUrl(value: unknown): value is string {
  return typeof value === "string" && /^data:(image|video|audio)\//.test(value);
}

function addAsset(
  assets: Map<string, ProjectPackageAsset>,
  assetId: unknown,
  dataUrl: unknown,
  meta?: { mimeType?: unknown; fileName?: unknown },
): void {
  if (typeof assetId !== "string" || !assetId || !isInlineAssetUrl(dataUrl)) return;
  assets.set(assetId, {
    id: assetId,
    dataUrl,
    mimeType: typeof meta?.mimeType === "string" ? meta.mimeType : undefined,
    fileName: typeof meta?.fileName === "string" ? meta.fileName : undefined,
  });
}

export function buildProjectPackageAssets(
  nodes: Array<Pick<Node<CanvasNodeData>, "data">>,
): ProjectPackageAsset[] {
  const assets = new Map<string, ProjectPackageAsset>();
  for (const node of nodes) {
    const data = node.data || {};
    const extendedData = data as CanvasNodeData & {
      audioUrl?: string;
      audioAssetId?: string;
    };
    addAsset(assets, data.assetId, data.imageUrl ?? data.resultUrl ?? data.assetUrl, data);
    addAsset(assets, extendedData.audioAssetId, extendedData.audioUrl, data);
    addAsset(assets, data.shot?.generatedImageAssetId, data.shot?.generatedImageUrl, data);
    addAsset(assets, data.shot?.voiceAudioAssetId, data.shot?.voiceAudioUrl, data);
  }
  return Array.from(assets.values());
}

function collectAssetIds(nodes: Array<Pick<Node<CanvasNodeData>, "data">>): string[] {
  const ids = new Set<string>();
  for (const node of nodes) {
    const data = node.data || {};
    const extendedData = data as CanvasNodeData & { audioAssetId?: string };
    for (const id of [
      data.assetId,
      data.sourceImageAssetId,
      extendedData.audioAssetId,
      data.shot?.generatedImageAssetId,
      data.shot?.voiceAudioAssetId,
    ]) {
      if (typeof id === "string" && id) ids.add(id);
    }
  }
  return Array.from(ids);
}

export async function buildProjectPackageAssetsWithLocalBytes(
  nodes: Array<Pick<Node<CanvasNodeData>, "data">>,
  deps: {
    getImageAsset?: typeof getLocalImageAsset;
    getMediaAsset?: typeof getLocalMediaAsset;
    toDataUrl?: (blob: Blob) => Promise<string>;
  } = {},
): Promise<ProjectPackageAsset[]> {
  const assets = new Map(buildProjectPackageAssets(nodes).map((asset) => [asset.id, asset]));
  const getImageAsset = deps.getImageAsset ?? getLocalImageAsset;
  const getMediaAsset = deps.getMediaAsset ?? getLocalMediaAsset;
  const toDataUrl = deps.toDataUrl ?? blobToDataUrl;

  await Promise.all(
    collectAssetIds(nodes).map(async (id) => {
      if (assets.has(id)) return;
      const imageAsset = await getImageAsset(id).catch(() => null);
      const mediaAsset = imageAsset ? null : await getMediaAsset(id).catch(() => null);
      const asset = imageAsset ?? mediaAsset;
      if (!asset) return;
      assets.set(id, {
        id,
        dataUrl: await toDataUrl(asset.blob),
        mimeType: asset.mimeType,
        fileName: asset.fileName,
      });
    }),
  );

  return Array.from(assets.values());
}

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
        shot: data.shot,
      },
    };
  });
}
