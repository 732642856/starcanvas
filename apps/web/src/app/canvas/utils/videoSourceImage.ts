import type { CanvasNodeData, CharacterIdentityAsset } from "../components/canvas/types";

export type VideoSourceImageSelection = {
  url?: string;
  blockedBlobUrl?: string;
  assetId?: string;
};

export type VideoReferenceImageSelection = {
  urls: string[];
  blockedBlobUrls: string[];
  candidateCount: number;
  unavailableReferenceCount: number;
};

export function describeVideoReferenceAvailability(
  selection: VideoReferenceImageSelection,
): string | undefined {
  if (selection.candidateCount === 0 || selection.unavailableReferenceCount === 0) return undefined;

  if (selection.urls.length === 0) {
    return `已绑定的 ${selection.candidateCount} 张角色参考图均无法读取。请等待本地素材恢复或重新上传后再生成视频。`;
  }

  return `角色参考图部分不可读：已使用 ${selection.urls.length}/${selection.candidateCount} 张，其余 ${selection.unavailableReferenceCount} 张未恢复或桥接失败。`;
}

export type CanvasImageSourceCandidate = {
  type?: string;
  data?: CanvasNodeData;
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

const MAX_VIDU_REFERENCE_IMAGES = 7;

export async function resolveProviderReadableCharacterReferenceImages(
  identities: CharacterIdentityAsset[] | undefined,
  deps?: {
    bridgeLocalAssetToProviderUrl?: (input: { assetId: string; imageUrl: string }) => Promise<string | undefined>;
  },
): Promise<VideoReferenceImageSelection> {
  const urls: string[] = [];
  const blockedBlobUrls: string[] = [];
  const seenUrls = new Set<string>();
  let candidateCount = 0;
  let unavailableReferenceCount = 0;

  for (const identity of identities ?? []) {
    const views = [
      [identity.frontViewUrl, identity.frontViewAssetId],
      [identity.sideViewUrl, identity.sideViewAssetId],
      [identity.backViewUrl, identity.backViewAssetId],
    ] as const;

    for (const [viewUrl, assetId] of views) {
      if (urls.length >= MAX_VIDU_REFERENCE_IMAGES) {
        return { urls, blockedBlobUrls, candidateCount, unavailableReferenceCount };
      }
      const imageUrl = cleanText(viewUrl);
      const normalizedAssetId = cleanText(assetId);
      if (!imageUrl && !normalizedAssetId) continue;
      if (imageUrl && seenUrls.has(imageUrl)) continue;
      candidateCount += 1;

      if (imageUrl && !isBlobUrl(imageUrl)) {
        seenUrls.add(imageUrl);
        urls.push(imageUrl);
        continue;
      }

      if (!normalizedAssetId) {
        if (imageUrl) blockedBlobUrls.push(imageUrl);
        unavailableReferenceCount += 1;
        continue;
      }

      let bridgedUrl: string | undefined;
      try {
        bridgedUrl = await deps?.bridgeLocalAssetToProviderUrl?.({
          assetId: normalizedAssetId,
          imageUrl,
        });
      } catch {
        unavailableReferenceCount += 1;
        if (imageUrl) blockedBlobUrls.push(imageUrl);
        continue;
      }
      const providerUrl = cleanText(bridgedUrl);
      if (!providerUrl || seenUrls.has(providerUrl)) {
        unavailableReferenceCount += 1;
        if (imageUrl) blockedBlobUrls.push(imageUrl);
        continue;
      }
      seenUrls.add(providerUrl);
      urls.push(providerUrl);
    }
  }

  return { urls, blockedBlobUrls, candidateCount, unavailableReferenceCount };
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

export function selectFirstCanvasImageSource(
  candidates: CanvasImageSourceCandidate[],
): VideoSourceImageSelection {
  for (const candidate of candidates) {
    const upstreamKind = String(candidate.data?.nodeKind || candidate.type || "");
    if (upstreamKind.includes("video") || upstreamKind.includes("audio")) continue;
    const selected = selectVideoSourceImageUrl(candidate.data);
    if (selected.url || selected.blockedBlobUrl) return selected;
  }
  return {};
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
