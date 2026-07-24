"use client";

import { getLocalImageAsset } from "../../../lib/assets/localImageStore.ts";
import { getLocalMediaAsset } from "../../../lib/assets/localMediaStore.ts";
import { toDataUrl } from "./toDataUrl.ts";

export type ProviderMediaKind = "image" | "audio" | "video" | "file";

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Failed to read asset blob as base64"));
    reader.readAsDataURL(blob);
  });
}

export async function assetUrlToDataUrl(
  assetUrl: string,
  options?: {
    assetId?: string;
    mediaKind?: ProviderMediaKind;
  },
  deps?: {
    getLocalImageAssetFn?: typeof getLocalImageAsset;
    getLocalMediaAssetFn?: typeof getLocalMediaAsset;
    readBlobAsDataUrlFn?: (blob: Blob) => Promise<string>;
    toDataUrlFn?: typeof toDataUrl;
  },
): Promise<string> {
  if (assetUrl.startsWith("data:")) return assetUrl;

  const assetId = options?.assetId?.trim();
  const mediaKind = options?.mediaKind;
  const readBlobAsDataUrlFn = deps?.readBlobAsDataUrlFn ?? blobToDataUrl;
  const toDataUrlFn = deps?.toDataUrlFn ?? toDataUrl;

  if (assetId) {
    const getLocalImageAssetFn = deps?.getLocalImageAssetFn ?? getLocalImageAsset;
    const getLocalMediaAssetFn = deps?.getLocalMediaAssetFn ?? getLocalMediaAsset;

    if (mediaKind !== "audio" && mediaKind !== "video" && mediaKind !== "file") {
      const imageAsset = await getLocalImageAssetFn(assetId);
      if (imageAsset?.blob) return readBlobAsDataUrlFn(imageAsset.blob);
    }

    const mediaAsset = await getLocalMediaAssetFn(assetId);
    if (mediaAsset?.blob) return readBlobAsDataUrlFn(mediaAsset.blob);
  }

  return toDataUrlFn(assetUrl);
}
