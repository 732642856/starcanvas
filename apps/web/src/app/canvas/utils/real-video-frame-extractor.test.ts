#!/usr/bin/env node --experimental-strip-types

export {};

import type { Edge, Node } from "@xyflow/react";
import type { CanvasNodeData } from "../components/canvas/types.ts";
import {
  collectWorkflowVideoSources,
  getVideoSourceFromNode,
} from "./real-video-frame-extractor.ts";
import { computeSceneChangeFrameSelections } from "../../../features/reverse-storyboard/computeSceneChangeFrameTimes.ts";

const assert = {
  equal(actual: unknown, expected: unknown, msg?: string) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) {
      throw new Error(`${msg ?? "assertion failed"}\n  expected: ${e}\n  actual:   ${a}`);
    }
  },
  ok(value: unknown, msg?: string) {
    if (!value) throw new Error(msg ?? "expected truthy");
  },
};

function node(id: string, data: CanvasNodeData): Node<CanvasNodeData> {
  return {
    id,
    type: "workflow",
    position: { x: 0, y: 0 },
    data,
  };
}

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${(error as Error).message}`);
    process.exitCode = 1;
  }
}

function makeFrame(value: number): ImageData {
  const data = new Uint8ClampedArray(4 * 4 * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }
  return { data, width: 4, height: 4 } as ImageData;
}

test("getVideoSourceFromNode reads uploaded-video assetUrl", () => {
  const source = getVideoSourceFromNode(node("video-1", {
    nodeKind: "uploaded-video",
    title: "参考视频",
    assetUrl: "blob:https://local/video",
    mimeType: "video/mp4",
    videoDurationMs: 3200,
    videoWidth: 1920,
    videoHeight: 1080,
  }));

  assert.ok(source);
  assert.equal(source?.nodeId, "video-1");
  assert.equal(source?.url, "blob:https://local/video");
  assert.equal(source?.durationMs, 3200);
});

test("getVideoSourceFromNode reads generated video resultUrl", () => {
  const source = getVideoSourceFromNode(node("gen-1", {
    nodeKind: "video-result",
    resultUrl: "https://cdn.example.com/result.mp4",
    title: "生成成片",
  }));

  assert.equal(source?.url, "https://cdn.example.com/result.mp4");
});

test("getVideoSourceFromNode ignores image-only nodes", () => {
  const source = getVideoSourceFromNode(node("image-1", {
    nodeKind: "uploaded-image",
    imageUrl: "data:image/png;base64,abc",
    title: "图片",
  }));

  assert.equal(source, undefined);
});

test("collectWorkflowVideoSources prefers upstream videos and dedupes by url", () => {
  const target = node("analyze-1", { nodeKind: "video-analyze", title: "分析" });
  const upstreamA = node("video-a", {
    nodeKind: "uploaded-video",
    assetUrl: "blob:https://local/video-a",
    title: "A",
  });
  const upstreamB = node("video-b", {
    nodeKind: "video-result",
    resultUrl: "blob:https://local/video-a",
    title: "B duplicate",
  });
  const edges: Edge[] = [
    { id: "e1", source: "video-a", target: "analyze-1" },
    { id: "e2", source: "video-b", target: "analyze-1" },
  ];

  const sources = collectWorkflowVideoSources(target, [target, upstreamB, upstreamA], edges);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].nodeId, "video-a");
});

test("scene-aware selection metadata distinguishes representative, scene-change, and fallback frames", () => {
  const selections = computeSceneChangeFrameSelections(
    12,
    [
      { timeSec: 0, imageData: makeFrame(16) },
      { timeSec: 2, imageData: makeFrame(18) },
      { timeSec: 4, imageData: makeFrame(230) },
      { timeSec: 6, imageData: makeFrame(232) },
      { timeSec: 8, imageData: makeFrame(32) },
    ],
    { count: 4, threshold: 0.1 },
  );

  assert.equal(selections[0].reason, "representative");
  assert.ok(selections.some((selection) => selection.reason === "scene-change"));
  assert.ok(selections.every((selection) => typeof selection.score === "number"));
});
