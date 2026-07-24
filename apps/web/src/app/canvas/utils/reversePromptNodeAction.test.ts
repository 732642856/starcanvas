import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Edge, Node } from "@xyflow/react";
import type { AssetItem, CanvasNodeData } from "../components/canvas/types";
import { runReversePromptNodeAction } from "./reversePromptNodeAction.ts";

describe("runReversePromptNodeAction", () => {
  it("runs reverse prompt for an image node and appends a prompt node plus edge", async () => {
    const sourceNode: Node<CanvasNodeData> = {
      id: "image-1",
      type: "image",
      position: { x: 120, y: 80 },
      data: {
        nodeKind: "uploaded-image",
        imageUrl: "data:image/png;base64,abc",
        assetId: "asset-1",
        displayWidth: 340,
      },
    };
    const nodes: Node<CanvasNodeData>[] = [sourceNode];
    const edges: Edge[] = [];
    const assets: AssetItem[] = [];

    const result = await runReversePromptNodeAction({
      nodeId: "image-1",
      getNodes: () => nodes,
      setNodes: (updater) => {
        nodes.splice(0, nodes.length, ...updater(nodes));
      },
      setEdges: (updater) => {
        edges.splice(0, edges.length, ...updater(edges));
      },
      addAsset: (asset) => {
        assets.push(asset);
      },
      reverseImagePromptFn: async (input) => {
        assert.deepEqual(input, { imageUrl: "data:image/png;base64,abc", assetId: "asset-1" });
        return {
          prompt: "cinematic pearl",
          negativePrompt: "blur",
          qualityScore: 0.9,
          language: "en",
        };
      },
      createArtifactsInput: {
        idFactory: () => "prompt-1",
        now: () => 1_777_000_000_000,
      },
    });

    assert.equal(result.prompt, "cinematic pearl");
    assert.equal(nodes.length, 2);
    assert.equal(nodes[0].data.prompt, "cinematic pearl");
    assert.equal(nodes[1].id, "prompt-1");
    assert.equal(nodes[1].data.sourcePromptId, "image-1");
    assert.equal(nodes[1].data.syncToAssetLibrary, true);
    assert.equal(edges.length, 1);
    assert.deepEqual(
      { source: edges[0].source, target: edges[0].target, type: edges[0].type },
      {
        source: "image-1",
        target: "prompt-1",
        type: "creative",
      },
    );
    assert.deepEqual(
      assets.map((asset) => ({
        id: asset.id,
        type: asset.type,
        name: asset.name,
        prompt: asset.metadata?.prompt,
        sourceNodeId: asset.metadata?.sourceNodeId,
        promptNodeId: asset.metadata?.promptNodeId,
      })),
      [
        {
          id: "asset_prompt-1",
          type: "prompt",
          name: "反推提示词：image-1",
          prompt: "cinematic pearl",
          sourceNodeId: "image-1",
          promptNodeId: "prompt-1",
        },
      ],
    );
  });
});
