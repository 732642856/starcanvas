import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Node } from "@xyflow/react";
import type { CanvasNodeData } from "../components/canvas/types";
import { hydrateCanvasMediaNodes } from "./useCanvasPersistence.ts";

describe("hydrateCanvasMediaNodes", () => {
  it("hydrates focus-edit masks from indexeddb assets", async () => {
    const nodes: Node<CanvasNodeData>[] = [{
      id: "focus-edit-1",
      type: "workflow",
      position: { x: 0, y: 0 },
      data: {
        nodeKind: "focus-edit",
        focusEditMaskAssetId: "focus-mask-1",
      },
    }];

    const hydrated = await hydrateCanvasMediaNodes(nodes, {
      hydrateImageAssetFn: async (assetId) => `blob:http://localhost/${assetId}`,
    });

    assert.equal(hydrated[0]?.data.focusEditMaskDataUrl, "blob:http://localhost/focus-mask-1");
  });

  it("hydrates generated video nodes from indexeddb media assets", async () => {
    const nodes: Node<CanvasNodeData>[] = [
      {
        id: "video-1",
        type: "content",
        position: { x: 0, y: 0 },
        data: {
          title: "生成视频",
          nodeKind: "video-generation",
          assetId: "video-asset-1",
          persistence: "indexeddb",
        },
      },
    ]

    const hydrated = await hydrateCanvasMediaNodes(nodes, {
      hydrateMediaAssetFn: async (assetId) => `blob:http://localhost/${assetId}`,
    })

    const data = hydrated[0]?.data
    assert.equal(data?.resultUrl, "blob:http://localhost/video-asset-1")
    assert.equal(data?.assetUrl, "blob:http://localhost/video-asset-1")
    assert.equal(data?.persistence, "indexeddb")
    assert.equal(data?.loadError, undefined)
  })

  it("marks generated video nodes missing when the stored media asset cannot be hydrated", async () => {
    const nodes: Node<CanvasNodeData>[] = [
      {
        id: "video-1",
        type: "content",
        position: { x: 0, y: 0 },
        data: {
          title: "生成视频",
          nodeKind: "video-generation",
          assetId: "video-asset-1",
          persistence: "indexeddb",
        },
      },
    ]

    const hydrated = await hydrateCanvasMediaNodes(nodes, {
      hydrateMediaAssetFn: async () => null,
    })

    const data = hydrated[0]?.data
    assert.equal(data?.resultUrl, undefined)
    assert.equal(data?.assetUrl, undefined)
    assert.equal(data?.persistence, "missing")
    assert.equal(data?.loadError, "asset-not-found")
  })

  it("hydrates independent TTS audio nodes from media asset ids", async () => {
    const nodes: Node<CanvasNodeData>[] = [
      {
        id: "audio-1",
        type: "audio",
        position: { x: 0, y: 0 },
        data: {
          title: "PQ镜头 1 配音",
          nodeKind: "tts-audio",
          audioAssetId: "tts-asset-1",
        } as CanvasNodeData & { audioAssetId: string },
      },
    ];

    const hydrated = await hydrateCanvasMediaNodes(nodes, {
      hydrateMediaAssetFn: async (assetId) => `blob:http://localhost/${assetId}`,
    });

    const data = hydrated[0]?.data as CanvasNodeData & { audioUrl?: string };
    assert.equal(data.audioUrl, "blob:http://localhost/tts-asset-1");
    assert.equal(data.loadError, undefined);
  });

  it("hydrates legacy shot voice audio assets", async () => {
    const nodes: Node<CanvasNodeData>[] = [
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
            description: "desc",
            visualPrompt: "prompt",
            voiceAudioAssetId: "voice-asset-1",
          },
        } as CanvasNodeData,
      },
    ];

    const hydrated = await hydrateCanvasMediaNodes(nodes, {
      hydrateMediaAssetFn: async (assetId) => `blob:http://localhost/${assetId}`,
    });

    assert.equal(
      hydrated[0]?.data.shot?.voiceAudioUrl,
      "blob:http://localhost/voice-asset-1",
    );
    assert.equal(hydrated[0]?.data.loadError, undefined);
  });

  it("hydrates shot character view assets from indexeddb image ids", async () => {
    const nodes: Node<CanvasNodeData>[] = [
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
            description: "desc",
            visualPrompt: "prompt",
            characterIdentities: [
              {
                id: "linwu",
                name: "林雾",
                frontViewAssetId: "front-asset-1",
                sideViewAssetId: "side-asset-1",
                backViewAssetId: "back-asset-1",
              },
            ],
          },
        } as CanvasNodeData,
      },
    ];

    const hydrated = await hydrateCanvasMediaNodes(nodes, {
      hydrateImageAssetFn: async (assetId) => `blob:http://localhost/${assetId}`,
    });

    const identity = hydrated[0]?.data.shot?.characterIdentities?.[0];
    assert.equal(identity?.frontViewUrl, "blob:http://localhost/front-asset-1");
    assert.equal(identity?.sideViewUrl, "blob:http://localhost/side-asset-1");
    assert.equal(identity?.backViewUrl, "blob:http://localhost/back-asset-1");
  });
});
