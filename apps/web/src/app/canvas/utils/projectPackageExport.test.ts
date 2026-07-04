import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findRuntimeUrlLeaks } from "../../../lib/storage/sanitizePersistedCanvas.ts";
import { buildProjectPackageCanvasNodes } from "./projectPackageExport.ts";

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
});
