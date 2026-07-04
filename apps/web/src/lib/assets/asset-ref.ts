import type { Node } from "@xyflow/react";
import type {
  AssetItem,
  CanvasNodeData,
} from "@/app/canvas/components/canvas/types";

export type AssetRefType = "image" | "video" | "audio" | "document" | "text" | "other";
export type AssetRefSource = "canvas-node" | "asset-library";

export type AssetRef = {
  id: string;
  type: AssetRefType;
  label: string;
  source: AssetRefSource;
  url?: string;
  thumbnailUrl?: string;
  nodeId?: string;
  assetId?: string;
  folder?: AssetItem["folder"];
  mimeType?: string;
};

function normalizeAssetTokenId(id: string): string {
  return id.startsWith("asset_") ? id : `asset_${id.replace(/[^a-zA-Z0-9_-]+/g, "_")}`;
}

function inferAssetTypeFromNode(node: Node<CanvasNodeData>): AssetRefType {
  const data = node.data;
  const mimeType = data?.mimeType ?? "";
  const kind = data?.nodeKind ?? "";
  const type = node.type ?? "";

  if (mimeType.startsWith("video/") || kind.includes("video") || type === "video") return "video";
  if (mimeType.startsWith("audio/") || kind.includes("audio") || kind.includes("tts") || kind === "bgm") return "audio";
  if (mimeType.startsWith("image/") || kind.includes("image") || kind.includes("shot") || type === "image") return "image";
  if (kind.includes("document") || mimeType.startsWith("text/")) return "document";
  if (type === "content" || type === "text") return "text";
  return "other";
}

function primaryUrlFromNode(data: CanvasNodeData): string | undefined {
  return (
    data.assetUrl ??
    data.resultUrl ??
    data.imageUrl ??
    data.thumbnailUrl ??
    data.sketchImageDataUrl ??
    data.storyboardOutputImageUrl
  );
}

function isMentionableCanvasAsset(node: Node<CanvasNodeData>): boolean {
  const data = node.data;
  if (!data) return false;
  if (data.assetId) return true;
  if (primaryUrlFromNode(data)) return true;
  return Boolean(data.fileName || data.title || data.text || data.content || data.prompt);
}

export function buildAssetRefFromNode(
  node: Node<CanvasNodeData>,
): AssetRef | null {
  if (!isMentionableCanvasAsset(node)) return null;

  const data = node.data;
  const label =
    data.title ??
    data.fileName ??
    (typeof data.text === "string" ? data.text.slice(0, 32) : undefined) ??
    (typeof data.content === "string" ? data.content.slice(0, 32) : undefined) ??
    node.id;
  const type = inferAssetTypeFromNode(node);
  const tokenSource = data.assetId ?? node.id;

  return {
    id: normalizeAssetTokenId(tokenSource),
    type,
    label,
    source: "canvas-node",
    url: primaryUrlFromNode(data),
    thumbnailUrl: data.thumbnailUrl ?? data.imageUrl,
    nodeId: node.id,
    assetId: data.assetId,
    mimeType: data.mimeType,
  };
}

export function buildAssetRefFromAssetItem(asset: AssetItem): AssetRef {
  return {
    id: normalizeAssetTokenId(asset.id),
    type: asset.type === "prompt" || asset.type === "style" || asset.type === "character" || asset.type === "scene"
      ? "text"
      : asset.type === "audio" || asset.type === "video" || asset.type === "image"
        ? asset.type
        : "other",
    label: asset.name,
    source: "asset-library",
    url: asset.src,
    thumbnailUrl: asset.thumbnail,
    assetId: asset.id,
    folder: asset.folder,
  };
}

export function buildAssetRefs(
  nodes: Node<CanvasNodeData>[],
  assets: AssetItem[],
): AssetRef[] {
  const refs: AssetRef[] = [];
  const seen = new Set<string>();

  for (const node of nodes) {
    const ref = buildAssetRefFromNode(node);
    if (!ref || seen.has(ref.id)) continue;
    refs.push(ref);
    seen.add(ref.id);
  }

  for (const asset of assets) {
    const ref = buildAssetRefFromAssetItem(asset);
    if (seen.has(ref.id)) continue;
    refs.push(ref);
    seen.add(ref.id);
  }

  return refs;
}

export function findAssetRefByMentionId(
  refs: AssetRef[],
  mentionId?: string,
): AssetRef | undefined {
  if (!mentionId) return undefined;
  const normalized = normalizeAssetTokenId(mentionId);
  return refs.find((ref) => ref.id === normalized || ref.assetId === mentionId || ref.nodeId === mentionId);
}
