import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Node } from "@xyflow/react";
import type { CanvasNodeData } from "@/app/canvas/components/canvas/types";
import {
  findRuntimeUrlLeaks,
  sanitizeNodesForPersistence,
  sanitizePersistedNodeData,
} from "./sanitizePersistedCanvas.ts";

describe("sanitizePersistedCanvas", () => {
  it("removes top-level runtime image urls", () => {
    const clean = sanitizePersistedNodeData({
      imageUrl: "blob:http://localhost/image",
      assetUrl: "data:image/png;base64,AAAA",
      title: "kept",
    });

    assert.equal(clean.imageUrl, undefined);
    assert.equal(clean.assetUrl, undefined);
    assert.equal(clean.title, "kept");
  });

  it("removes nested generated and grid runtime urls", () => {
    const clean = sanitizePersistedNodeData({
      shot: {
        id: "shot-1",
        order: 1,
        title: "Shot 1",
        description: "desc",
        visualPrompt: "prompt",
        generatedImageUrl: "blob:http://localhost/generated",
      },
      storyboardGrid: {
        id: "grid-1",
        title: "Grid",
        shotNodeIds: [],
        columns: 3,
        maxShots: 9,
        outputImageUrl: "data:image/png;base64,BBBB",
      },
    });

    assert.equal(clean.shot?.generatedImageUrl, undefined);
    assert.equal(clean.storyboardGrid?.outputImageUrl, undefined);
  });

  it("removes nested generation reference data urls but keeps metadata", () => {
    const clean = sanitizePersistedNodeData({
      generation: {
        requestId: "req-1",
        referenceImage: {
          assetId: "asset-1",
          width: 1024,
          dataUrl: "data:image/jpeg;base64,CCCC",
          base64: "data:image/jpeg;base64,DDDD",
        },
      },
    });

    assert.equal(clean.generation.referenceImage.assetId, "asset-1");
    assert.equal(clean.generation.referenceImage.width, 1024);
    assert.equal(clean.generation.referenceImage.dataUrl, undefined);
    assert.equal(clean.generation.referenceImage.base64, undefined);
  });

  it("removes previewUrl, referenceImage.url, generationOutput images and arbitrary deep blob urls", () => {
    const clean = sanitizePersistedNodeData({
      previewUrl: "blob:http://localhost/preview",
      assetId: "asset-kept",
      mimeType: "image/png",
      imageWidth: 800,
      imageHeight: 600,
      generation: {
        requestId: "req-blob",
        referenceImage: {
          assetId: "reference-asset-kept",
          url: "blob:http://localhost/reference",
          dataUrl: "data:image/png;base64,FFFF",
          base64: "data:image/png;base64,GGGG",
          mimeType: "image/png",
          width: 800,
          height: 600,
        },
      },
      generationOutput: {
        images: [
          "blob:http://localhost/generated-1",
          "data:image/png;base64,HHHH",
          "https://cdn.example.com/generated.png",
        ],
        nested: {
          outputImageUrl: "blob:http://localhost/deep-output",
        },
      },
    } as CanvasNodeData);

    assert.equal(clean.previewUrl, undefined);
    assert.equal(clean.assetId, "asset-kept");
    assert.equal(clean.mimeType, "image/png");
    assert.equal(clean.imageWidth, 800);
    assert.equal(clean.imageHeight, 600);
    assert.equal(
      clean.generation.referenceImage.assetId,
      "reference-asset-kept",
    );
    assert.equal(clean.generation.referenceImage.url, undefined);
    assert.equal(clean.generation.referenceImage.dataUrl, undefined);
    assert.equal(clean.generation.referenceImage.base64, undefined);
    assert.equal(clean.generation.referenceImage.mimeType, "image/png");
    assert.deepEqual(clean.generationOutput.images, [
      "https://cdn.example.com/generated.png",
    ]);
    assert.equal(clean.generationOutput.nested.outputImageUrl, undefined);
  });

  it("keeps shot image lineage and character identity metadata while removing runtime image urls", () => {
    const clean = sanitizePersistedNodeData({
      imageUrl: "blob:http://localhost/shot-image",
      assetId: "asset-kept",
      sourceType: "shot",
      sourceShotId: "shot-node-1",
      sourceStoryboardNodeId: "storyboard-1",
      sourcePrompt: "cinematic wide shot",
      generatedAt: "2026-05-25T10:00:00.000Z",
      shot: {
        id: "shot-1",
        order: 3,
        title: "Shot 3",
        description: "desc",
        visualPrompt: "prompt",
        generatedImageUrl: "blob:http://localhost/generated-shot",
        generatedImageAssetId: "shot-asset-kept",
        characterIdentities: [
          {
            id: "local-linxia",
            referenceAssetId: "character-linxia-library",
            name: "女主林夏",
            role: "protagonist",
            visualSignature: "global edit: exact oval face and black bob haircut",
            costume: "global edit: same red wool coat with brass buttons",
            props: ["silver locket", "black umbrella"],
          },
        ],
      },
    } as CanvasNodeData);

    assert.equal(clean.imageUrl, undefined);
    assert.equal(clean.assetId, "asset-kept");
    assert.equal(clean.sourceType, "shot");
    assert.equal(clean.sourceShotId, "shot-node-1");
    assert.equal(clean.sourceStoryboardNodeId, "storyboard-1");
    assert.equal(clean.sourcePrompt, "cinematic wide shot");
    assert.equal(clean.generatedAt, "2026-05-25T10:00:00.000Z");
    assert.equal(clean.shot?.generatedImageUrl, undefined);
    assert.equal(clean.shot?.generatedImageAssetId, "shot-asset-kept");
    assert.equal(clean.shot?.characterIdentities?.[0]?.referenceAssetId, "character-linxia-library");
    assert.equal(clean.shot?.characterIdentities?.[0]?.visualSignature, "global edit: exact oval face and black bob haircut");
    assert.equal(clean.shot?.characterIdentities?.[0]?.costume, "global edit: same red wool coat with brass buttons");
    assert.deepEqual(clean.shot?.characterIdentities?.[0]?.props, ["silver locket", "black umbrella"]);
  });

  it("keeps storyboard composite lineage metadata while removing runtime image urls", () => {
    const clean = sanitizePersistedNodeData({
      title: "4 格分镜图",
      imageUrl: "blob:http://localhost/composite-object-url",
      assetId: "composite-asset-kept",
      source: "generated",
      sourceType: "shot",
      sourcePrompt: "镜头 1: wide shot",
      prompt: "生成一张 2x2 的电影分镜图",
      generation: {
        requestId: "req-composite",
        userPrompt: "生成一张 2x2 的电影分镜图",
        referenceImage: {
          assetId: "reference-kept",
          dataUrl: "data:image/png;base64,REFERENCE",
          base64: "data:image/png;base64,REFERENCE_BASE64",
        },
      },
      generationOutput: {
        type: "storyboard-composite",
        sourceShotIds: ["shot-1", "shot-2", "shot-3", "shot-4"],
        layout: { columns: 2, rows: 2 },
        outputImageUrl: "data:image/png;base64,COMPOSITE",
      },
      persistence: "indexeddb",
    } as CanvasNodeData);

    assert.equal(clean.imageUrl, undefined);
    assert.equal(clean.assetId, "composite-asset-kept");
    assert.equal(clean.persistence, "indexeddb");
    assert.equal(clean.sourceType, "shot");
    assert.equal(clean.generation.referenceImage.dataUrl, undefined);
    assert.equal(clean.generation.referenceImage.base64, undefined);
    assert.equal(clean.generationOutput.outputImageUrl, undefined);
    assert.deepEqual(clean.generationOutput.sourceShotIds, [
      "shot-1",
      "shot-2",
      "shot-3",
      "shot-4",
    ]);
    assert.deepEqual(clean.generationOutput.layout, { columns: 2, rows: 2 });
  });

  it("removes runtime video urls from real frame extraction output", () => {
    const clean = sanitizePersistedNodeData({
      nodeKind: "video-sample-frames",
      generationOutput: {
        mode: "real-browser-extraction",
        sourceVideo: {
          nodeId: "uploaded-video-1",
          url: "blob:http://localhost/video-source",
          name: "clip.webm",
        },
        frames: [
          {
            sourceVideoId: "uploaded-video-1",
            sourceVideoUrl: "blob:http://localhost/video-source",
            timestampMs: 500,
            frameIndex: 0,
            imageUrl: "data:image/jpeg;base64,FRAME",
          },
        ],
      },
    } as CanvasNodeData);

    assert.equal(clean.generationOutput.sourceVideo.url, undefined);
    assert.equal(clean.generationOutput.frames[0].sourceVideoUrl, undefined);
    assert.equal(clean.generationOutput.frames[0].imageUrl, undefined);
    assert.equal(clean.generationOutput.frames[0].sourceVideoId, "uploaded-video-1");
    assert.equal(clean.generationOutput.frames[0].timestampMs, 500);
    assert.deepEqual(findRuntimeUrlLeaks(clean), []);
  });

  it("removes reference frame runtime urls from imported storyboard shots", () => {
    const clean = sanitizePersistedNodeData({
      nodeKind: "shot",
      thumbnailUrl: "data:image/jpeg;base64,THUMB",
      shot: {
        id: "shot-ref-1",
        order: 1,
        title: "Reference shot",
        description: "desc",
        visualPrompt: "prompt",
        referenceImageUrl: "data:image/jpeg;base64,REFERENCE",
        sourceType: "reference-video",
        sourceMeta: {
          sourceVideoId: "video-1",
          timestampMs: 12500,
          timeSec: 12.5,
        },
      },
    } as CanvasNodeData);

    assert.equal(clean.thumbnailUrl, undefined);
    assert.equal(clean.shot?.referenceImageUrl, undefined);
    assert.equal(clean.shot?.sourceType, "reference-video");
    assert.equal(clean.shot?.sourceMeta?.sourceVideoId, "video-1");
    assert.equal(clean.shot?.sourceMeta?.timestampMs, 12500);
    assert.equal(clean.shot?.sourceMeta?.timeSec, 12.5);
    assert.deepEqual(findRuntimeUrlLeaks(clean), []);
  });

  it("removes reverse-prompt sourceImageUrl runtime urls while keeping source identity metadata", () => {
    const clean = sanitizePersistedNodeData({
      nodeKind: "prompt",
      sourcePromptId: "image-node-1",
      generationOutput: {
        type: "reverse-prompt",
        prompt: "cinematic portrait, soft rim light",
        sourceNodeId: "image-node-1",
        sourceAssetId: "asset-source-1",
        sourceImageUrl: "blob:http://localhost/reverse-prompt-source",
      },
    } as CanvasNodeData);

    assert.equal(clean.sourcePromptId, "image-node-1");
    assert.equal(clean.generationOutput.type, "reverse-prompt");
    assert.equal(clean.generationOutput.sourceNodeId, "image-node-1");
    assert.equal(clean.generationOutput.sourceAssetId, "asset-source-1");
    assert.equal(clean.generationOutput.sourceImageUrl, undefined);
    assert.deepEqual(findRuntimeUrlLeaks(clean), []);
  });

  it("sanitizes nodes and reports no remaining runtime leaks", () => {
    const nodes: Node<CanvasNodeData>[] = [
      {
        id: "node-1",
        type: "image",
        position: { x: 0, y: 0 },
        data: {
          imageUrl: "blob:http://localhost/image",
          assetId: "asset-1",
          generationOutput: {
            images: ["data:image/png;base64,EEEE"],
          },
        },
      },
    ];

    const clean = sanitizeNodesForPersistence(nodes);
    assert.deepEqual(findRuntimeUrlLeaks(clean), []);
  });
});
