import type { CanvasNodeData } from "../components/canvas/types";

export type VideoSourceImageSelection = {
  url?: string;
  blockedBlobUrl?: string;
  assetId?: string;
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isBlobUrl(value: string): boolean {
  return value.startsWith("blob:");
}

function firstNonBlobUrl(values: unknown[]): string | undefined {
  for (const value of values) {
    const text = cleanText(value);
    if (text && !isBlobUrl(text)) return text;
  }
  return undefined;
}

function firstBlobUrl(values: unknown[]): string | undefined {
  for (const value of values) {
    const text = cleanText(value);
    if (text && isBlobUrl(text)) return text;
  }
  return undefined;
}

function firstAssetId(values: unknown[]): string | undefined {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return undefined;
}

export function selectVideoSourceImageUrl(data: CanvasNodeData | undefined): VideoSourceImageSelection {
  const shot = data?.shot;
  const candidates = [
    data?.generatedImageUrl,
    shot?.generatedImageUrl,
    shot?.referenceImageUrl,
    data?.resultUrl,
    data?.imageUrl,
    data?.assetUrl,
    data?.thumbnailUrl,
  ];

  return {
    url: firstNonBlobUrl(candidates),
    blockedBlobUrl: firstBlobUrl(candidates),
    assetId: firstAssetId([
      data?.assetId,
      shot?.generatedImageAssetId,
      data?.storyboardOutputAssetId,
      data?.sourceImageAssetId,
    ]),
  };
}

export async function resolveProviderReadableVideoSourceImage(
  data: CanvasNodeData | undefined,
  deps?: {
    bridgeLocalAssetToProviderUrl?: (input: { assetId: string; imageUrl: string }) => Promise<string | undefined>;
  },
): Promise<VideoSourceImageSelection> {
  const selected = selectVideoSourceImageUrl(data);
  if (selected.url) return selected;
  if (!selected.blockedBlobUrl || !selected.assetId) return selected;

  const bridgedUrl = await deps?.bridgeLocalAssetToProviderUrl?.({
    assetId: selected.assetId,
    imageUrl: selected.blockedBlobUrl,
  });

  if (!bridgedUrl) return selected;
  return {
    ...selected,
    url: bridgedUrl,
  };
}
