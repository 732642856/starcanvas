import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  describeVideoReferenceAvailability,
  resolveProviderReadableCharacterReferenceImages,
  selectFirstCanvasImageSource,
  selectVideoSourceImageUrl,
  resolveProviderReadableVideoSourceImage,
} from "./videoSourceImage.ts";

describe("videoSourceImage", () => {
  it("uses up to seven persisted character views as Vidu references in stable order", async () => {
    const selected = await resolveProviderReadableCharacterReferenceImages([
      {
        id: "prince",
        name: "赵珩",
        frontViewUrl: "https://cdn.example.com/prince-front.png",
        sideViewUrl: "https://cdn.example.com/prince-side.png",
        backViewUrl: "https://cdn.example.com/prince-back.png",
      },
      {
        id: "maid",
        name: "荆钗",
        frontViewUrl: "https://cdn.example.com/maid-front.png",
        sideViewUrl: "https://cdn.example.com/maid-side.png",
        backViewUrl: "https://cdn.example.com/maid-back.png",
      },
      {
        id: "steward",
        name: "管事",
        frontViewUrl: "https://cdn.example.com/steward-front.png",
        sideViewUrl: "https://cdn.example.com/steward-side.png",
      },
    ]);

    assert.deepEqual(selected.urls, [
      "https://cdn.example.com/prince-front.png",
      "https://cdn.example.com/prince-side.png",
      "https://cdn.example.com/prince-back.png",
      "https://cdn.example.com/maid-front.png",
      "https://cdn.example.com/maid-side.png",
      "https://cdn.example.com/maid-back.png",
      "https://cdn.example.com/steward-front.png",
    ]);
  });

  it("bridges persisted local character views before sending them to Vidu", async () => {
    const selected = await resolveProviderReadableCharacterReferenceImages(
      [
        {
          id: "maid",
          name: "荆钗",
          frontViewUrl: "blob:http://localhost/maid-front",
          frontViewAssetId: "maid-front-asset",
          sideViewUrl: "blob:http://localhost/maid-side",
        },
      ],
      {
        bridgeLocalAssetToProviderUrl: async ({ assetId, imageUrl }) => {
          assert.equal(assetId, "maid-front-asset");
          assert.equal(imageUrl, "blob:http://localhost/maid-front");
          return "data:image/png;base64,MAID_FRONT";
        },
      },
    );

    assert.deepEqual(selected.urls, ["data:image/png;base64,MAID_FRONT"]);
    assert.deepEqual(selected.blockedBlobUrls, ["blob:http://localhost/maid-side"]);
  });

  it("recovers a character view from its asset id before the object URL is hydrated", async () => {
    const selected = await resolveProviderReadableCharacterReferenceImages(
      [{ id: "prince", name: "赵珩", frontViewAssetId: "prince-front-asset" }],
      {
        bridgeLocalAssetToProviderUrl: async ({ assetId, imageUrl }) => {
          assert.equal(assetId, "prince-front-asset");
          assert.equal(imageUrl, "");
          return "data:image/png;base64,PRINCE_FRONT";
        },
      },
    );

    assert.equal(selected.candidateCount, 1);
    assert.equal(selected.unavailableReferenceCount, 0);
    assert.deepEqual(selected.urls, ["data:image/png;base64,PRINCE_FRONT"]);
  });

  it("reports an unreadable configured reference instead of treating it as no reference", async () => {
    const selected = await resolveProviderReadableCharacterReferenceImages([
      {
        id: "maid",
        name: "荆钗",
        frontViewUrl: "blob:http://localhost/missing-maid-front",
      },
    ]);

    assert.equal(selected.candidateCount, 1);
    assert.equal(selected.unavailableReferenceCount, 1);
    assert.deepEqual(selected.urls, []);
    assert.deepEqual(selected.blockedBlobUrls, ["blob:http://localhost/missing-maid-front"]);
    assert.equal(
      describeVideoReferenceAvailability(selected),
      "已绑定的 1 张角色参考图均无法读取。请等待本地素材恢复或重新上传后再生成视频。",
    );
  });

  it("keeps a visible warning when only part of the configured references are readable", () => {
    assert.equal(
      describeVideoReferenceAvailability({
        urls: ["data:image/png;base64,PRINCE_FRONT"],
        blockedBlobUrls: ["blob:http://localhost/prince-side"],
        candidateCount: 2,
        unavailableReferenceCount: 1,
      }),
      "角色参考图部分不可读：已使用 1/2 张，其余 1 张未恢复或桥接失败。",
    );
  });

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

  it("bridges shot generated blob images via generatedImageAssetId", async () => {
    const selected = await resolveProviderReadableVideoSourceImage({
      title: "storyboard shot",
      nodeKind: "shot",
      shot: {
        id: "shot-1",
        order: 1,
        title: "Shot",
        description: "desc",
        visualPrompt: "prompt",
        generatedImageUrl: "blob:http://localhost/shot-generated",
        generatedImageAssetId: "shot-image-asset-1",
      },
    }, {
      bridgeLocalAssetToProviderUrl: async ({ assetId, imageUrl }) => {
        assert.equal(assetId, "shot-image-asset-1");
        assert.equal(imageUrl, "blob:http://localhost/shot-generated");
        return "data:image/png;base64,SHOT_IMAGE";
      },
    });

    assert.equal(selected.url, "data:image/png;base64,SHOT_IMAGE");
    assert.equal(selected.assetId, "shot-image-asset-1");
  });

  it("selects the first usable non-audio/video image source across upstream nodes", () => {
    const selected = selectFirstCanvasImageSource([
      {
        type: "audio",
        data: {
          title: "voice",
          nodeKind: "tts-audio",
          audioUrl: "blob:http://localhost/voice",
        },
      },
      {
        type: "image",
        data: {
          title: "image",
          nodeKind: "ai-generated-image",
          imageUrl: "blob:http://localhost/stale-preview",
          generatedImageUrl: "data:image/png;base64,REAL_IMAGE",
          assetId: "image-asset-1",
        },
      },
    ]);

    assert.equal(selected.url, "data:image/png;base64,REAL_IMAGE");
    assert.equal(selected.blockedBlobUrl, "blob:http://localhost/stale-preview");
    assert.equal(selected.assetId, "image-asset-1");
  });

  it("reuses shot generated image asset ids when scanning upstream nodes", () => {
    const selected = selectFirstCanvasImageSource([
      {
        type: "shot",
        data: {
          title: "storyboard shot",
          nodeKind: "shot",
          shot: {
            id: "shot-1",
            order: 1,
            title: "Shot",
            description: "desc",
            visualPrompt: "prompt",
            generatedImageUrl: "blob:http://localhost/shot-generated",
            generatedImageAssetId: "shot-image-asset-1",
          },
        },
      },
    ]);

    assert.equal(selected.url, undefined);
    assert.equal(selected.blockedBlobUrl, "blob:http://localhost/shot-generated");
    assert.equal(selected.assetId, "shot-image-asset-1");
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
