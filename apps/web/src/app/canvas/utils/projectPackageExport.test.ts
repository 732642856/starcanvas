import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findRuntimeUrlLeaks } from "../../../lib/storage/sanitizePersistedCanvas.ts";
import {
  buildProjectPackageAssets,
  buildProjectPackageAssetsWithLocalBytes,
  buildProjectPackageCanvasNodes,
  getProjectPackageExportWarning,
} from "./projectPackageExport.ts";

describe("buildProjectPackageCanvasNodes", () => {
  it("strips runtime media urls from exported project package nodes", () => {
    const nodes = buildProjectPackageCanvasNodes([
      {
        id: "image-1",
        type: "image",
        position: { x: 1, y: 2 },
        data: {
          title: "本地图像",
          nodeKind: "image-result",
          imageUrl: "blob:http://localhost/image",
          assetUrl: "data:image/png;base64,AAAA",
          resultUrl: "https://cdn.example.com/keep.png",
          prompt: "保留文本",
        },
      },
      {
        id: "video-1",
        type: "video",
        position: { x: 3, y: 4 },
        data: {
          title: "本地视频",
          nodeKind: "uploaded-video",
          resultUrl: "blob:http://localhost/video",
          assetUrl: "https://cdn.example.com/video.mp4",
        },
      },
    ]);

    assert.deepEqual(findRuntimeUrlLeaks(nodes), []);
    assert.equal(nodes[0]?.data.imageUrl, undefined);
    assert.equal(nodes[0]?.data.assetUrl, undefined);
    assert.equal(nodes[0]?.data.resultUrl, "https://cdn.example.com/keep.png");
    assert.equal(nodes[0]?.data.prompt, "保留文本");
    assert.equal(nodes[1]?.data.resultUrl, undefined);
    assert.equal(nodes[1]?.data.assetUrl, "https://cdn.example.com/video.mp4");
  });

  it("keeps recoverable local asset metadata while stripping runtime urls", () => {
    const nodes = buildProjectPackageCanvasNodes([
      {
        id: "image-1",
        type: "image",
        position: { x: 0, y: 0 },
        data: {
          title: "IndexedDB 图像",
          nodeKind: "image-result",
          imageUrl: "blob:http://localhost/image",
          assetId: "image-asset-1",
          persistence: "indexeddb",
          source: "generated",
        },
      },
      {
        id: "audio-1",
        type: "audio",
        position: { x: 20, y: 20 },
        data: {
          title: "IndexedDB 配音",
          nodeKind: "tts-audio",
          audioUrl: "blob:http://localhost/audio",
          audioAssetId: "audio-asset-1",
          durationSeconds: 3,
        } as any,
      },
    ]);

    assert.deepEqual(findRuntimeUrlLeaks(nodes), []);
    assert.equal(nodes[0]?.data.assetId, "image-asset-1");
    assert.equal(nodes[0]?.data.persistence, "indexeddb");
    assert.equal(nodes[0]?.data.source, "generated");
    assert.equal(nodes[0]?.data.imageUrl, undefined);
    assert.equal((nodes[1]?.data as any).audioAssetId, "audio-asset-1");
    assert.equal((nodes[1]?.data as any).durationSeconds, 3);
    assert.equal((nodes[1]?.data as any).audioUrl, undefined);
  });

  it("keeps shot generated image linkage metadata for downstream restore/export flows", () => {
    const nodes = buildProjectPackageCanvasNodes([
      {
        id: "shot-1",
        type: "shot",
        position: { x: 0, y: 0 },
        data: {
          title: "镜头 1",
          nodeKind: "shot",
          shot: {
            id: "shot-1",
            order: 1,
            title: "镜头 1",
            description: "测试镜头",
            visualPrompt: "minimal monochrome frame",
            generatedImageNodeId: "image-node-1",
            generatedImageAssetId: "image-asset-1",
            generatedImageUrl: "blob:http://localhost/generated-image",
          },
        } as any,
      },
    ]);

    assert.equal(nodes[0]?.data.shot?.generatedImageNodeId, "image-node-1");
    assert.equal(nodes[0]?.data.shot?.generatedImageAssetId, "image-asset-1");
    assert.equal(nodes[0]?.data.shot?.generatedImageUrl, undefined);
  });

  it("exports inline asset bytes into a project package asset manifest", () => {
    const assets = buildProjectPackageAssets([
      {
        data: {
          nodeKind: "ai-generated-image",
          assetId: "image-asset-1",
          imageUrl: "data:image/png;base64,AAAA",
          mimeType: "image/png",
          fileName: "shot.png",
          shot: {
            id: "shot-1",
            order: 1,
            title: "镜头 1",
            generatedImageAssetId: "shot-image-asset-1",
            generatedImageUrl: "data:image/png;base64,BBBB",
          },
        } as any,
      },
    ]);

    assert.deepEqual(assets, [
      {
        id: "image-asset-1",
        dataUrl: "data:image/png;base64,AAAA",
        mimeType: "image/png",
        fileName: "shot.png",
      },
      {
        id: "shot-image-asset-1",
        dataUrl: "data:image/png;base64,BBBB",
        mimeType: "image/png",
        fileName: "shot.png",
      },
    ]);
  });

  it("exports IndexedDB-only asset bytes into the project package manifest", async () => {
    const assets = await buildProjectPackageAssetsWithLocalBytes(
      [
        {
          data: {
            nodeKind: "ai-generated-image",
            assetId: "image-asset-1",
            persistence: "indexeddb",
            shot: {
              id: "shot-1",
              order: 1,
              title: "镜头 1",
              generatedImageAssetId: "image-asset-1",
            },
          } as any,
        },
      ],
      {
        getImageAsset: async (id) => ({
          id,
          blob: new Blob(["image-bytes"], { type: "image/png" }),
          mimeType: "image/png",
          size: 11,
          fileName: "shot.png",
          createdAt: 1,
          updatedAt: 1,
        }),
        getMediaAsset: async () => null,
        toDataUrl: async () => "data:image/png;base64,aW1hZ2UtYnl0ZXM=",
      },
    );

    assert.deepEqual(assets, [
      {
        id: "image-asset-1",
        dataUrl: "data:image/png;base64,aW1hZ2UtYnl0ZXM=",
        mimeType: "image/png",
        fileName: "shot.png",
      },
    ]);
  });

  it("exports IndexedDB-only video and audio asset bytes into the project package manifest", async () => {
    const mediaLookups: string[] = [];
    const assets = await buildProjectPackageAssetsWithLocalBytes(
      [
        {
          data: {
            nodeKind: "uploaded-video",
            assetId: "video-asset-1",
            persistence: "indexeddb",
            audioAssetId: "audio-asset-1",
            shot: {
              id: "shot-1",
              order: 1,
              title: "镜头 1",
              voiceAudioAssetId: "voice-asset-1",
            },
          } as any,
        },
      ],
      {
        getImageAsset: async () => null,
        getMediaAsset: async (id) => {
          mediaLookups.push(id);
          const mimeType = id === "video-asset-1" ? "video/mp4" : "audio/mpeg";
          return {
            id,
            blob: new Blob([`${id}-bytes`], { type: mimeType }),
            kind: mimeType.startsWith("video/") ? "video" : "audio",
            mimeType,
            size: 16,
            fileName: `${id}.${mimeType.startsWith("video/") ? "mp4" : "mp3"}`,
            createdAt: 1,
            updatedAt: 1,
          };
        },
        toDataUrl: async (blob) => `data:${blob.type};base64,${blob.size}`,
      },
    );

    assert.deepEqual(mediaLookups.sort(), ["audio-asset-1", "video-asset-1", "voice-asset-1"]);
    assert.deepEqual(assets, [
      {
        id: "video-asset-1",
        dataUrl: "data:video/mp4;base64,19",
        mimeType: "video/mp4",
        fileName: "video-asset-1.mp4",
      },
      {
        id: "audio-asset-1",
        dataUrl: "data:audio/mpeg;base64,19",
        mimeType: "audio/mpeg",
        fileName: "audio-asset-1.mp3",
      },
      {
        id: "voice-asset-1",
        dataUrl: "data:audio/mpeg;base64,19",
        mimeType: "audio/mpeg",
        fileName: "voice-asset-1.mp3",
      },
    ]);
  });
});

describe("getProjectPackageExportWarning", () => {
  it("only warns when the serialized package exceeds the configured byte limit", () => {
    assert.equal(getProjectPackageExportWarning("1234", 4), null);
    assert.match(
      getProjectPackageExportWarning("x".repeat(2 * 1024 * 1024), 1024 * 1024) ?? "",
      /项目包约 2\.00 MiB.*较大媒体素材.*继续导出/,
    );
  });
});
