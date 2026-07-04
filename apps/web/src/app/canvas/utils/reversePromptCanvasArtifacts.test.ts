import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Node } from "@xyflow/react";
import type { CanvasNodeData } from "../components/canvas/types";
import { createReversePromptCanvasArtifacts } from "./reversePromptCanvasArtifacts.ts";

describe("createReversePromptCanvasArtifacts", () => {
  it("creates an editable prompt node and creative edge from an image reverse-prompt result", () => {
    const sourceNode: Node<CanvasNodeData> = {
      id: "image-1",
      type: "image",
      position: { x: 120, y: 80 },
      data: {
        title: "Reference",
        nodeKind: "uploaded-image",
        imageUrl: "blob:http://localhost/image",
        assetId: "asset-1",
        displayWidth: 340,
      },
    };

    const artifacts = createReversePromptCanvasArtifacts({
      sourceNode,
      result: {
        prompt: "cinematic macro shot of a glowing pearl on black velvet",
        negativePrompt: "text, watermark, blurry",
        qualityScore: 0.88,
        language: "en",
      },
      idFactory: () => "prompt-1",
      now: () => 1_777_000_000_000,
    });

    assert.deepEqual(
      {
        id: artifacts.node.id,
        type: artifacts.node.type,
        position: artifacts.node.position,
        data: {
          title: artifacts.node.data.title,
          nodeKind: artifacts.node.data.nodeKind,
          prompt: artifacts.node.data.prompt,
          content: artifacts.node.data.content,
          text: artifacts.node.data.text,
          sourcePromptId: artifacts.node.data.sourcePromptId,
          sourceType: artifacts.node.data.sourceType,
          generatedAt: artifacts.node.data.generatedAt,
          syncToAssetLibrary: artifacts.node.data.syncToAssetLibrary,
          assetLibraryType: artifacts.node.data.assetLibraryType,
          assetLibraryFolder: artifacts.node.data.assetLibraryFolder,
          assetLibraryTags: artifacts.node.data.assetLibraryTags,
        },
      },
      {
        id: "prompt-1",
        type: "content",
        position: { x: 520, y: 80 },
        data: {
          title: "反推提示词",
          nodeKind: "prompt",
          prompt: "cinematic macro shot of a glowing pearl on black velvet",
          content: "cinematic macro shot of a glowing pearl on black velvet",
          text: "cinematic macro shot of a glowing pearl on black velvet",
          sourcePromptId: "image-1",
          sourceType: "image",
          generatedAt: "2026-04-24T03:06:40.000Z",
          syncToAssetLibrary: true,
          assetLibraryType: "prompt",
          assetLibraryFolder: "Others",
          assetLibraryTags: ["reverse-prompt", "image-to-prompt", "prompt"],
        },
      },
    );
    assert.match(String(artifacts.node.data.summary), /Negative prompt: text, watermark, blurry/);
    assert.deepEqual(
      {
        type: artifacts.node.data.generationOutput.type,
        sourceNodeId: artifacts.node.data.generationOutput.sourceNodeId,
        sourceAssetId: artifacts.node.data.generationOutput.sourceAssetId,
        qualityScore: artifacts.node.data.generationOutput.qualityScore,
        language: artifacts.node.data.generationOutput.language,
      },
      {
        type: "reverse-prompt",
        sourceNodeId: "image-1",
        sourceAssetId: "asset-1",
        qualityScore: 0.88,
        language: "en",
      },
    );
    assert.deepEqual(
      {
        id: artifacts.edge.id,
        source: artifacts.edge.source,
        target: artifacts.edge.target,
        type: artifacts.edge.type,
        animated: artifacts.edge.animated,
      },
      {
        id: "edge-image-1-prompt-1",
        source: "image-1",
        target: "prompt-1",
        type: "creative",
        animated: true,
      },
    );
    assert.deepEqual(
      {
        id: artifacts.asset.id,
        type: artifacts.asset.type,
        name: artifacts.asset.name,
        folder: artifacts.asset.folder,
        tags: artifacts.asset.tags,
        createdAt: artifacts.asset.createdAt,
        prompt: artifacts.asset.metadata?.prompt,
        sourceNodeId: artifacts.asset.metadata?.sourceNodeId,
        promptNodeId: artifacts.asset.metadata?.promptNodeId,
        sourceImageUrl: artifacts.asset.metadata?.sourceImageUrl,
        negativePrompt: artifacts.asset.metadata?.negativePrompt,
        qualityScore: artifacts.asset.metadata?.qualityScore,
        language: artifacts.asset.metadata?.language,
      },
      {
        id: "asset_prompt-1",
        type: "prompt",
        name: "反推提示词：Reference",
        folder: "Others",
        tags: ["reverse-prompt", "image-to-prompt", "prompt"],
        createdAt: 1_777_000_000_000,
        prompt: "cinematic macro shot of a glowing pearl on black velvet",
        sourceNodeId: "image-1",
        promptNodeId: "prompt-1",
        sourceImageUrl: "blob:http://localhost/image",
        negativePrompt: "text, watermark, blurry",
        qualityScore: 0.88,
        language: "en",
      },
    );
  });
});
