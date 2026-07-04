import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Node } from "@xyflow/react";
import type { CanvasNodeData } from "../components/canvas/types";
import {
  buildVideoWorkflowChain,
  createUploadedVideoNode,
} from "./videoWorkflowChain.ts";

function createIdGenerator() {
  let index = 0;
  return () => `id-${++index}`;
}

describe("videoWorkflowChain", () => {
  it("creates an uploaded video node with runnable source fields", () => {
    const node = createUploadedVideoNode({
      id: "video-1",
      title: "clip.webm",
      url: "blob:http://localhost/clip",
      assetId: "media-asset-1",
      persistence: "indexeddb",
      fileName: "clip.webm",
      fileSize: 1234,
      mimeType: "video/webm",
      width: 160,
      height: 90,
      durationMs: 1500,
      position: { x: 10, y: 20 },
    });

    assert.equal(node.type, "video");
    assert.equal(node.data.nodeKind, "uploaded-video");
    assert.equal(node.data.assetUrl, "blob:http://localhost/clip");
    assert.equal(node.data.imageUrl, "blob:http://localhost/clip");
    assert.equal(node.data.resultUrl, "blob:http://localhost/clip");
    assert.equal(node.data.assetId, "media-asset-1");
    assert.equal(node.data.persistence, "indexeddb");
    assert.equal(node.data.videoWidth, 160);
    assert.equal(node.data.videoHeight, 90);
    assert.equal(node.data.runMeta?.runStatus, "succeeded");
  });

  it("builds a connected video -> sample frames -> analyze chain", () => {
    const sourceNode: Node<CanvasNodeData> = createUploadedVideoNode({
      id: "video-source",
      title: "source.mp4",
      url: "blob:http://localhost/source",
      position: { x: 100, y: 200 },
    });

    const result = buildVideoWorkflowChain({
      sourceNode,
      generateId: createIdGenerator(),
      edgeStyle: { stroke: "#999", strokeWidth: 2 },
    });

    assert.equal(result.nodes.length, 2);
    assert.equal(result.edges.length, 2);
    assert.equal(result.nodes[0].data.nodeKind, "video-sample-frames");
    assert.equal(result.nodes[1].data.nodeKind, "video-analyze");
    assert.equal(result.nodes[0].position.x, 460);
    assert.equal(result.nodes[1].position.x, 820);
    assert.equal(result.edges[0].source, "video-source");
    assert.equal(result.edges[0].target, result.nodes[0].id);
    assert.equal(result.edges[1].source, result.nodes[0].id);
    assert.equal(result.edges[1].target, result.nodes[1].id);
  });
});
