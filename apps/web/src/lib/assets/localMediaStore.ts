// ============================================================================
// localMediaStore - IndexedDB-based local media asset storage
// Stores video/audio/file Blobs independently from canvas node JSON.
// ============================================================================
"use client";

const DB_NAME = "startrail-media-assets";
const DB_VERSION = 1;
const STORE_NAME = "media";

const objectUrlRegistry = new Map<string, string>();

function revokeObjectUrl(url: string): void {
  try {
    URL.revokeObjectURL(url);
  } catch {
    // Ignore browser cleanup failures; the URL may already be invalid.
  }
}

function trackMediaObjectUrl(assetId: string, url: string): string {
  const prev = objectUrlRegistry.get(assetId);
  if (prev && prev !== url) {
    revokeObjectUrl(prev);
  }
  objectUrlRegistry.set(assetId, url);
  return url;
}

export function createTrackedMediaObjectUrl(assetId: string, blob: Blob): string {
  const url = URL.createObjectURL(blob);
  return trackMediaObjectUrl(assetId, url);
}

export function revokeTrackedMediaObjectUrl(assetId: string): void {
  const url = objectUrlRegistry.get(assetId);
  if (url) {
    revokeObjectUrl(url);
    objectUrlRegistry.delete(assetId);
  }
}

export function revokeAllTrackedMediaObjectUrls(): void {
  for (const url of objectUrlRegistry.values()) {
    revokeObjectUrl(url);
  }
  objectUrlRegistry.clear();
}

export function getTrackedMediaObjectUrl(assetId: string): string | undefined {
  return objectUrlRegistry.get(assetId);
}

export function getTrackedMediaObjectUrlCount(): number {
  return objectUrlRegistry.size;
}

export type LocalMediaKind = "video" | "audio" | "file";

export type LocalMediaAsset = {
  id: string;
  blob: Blob;
  kind: LocalMediaKind;
  fileName?: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  durationMs?: number;
  createdAt: number;
  updatedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveLocalMediaAsset(
  asset: LocalMediaAsset,
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(asset);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getLocalMediaAsset(
  id: string,
): Promise<LocalMediaAsset | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteLocalMediaAsset(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function persistMediaFile(
  file: File,
  options?: {
    kind?: LocalMediaKind;
    width?: number;
    height?: number;
    durationMs?: number;
    mimeType?: string;
  },
): Promise<{ assetId: string; objectUrl: string }> {
  const blob =
    file instanceof Blob
      ? file
      : new Blob([file as BlobPart], { type: (file as File).type });

  return persistMediaBlob(blob, {
    kind: options?.kind ?? (file.type.startsWith("video/") ? "video" : "file"),
    fileName: file.name,
    mimeType: options?.mimeType ?? file.type,
    width: options?.width,
    height: options?.height,
    durationMs: options?.durationMs,
  });
}

export async function persistMediaBlob(
  blob: Blob,
  options: {
    kind: LocalMediaKind;
    fileName?: string;
    mimeType?: string;
    width?: number;
    height?: number;
    durationMs?: number;
  },
): Promise<{ assetId: string; objectUrl: string }> {
  const assetId = crypto.randomUUID();

  await saveLocalMediaAsset({
    id: assetId,
    blob,
    kind: options.kind,
    fileName: options.fileName,
    mimeType: options.mimeType ?? blob.type,
    size: blob.size,
    width: options?.width,
    height: options?.height,
    durationMs: options?.durationMs,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const objectUrl = createTrackedMediaObjectUrl(assetId, blob);
  return { assetId, objectUrl };
}

export async function hydrateMediaAsset(
  assetId: string,
): Promise<string | null> {
  try {
    const asset = await getLocalMediaAsset(assetId);
    if (!asset) return null;
    return createTrackedMediaObjectUrl(assetId, asset.blob);
  } catch {
    console.warn(`[localMediaStore] Failed to hydrate asset ${assetId}`);
    return null;
  }
}
