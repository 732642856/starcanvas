import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Edge, Node } from "@xyflow/react";
import type { CanvasNodeData } from "@/app/canvas/components/canvas/types";
import { createShotImageArtifacts } from "./createShotImageArtifacts.ts";

function makeShotNode(
  overrides: Partial<NonNullable<CanvasNodeData["shot"]>> = {},
): Node<CanvasNodeData> {
  return {
    id: "shot-node-1",
    type: "shot",
    position: { x: 100, y: 200 },
    width: 300,
    data: {
      sourceStoryboardNodeId: "storyboard-1",
      displayWidth: 300,
      shot: {
        id: "shot-1",
        order: 3,
        title: "天安门广场远景",
        description: "白天的天安门广场",
        visualPrompt: "cinematic wide shot",
        sourceStoryboardNodeId: "storyboard-1",
        ...overrides,
      },
    },
  };
}

describe("createShotImageArtifacts", () => {
  it("syncs generated image back into shot fields", () => {
    const shotNode = makeShotNode();
    const generatedAt = "2026-07-05T12:00:00.000Z";

    const result = createShotImageArtifacts({
      shotNode,
      existingNodes: [shotNode],
      existingEdges: [],
      generationResult: {
        imageUrl: "blob:http://localhost/generated",
        assetId: "asset-1",
        model: "gpt-image-2",
        generationId: "req-1",
      },
      prompt: "new cinematic prompt",
      generatedAt,
      generationFinishedAt: 123456789,
      imageNodeId: "image-node-1",
    });

    assert.equal(result.mode, "create");
    assert.equal(result.shotNode.data.prompt, "new cinematic prompt");
    assert.equal(result.shotNode.data.imageUrl, "blob:http://localhost/generated");
    assert.equal(result.shotNode.data.generatedImageUrl, "blob:http://localhost/generated");
    assert.equal(result.shotNode.data.shot?.generatedImageUrl, "blob:http://localhost/generated");
    assert.equal(result.shotNode.data.shot?.generatedImageAssetId, "asset-1");
    assert.equal(result.shotNode.data.shot?.generatedImageNodeId, "image-node-1");
    assert.equal(result.shotNode.data.shot?.generationStatus, "succeeded");
    assert.equal(result.shotNode.data.shot?.status, "done");
    assert.equal(result.shotNode.data.shot?.generationFinishedAt, 123456789);
    assert.equal(result.shotNode.data.shot?.generationRequestId, "req-1");
    assert.equal(result.shotNode.data.shot?.lastGeneratedAt, generatedAt);
  });

  it("reuses the existing generated image node when redrawing a shot", () => {
    const shotNode = makeShotNode({ generatedImageNodeId: "image-node-1" });
    const existingImageNode: Node<CanvasNodeData> = {
      id: "image-node-1",
      type: "image",
      position: { x: 480, y: 200 },
      data: {
        title: "旧图",
        imageUrl: "https://cdn.example.com/old.png",
        sourceShotId: "shot-node-1",
        assetId: "old-asset",
        createdAt: 1,
      },
    };
    const existingEdge: Edge = {
      id: "edge-generated-image-shot-node-1-image-node-1",
      source: "shot-node-1",
      target: "image-node-1",
      type: "creative",
    };

    const result = createShotImageArtifacts({
      shotNode,
      existingNodes: [shotNode, existingImageNode],
      existingEdges: [existingEdge],
      generationResult: {
        imageUrl: "blob:http://localhost/new-shot",
        assetId: "asset-new",
      },
      prompt: "redraw prompt",
      generatedAt: "2026-07-05T12:05:00.000Z",
      generationFinishedAt: 234567890,
      imageNodeId: "fresh-image-node",
    });

    assert.equal(result.mode, "update");
    assert.equal(result.imageNode.id, "image-node-1");
    assert.equal(result.imageNode.data.imageUrl, "blob:http://localhost/new-shot");
    assert.equal(result.imageNode.data.assetId, "asset-new");
    assert.equal(result.shotNode.data.imageUrl, "blob:http://localhost/new-shot");
    assert.equal(result.shotNode.data.generatedImageUrl, "blob:http://localhost/new-shot");
    assert.equal(result.shotNode.data.shot?.generatedImageNodeId, "image-node-1");
    assert.equal(result.edge.target, "image-node-1");
});
});
