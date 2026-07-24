// ============================================================================
// Persisted Canvas Sanitization
// Keeps localStorage payloads small and reload-safe by stripping runtime URLs
// and large inline image/video payloads from persisted node data.
// ============================================================================

import type { Node } from "@xyflow/react";
import type { CanvasNodeData } from "@/app/canvas/components/canvas/types";

export const RUNTIME_URL_PREFIXES = [
  "blob:",
  "data:image",
  "data:video",
  "data:audio",
] as const;

const IMAGE_RUNTIME_URL_KEYS = new Set([
  "imageUrl",
  "assetUrl",
  "previewUrl",
  "generatedImageUrl",
  "outputImageUrl",
  "resultUrl",
  "thumbnailUrl",
  "thumbnail",
  "frontViewUrl",
  "sideViewUrl",
  "backViewUrl",
  "avatarUrl",
  "referenceImageUrl",
  "sourceImageUrl",
  "focusEditMaskDataUrl",
  "maskDataUrl",
  "sourceVideoUrl",
  "videoUrl",
  "audioUrl",
  "mediaUrl",
  "url",
  "src",
  "dataUrl",
  "base64",
  "b64_json",
]);

const LARGE_INLINE_KEYS = new Set([
  "image",
  "images",
  "video",
  "videos",
  "videoUrls",
  "sourceImage",
  "referenceImageDataUrl",
  "referenceImageBase64",
]);

function isRuntimeUrl(value: string): boolean {
  return RUNTIME_URL_PREFIXES.some((prefix) => value.startsWith(prefix));
}

function shouldStripString(key: string, value: string): boolean {
  if (!isRuntimeUrl(value)) return false;
  return (
    IMAGE_RUNTIME_URL_KEYS.has(key) ||
    LARGE_INLINE_KEYS.has(key) ||
    value.length > 4 * 1024
  );
}

function sanitizeValue(value: unknown, key = ""): unknown {
  if (typeof value === "string") {
    return shouldStripString(key, value) ? undefined : value;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeValue(item, key))
      .filter((item) => item !== undefined);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    const sanitized = sanitizeValue(childValue, childKey);
    if (sanitized !== undefined) {
      result[childKey] = sanitized;
    }
  }

  return result;
}

export function sanitizePersistedNodeData(
  data: CanvasNodeData,
): CanvasNodeData {
  const sanitized = sanitizeValue(data);
  const clean = (
    sanitized && typeof sanitized === "object" ? sanitized : {}
  ) as CanvasNodeData;

  // Deprecated marker from the old image persistence flow. Keep reads compatible,
  // but never write it back.
  delete clean._imageStripped;

  return clean;
}

export function sanitizeNodesForPersistence(
  nodes: Node<CanvasNodeData>[],
): Node<CanvasNodeData>[] {
  return nodes.map((node) => ({
    ...node,
    data: sanitizePersistedNodeData(node.data),
  }));
}

export function findRuntimeUrlLeaks(value: unknown, path = "root"): string[] {
  if (typeof value === "string") {
    return isRuntimeUrl(value) ? [path] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      findRuntimeUrlLeaks(item, `${path}[${index}]`),
    );
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  return Object.entries(value).flatMap(([key, childValue]) =>
    findRuntimeUrlLeaks(childValue, `${path}.${key}`),
  );
}
