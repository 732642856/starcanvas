import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Node } from "@xyflow/react";
import type { CanvasNodeData } from "../components/canvas/types";
import { hydrateCanvasMediaNodes } from "./useCanvasPersistence.ts";

describe("hydrateCanvasMediaNodes", () => {
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
});
