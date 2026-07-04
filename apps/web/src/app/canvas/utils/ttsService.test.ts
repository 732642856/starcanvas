import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LocalMediaAsset } from "../../../lib/assets/localMediaStore.ts";
import { persistTtsAudio } from "./ttsService.ts";

describe("persistTtsAudio", () => {
  it("persists generated speech as an IndexedDB media asset", async () => {
    const savedAssets: LocalMediaAsset[] = [];
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/wav" });

    const result = await persistTtsAudio(blob, {
      fileName: "shot-voice.wav",
      createAssetIdFn: () => "tts-asset-1",
      createObjectUrlFn: (assetId) => `blob:http://localhost/${assetId}`,
      saveFn: async (asset) => {
        savedAssets.push(asset);
      },
    });

    assert.equal(result.assetId, "tts-asset-1");
    assert.equal(result.objectUrl, "blob:http://localhost/tts-asset-1");
    assert.equal(savedAssets.length, 1);
    assert.equal(savedAssets[0]?.id, "tts-asset-1");
    assert.equal(savedAssets[0]?.kind, "audio");
    assert.equal(savedAssets[0]?.fileName, "shot-voice.wav");
    assert.equal(savedAssets[0]?.mimeType, "audio/wav");
    assert.equal(savedAssets[0]?.size, 4);
    assert.equal(savedAssets[0]?.blob, blob);
  });
});
