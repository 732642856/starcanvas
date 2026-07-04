import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  selectVideoSourceImageUrl,
  resolveProviderReadableVideoSourceImage,
} from "./videoSourceImage.ts";

describe("videoSourceImage", () => {
  it("prefers provider-readable generated image URLs over blob preview URLs", () => {
    const selected = selectVideoSourceImageUrl({
      title: "image",
      nodeKind: "ai-generated-image",
      imageUrl: "blob:http://localhost/preview",
      resultUrl: "blob:http://localhost/result",
      generatedImageUrl: "data:image/png;base64,REAL",
    });

    assert.equal(selected.url, "data:image/png;base64,REAL");
    assert.equal(selected.blockedBlobUrl, "blob:http://localhost/result");
  });

  it("falls back to shot generated image URL", () => {
    const selected = selectVideoSourceImageUrl({
      title: "shot image",
      nodeKind: "image-result",
      imageUrl: "blob:http://localhost/preview",
      shot: {
        id: "shot-1",
        order: 1,
        title: "Shot",
        description: "desc",
        visualPrompt: "prompt",
        generatedImageUrl: "https://cdn.example.com/shot.png",
      },
    });

    assert.equal(selected.url, "https://cdn.example.com/shot.png");
  });

  it("reports blob-only images as blocked for real provider calls", () => {
    const selected = selectVideoSourceImageUrl({
      title: "local upload",
      nodeKind: "uploaded-image",
      imageUrl: "blob:http://localhost/local",
      resultUrl: "blob:http://localhost/local-result",
    });

    assert.equal(selected.url, undefined);
    assert.equal(selected.blockedBlobUrl, "blob:http://localhost/local-result");
  });

  it("bridges blob-only local image assets into provider-readable URLs", async () => {
    const selected = await resolveProviderReadableVideoSourceImage({
      title: "local upload",
      nodeKind: "uploaded-image",
      imageUrl: "blob:http://localhost/local",
      resultUrl: "blob:http://localhost/local-result",
      assetId: "image-asset-1",
    }, {
      bridgeLocalAssetToProviderUrl: async ({ assetId, imageUrl }) => {
        assert.equal(assetId, "image-asset-1");
        assert.equal(imageUrl, "blob:http://localhost/local-result");
        return "https://dashscope-files.example.com/temp/image-asset-1.png";
      },
    });

    assert.equal(selected.url, "https://dashscope-files.example.com/temp/image-asset-1.png");
    assert.equal(selected.blockedBlobUrl, "blob:http://localhost/local-result");
  });

  it("keeps blob-only images blocked when no local asset id is available", async () => {
    const selected = await resolveProviderReadableVideoSourceImage({
      title: "local upload",
      nodeKind: "uploaded-image",
      imageUrl: "blob:http://localhost/local",
      resultUrl: "blob:http://localhost/local-result",
    });

    assert.equal(selected.url, undefined);
    assert.equal(selected.blockedBlobUrl, "blob:http://localhost/local-result");
  });
});
