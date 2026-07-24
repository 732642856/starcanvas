import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildViduVideoRequestPayload,
  persistGeneratedVideoResult,
  shouldReconnectViduSse,
  VideoGenerationError,
  videoResultToNodeData,
  type VideoGenResult,
} from "./videoGenerationService.ts"

describe("shouldReconnectViduSse", () => {
  const networkError = new VideoGenerationError({
    message: "Vidu SSE stream ended before a result",
    code: "NETWORK_ERROR",
    retryable: false,
  })

  it("reconnects exactly once after a transport interruption with a stable request id", () => {
    const input = { imageUrl: "https://cdn.example.com/keyframe.png", requestId: "production-video-shot-01" }
    assert.equal(shouldReconnectViduSse(input, networkError, 0), true)
    assert.equal(shouldReconnectViduSse(input, networkError, 1), false)
  })

  it("never auto-resubmits an unkeyed request or a confirmed provider error", () => {
    assert.equal(
      shouldReconnectViduSse({ imageUrl: "https://cdn.example.com/keyframe.png" }, networkError, 0),
      false,
    )
    assert.equal(
      shouldReconnectViduSse(
        { imageUrl: "https://cdn.example.com/keyframe.png", requestId: "production-video-shot-01" },
        new VideoGenerationError({ message: "provider rejected request", code: "API_ERROR", retryable: false }),
        0,
      ),
      false,
    )
  })
})

describe("buildViduVideoRequestPayload", () => {
  it("preserves a caller request id for server-side task reuse", () => {
    const payload = buildViduVideoRequestPayload({
      imageUrl: "https://cdn.example.com/keyframe.png",
      requestId: "production-video-shot-01",
    })

    assert.equal(payload.requestId, "production-video-shot-01")
  })

  it("uses reference-to-video without leaking a first-frame image", () => {
    const payload = buildViduVideoRequestPayload({
      imageUrl: "https://cdn.example.com/unused-first-frame.png",
      referenceImageUrls: [
        "https://cdn.example.com/zhaoheng.png",
        "https://cdn.example.com/jingchai.png",
      ],
      motionPrompt: "A restrained palace confrontation, slow dolly in.",
      aspectRatio: "9:16",
      durationSeconds: 3,
    })

    assert.deepEqual(payload, {
      mode: "r2v",
      prompt: "A restrained palace confrontation, slow dolly in.",
      referenceImageUrls: [
        "https://cdn.example.com/zhaoheng.png",
        "https://cdn.example.com/jingchai.png",
      ],
      duration: 3,
      resolution: "720P",
      size: "720*1280",
    })
    assert.equal("imageUrl" in payload, false)
  })

  it("keeps the existing image-to-video request when no references are selected", () => {
    assert.deepEqual(
      buildViduVideoRequestPayload({
        imageUrl: "https://cdn.example.com/keyframe.png",
        aspectRatio: "16:9",
      }),
      {
        mode: "i2v",
        prompt: "Generate a cinematic video from the image",
        imageUrl: "https://cdn.example.com/keyframe.png",
        duration: 5,
        resolution: "720P",
        size: "1280*720",
      },
    )
  })
})

describe("persistGeneratedVideoResult", () => {
  it("persists remote real-provider video results into a local media asset", async () => {
    const result: VideoGenResult = {
      videoUrl: "https://cdn.example.com/final.mp4",
      durationSeconds: 5,
      backend: "vidu",
    }

    const persisted = await persistGeneratedVideoResult(result, {
      fetchImpl: async (input) => {
        assert.equal(String(input), "https://cdn.example.com/final.mp4")
        return new Response(new Blob(["video"], { type: "video/mp4" }), { status: 200 })
      },
      persistMediaBlobFn: async (blob, options) => {
        assert.equal(blob.type, "video/mp4")
        assert.equal(options.kind, "video")
        assert.match(options.fileName || "", /^generated-video-\d+\.mp4$/)
        return {
          assetId: "video-asset-1",
          objectUrl: "blob:http://localhost/video-asset-1",
        }
      },
      hydrateMediaAssetFn: async (assetId) => {
        assert.equal(assetId, "video-asset-1")
        return "blob:http://localhost/video-asset-1-hydrated"
      },
    })

    assert.equal(persisted.videoUrl, "blob:http://localhost/video-asset-1-hydrated")
    assert.equal(persisted.assetId, "video-asset-1")
    assert.equal(persisted.persistence, "indexeddb")
  })

  it("skips persistence when the result already carries a local asset id", async () => {
    const result: VideoGenResult = {
      videoUrl: "blob:http://localhost/video-asset-1",
      durationSeconds: 5,
      backend: "vidu",
      assetId: "video-asset-1",
      persistence: "indexeddb",
    }

    const persisted = await persistGeneratedVideoResult(result, {
      fetchImpl: async () => {
        throw new Error("should not fetch existing local asset")
      },
    })

    assert.deepEqual(persisted, result)
  })

  it("falls back to the original remote url when local persistence fails", async () => {
    const result: VideoGenResult = {
      videoUrl: "https://cdn.example.com/final.mp4",
      durationSeconds: 5,
      backend: "vidu",
    }

    const warnings: unknown[][] = []
    const originalWarn = console.warn
    console.warn = (...args) => {
      warnings.push(args)
    }
    let persisted: VideoGenResult
    try {
      persisted = await persistGeneratedVideoResult(result, {
        fetchImpl: async () => {
          throw new Error("cors blocked")
        },
      })
    } finally {
      console.warn = originalWarn
    }

    assert.equal(persisted.videoUrl, "https://cdn.example.com/final.mp4")
    assert.equal(persisted.assetId, undefined)
    assert.equal(persisted.persistence, undefined)
    assert.equal(warnings.length, 1)
  })
})

describe("videoResultToNodeData", () => {
  it("includes recovered asset metadata when present", () => {
    const patch = videoResultToNodeData({
      videoUrl: "blob:http://localhost/video-asset-1",
      durationSeconds: 5,
      backend: "vidu",
      assetId: "video-asset-1",
      persistence: "indexeddb",
    })

    assert.equal(patch.resultUrl, "blob:http://localhost/video-asset-1")
    assert.equal(patch.assetId, "video-asset-1")
    assert.equal(patch.persistence, "indexeddb")
  })
})
