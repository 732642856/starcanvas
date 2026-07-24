import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assetUrlToDataUrl } from "./providerMediaDataUrl.ts";

describe("assetUrlToDataUrl", () => {
  void it("returns data URLs unchanged", async () => {
    const result = await assetUrlToDataUrl("data:image/png;base64,SOURCE");
    assert.equal(result, "data:image/png;base64,SOURCE");
  });

  void it("reads image blobs from local image storage before fallback fetch", async () => {
    const calls: string[] = [];
    const result = await assetUrlToDataUrl(
      "blob:http://localhost/image",
      { assetId: "image-1", mediaKind: "image" },
      {
        getLocalImageAssetFn: async (assetId) => {
          calls.push(`image:${assetId}`);
          return {
            id: assetId,
            blob: new Blob(["img"], { type: "image/png" }),
            mimeType: "image/png",
            size: 3,
            createdAt: 1,
            updatedAt: 1,
          };
        },
        getLocalMediaAssetFn: async () => {
          calls.push("media");
          return null;
        },
        readBlobAsDataUrlFn: async () => "data:image/png;base64,IMAGE",
        toDataUrlFn: async () => {
          throw new Error("should not fallback");
        },
      },
    );

    assert.equal(result, "data:image/png;base64,IMAGE");
    assert.deepEqual(calls, ["image:image-1"]);
  });

  void it("reads audio blobs from local media storage", async () => {
    const result = await assetUrlToDataUrl(
      "blob:http://localhost/audio",
      { assetId: "audio-1", mediaKind: "audio" },
      {
        getLocalImageAssetFn: async () => {
          throw new Error("should not read image store for audio");
        },
        getLocalMediaAssetFn: async (assetId) => ({
          id: assetId,
          kind: "audio",
          blob: new Blob(["aud"], { type: "audio/wav" }),
          mimeType: "audio/wav",
          size: 3,
          createdAt: 1,
          updatedAt: 1,
        }),
        readBlobAsDataUrlFn: async () => "data:audio/wav;base64,AUDIO",
        toDataUrlFn: async () => {
          throw new Error("should not fallback");
        },
      },
    );

    assert.equal(result, "data:audio/wav;base64,AUDIO");
  });

  void it("falls back to URL fetch conversion when no local asset exists", async () => {
    const result = await assetUrlToDataUrl(
      "https://cdn.example.com/video.mp4",
      { assetId: "missing-1", mediaKind: "video" },
      {
        getLocalMediaAssetFn: async () => null,
        readBlobAsDataUrlFn: async () => {
          throw new Error("should not read blob");
        },
        toDataUrlFn: async (url) => `data:video/mp4;base64,FROM:${url}`,
      },
    );

    assert.equal(result, "data:video/mp4;base64,FROM:https://cdn.example.com/video.mp4");
  });
});
