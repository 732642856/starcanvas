import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Node } from "@xyflow/react";
import type {
  AssetItem,
  CanvasNodeData,
} from "@/app/canvas/components/canvas/types";
import {
  buildAssetRefFromNode,
  buildAssetRefs,
  findAssetRefByMentionId,
} from "./asset-ref.ts";

function node(id: string, data: CanvasNodeData, type = "image"): Node<CanvasNodeData> {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data,
  };
}

describe("asset-ref", () => {
  it("builds a stable asset ref from an uploaded video node", () => {
    const ref = buildAssetRefFromNode(
      node(
        "video-node-1",
        {
          nodeKind: "uploaded-video",
          title: "clip.webm",
          assetId: "media-asset-1",
          assetUrl: "blob:http://localhost/video",
          thumbnailUrl: "blob:http://localhost/thumb",
          mimeType: "video/webm",
        },
        "video",
      ),
    );

    assert.equal(ref?.id, "asset_media-asset-1");
    assert.equal(ref?.type, "video");
    assert.equal(ref?.label, "clip.webm");
    assert.equal(ref?.source, "canvas-node");
    assert.equal(ref?.nodeId, "video-node-1");
    assert.equal(ref?.assetId, "media-asset-1");
    assert.equal(ref?.url, "blob:http://localhost/video");
  });

  it("uses node id when a canvas asset has no persisted assetId", () => {
    const ref = buildAssetRefFromNode(
      node("remote-image-node", {
        nodeKind: "ai-generated-image",
        title: "远程参考图",
        imageUrl: "https://example.com/image.png",
      }),
    );

    assert.equal(ref?.id, "asset_remote-image-node");
    assert.equal(ref?.type, "image");
    assert.equal(ref?.source, "canvas-node");
  });

  it("merges canvas and library refs with stable de-duplication", () => {
    const assets: AssetItem[] = [
      {
        id: "media-asset-1",
        type: "video",
        name: "Library duplicate",
        folder: "Others",
        createdAt: Date.now(),
        src: "https://example.com/library.mp4",
      },
      {
        id: "library-bg",
        type: "image",
        name: "背景图",
        folder: "Scene",
        createdAt: Date.now(),
        src: "https://example.com/bg.png",
      },
    ];

    const refs = buildAssetRefs(
      [
        node("video-node-1", {
          nodeKind: "uploaded-video",
          title: "clip.webm",
          assetId: "media-asset-1",
          assetUrl: "blob:http://localhost/video",
        }, "video"),
      ],
      assets,
    );

    assert.equal(refs.length, 2);
    assert.equal(refs[0].label, "clip.webm");
    assert.equal(refs[1].id, "asset_library-bg");
  });

  it("finds refs by inserted mention token, raw asset id, or node id", () => {
    const refs = buildAssetRefs(
      [
        node("video-node-1", {
          nodeKind: "uploaded-video",
          title: "clip.webm",
          assetId: "media-asset-1",
          assetUrl: "blob:http://localhost/video",
        }, "video"),
      ],
      [],
    );

    assert.equal(findAssetRefByMentionId(refs, "asset_media-asset-1")?.label, "clip.webm");
    assert.equal(findAssetRefByMentionId(refs, "media-asset-1")?.label, "clip.webm");
    assert.equal(findAssetRefByMentionId(refs, "video-node-1")?.label, "clip.webm");
  });
});
