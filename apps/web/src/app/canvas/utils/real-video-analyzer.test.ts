#!/usr/bin/env node --experimental-strip-types

export {};

import {
  buildVideoAnalysisFromFrameStats,
  computeFrameVisualStats,
  computeFrameTransitionScores,
  detectSceneSegments,
  summarizeVideoMetrics,
  type FrameVisualStats,
} from "./real-video-analyzer.ts";
import type { VideoKeyframeRef } from "../types/video-analysis.ts";

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
  greaterThan(actual: number, expected: number, msg?: string) {
    if (!(actual > expected)) throw new Error(msg ?? `expected ${actual} > ${expected}`);
  },
  lessThan(actual: number, expected: number, msg?: string) {
    if (!(actual < expected)) throw new Error(msg ?? `expected ${actual} < ${expected}`);
  },
};

function solidPixels(width: number, height: number, color: [number, number, number]): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
    pixels[offset + 3] = 255;
  }
  return pixels;
}

function checkerPixels(width: number, height: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const value = (x + y) % 2 === 0 ? 255 : 0;
      pixels[offset] = value;
      pixels[offset + 1] = value;
      pixels[offset + 2] = value;
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
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

test("computeFrameVisualStats detects warm saturated frame", () => {
  const stats = computeFrameVisualStats(solidPixels(4, 4, [240, 80, 20]), 4, 4, {
    frameIndex: 0,
    timestampMs: 1000,
  });

  assert.equal(stats.colorTemperature, "warm");
  assert.equal(stats.dominantColor, "#f05014");
  assert.greaterThan(stats.saturation, 0.8);
  assert.greaterThan(stats.averageLuma, 0.3);
});

test("computeFrameVisualStats gives higher contrast for checkerboard", () => {
  const flat = computeFrameVisualStats(solidPixels(4, 4, [128, 128, 128]), 4, 4, {
    frameIndex: 0,
    timestampMs: 0,
  });
  const checker = computeFrameVisualStats(checkerPixels(4, 4), 4, 4, {
    frameIndex: 1,
    timestampMs: 1000,
  });

  assert.lessThan(flat.contrast, 0.01);
  assert.greaterThan(checker.contrast, 0.4);
});

test("summarizeVideoMetrics produces motion proxy and dominant colors", () => {
  const stats: FrameVisualStats[] = [
    {
      frameIndex: 0,
      timestampMs: 0,
      width: 4,
      height: 4,
      averageLuma: 0.2,
      contrast: 0.1,
      saturation: 0.8,
      dominantColor: "#f05014",
      colorTemperature: "warm",
    },
    {
      frameIndex: 1,
      timestampMs: 1000,
      width: 4,
      height: 4,
      averageLuma: 0.72,
      contrast: 0.4,
      saturation: 0.2,
      dominantColor: "#143cf0",
      colorTemperature: "cool",
    },
  ];

  const metrics = summarizeVideoMetrics(stats);
  assert.equal(metrics.frameCount, 2);
  assert.greaterThan(metrics.motionScore, 0.3);
  assert.equal(metrics.dominantColors.length, 2);
});

test("detectSceneSegments splits strong visual changes into candidate scenes", () => {
  const stats: FrameVisualStats[] = [
    {
      frameIndex: 0,
      timestampMs: 0,
      width: 4,
      height: 4,
      averageLuma: 0.18,
      contrast: 0.08,
      saturation: 0.12,
      dominantColor: "#101020",
      colorTemperature: "cool",
    },
    {
      frameIndex: 1,
      timestampMs: 1000,
      width: 4,
      height: 4,
      averageLuma: 0.2,
      contrast: 0.09,
      saturation: 0.14,
      dominantColor: "#111122",
      colorTemperature: "cool",
    },
    {
      frameIndex: 2,
      timestampMs: 2000,
      width: 4,
      height: 4,
      averageLuma: 0.76,
      contrast: 0.42,
      saturation: 0.78,
      dominantColor: "#f0a020",
      colorTemperature: "warm",
    },
    {
      frameIndex: 3,
      timestampMs: 3000,
      width: 4,
      height: 4,
      averageLuma: 0.74,
      contrast: 0.4,
      saturation: 0.74,
      dominantColor: "#ee9f22",
      colorTemperature: "warm",
    },
  ];

  const transitions = computeFrameTransitionScores(stats);
  const scenes = detectSceneSegments(stats, transitions);

  assert.equal(scenes.length, 2);
  assert.equal(scenes[0].frameIndexes, [0, 1]);
  assert.equal(scenes[1].frameIndexes, [2, 3]);
  assert.greaterThan(scenes[1].changeScore, 0.3);
  assert.ok(scenes[1].description?.includes("场景段 2"));
});

test("buildVideoAnalysisFromFrameStats enriches keyframes and raw metrics", () => {
  const keyframes: VideoKeyframeRef[] = [
    { sourceVideoId: "video-1", timestampMs: 0, frameIndex: 0, imageUrl: "data:image/jpeg;base64,a" },
    { sourceVideoId: "video-1", timestampMs: 1000, frameIndex: 1, imageUrl: "data:image/jpeg;base64,b" },
  ];
  const stats: FrameVisualStats[] = [
    {
      frameIndex: 0,
      timestampMs: 0,
      width: 4,
      height: 4,
      averageLuma: 0.3,
      contrast: 0.18,
      saturation: 0.4,
      dominantColor: "#666666",
      colorTemperature: "neutral",
    },
    {
      frameIndex: 1,
      timestampMs: 1000,
      width: 4,
      height: 4,
      averageLuma: 0.75,
      contrast: 0.34,
      saturation: 0.55,
      dominantColor: "#f0a040",
      colorTemperature: "warm",
    },
  ];

  const result = buildVideoAnalysisFromFrameStats(keyframes, stats);
  assert.ok(result.summary.includes("真实视频分析"));
  assert.equal(result.keyframes.length, 2);
  assert.ok(result.keyframes[0].description);
  assert.equal((result.raw as any).mode, "local-frame-analysis");
  assert.equal((result.raw as any).sourceVideoIds[0], "video-1");
  assert.ok(Array.isArray(result.scenes));
  assert.ok(Array.isArray(result.events));
  assert.ok((result.raw as any).transitions.length > 0);
});
