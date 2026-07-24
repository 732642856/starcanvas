import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ProductionRunQueueTask } from "../../../../../lib/storyboard/productionRunQueue.ts";
import { buildProductionTaskUsageRecord } from "./productionTaskUsage.ts";

function makeTask(action: ProductionRunQueueTask["action"]): ProductionRunQueueTask {
  return {
    id: `shot-1:${action}`,
    shotId: "shot-1",
    order: 1,
    title: "镜头 1",
    action,
    status: "running",
    progress: 0.5,
  };
}

describe("buildProductionTaskUsageRecord", () => {
  it("records storyboard image generation as one image usage", () => {
    const record = buildProductionTaskUsageRecord({
      task: makeTask("generate-storyboard-image"),
      nodeId: "node-1",
      provider: "copse",
      model: "gpt-image-2",
      startedAt: "2026-06-23T00:00:00.000Z",
      finishedAt: "2026-06-23T00:00:02.000Z",
      status: "success",
      imageSize: "1792x1024",
    });

    assert.equal(record.taskType, "image");
    assert.equal(record.nodeId, "node-1");
    assert.equal(record.imageCount, 1);
    assert.equal(record.imageSize, "1792x1024");
    assert.equal(record.estimatedCostUsd, 0.05);
  });

  it("records video generation duration without inventing unknown pricing", () => {
    const record = buildProductionTaskUsageRecord({
      task: makeTask("generate-video-clip"),
      provider: "vidu",
      model: "viduq3-turbo",
      startedAt: "2026-06-23T00:00:00.000Z",
      finishedAt: "2026-06-23T00:01:00.000Z",
      status: "success",
      videoSeconds: 8,
      videoResolution: "720p",
    });

    assert.equal(record.taskType, "video");
    assert.equal(record.videoSeconds, 8);
    assert.equal(record.videoResolution, "720p");
    assert.equal(record.estimatedCostUsd, undefined);
  });

  it("records failed TTS tasks as audio failures", () => {
    const record = buildProductionTaskUsageRecord({
      task: makeTask("generate-voice-track"),
      provider: "voxcpm",
      model: "VoxCPM",
      startedAt: "2026-06-23T00:00:00.000Z",
      finishedAt: "2026-06-23T00:00:01.000Z",
      status: "failed",
      error: "tts timeout",
    });

    assert.equal(record.taskType, "audio");
    assert.equal(record.status, "failed");
    assert.equal(record.error, "tts timeout");
  });
});
