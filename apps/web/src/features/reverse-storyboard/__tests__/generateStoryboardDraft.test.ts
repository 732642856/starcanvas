/**
 * Tests for generateStoryboardDraft
 */
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { generateStoryboardDraft } from "../generateStoryboardDraft.ts"
import type { ExtractedVideoFrame } from "../types.ts"

// ── Helpers ────────────────────────────────────────────

function makeFrame(
  timeSec: number,
  idSuffix = "",
): ExtractedVideoFrame {
  const key = `${timeSec}${idSuffix}`
  return {
    id: `frame_${timeSec}`,
    timeSec,
    dataUrl: `data:image/jpeg;base64,${key}`,
    width: 1920,
    height: 1080,
  }
}

function makeFrames(count: number, spacing = 4, start = 0): ExtractedVideoFrame[] {
  return Array.from({ length: count }, (_, i) =>
    makeFrame(start + i * spacing),
  )
}

// ── Tests ──────────────────────────────────────────────

describe("generateStoryboardDraft", () => {
  it("generates 8 shots from 8 frames", () => {
    const frames = makeFrames(8)
    const shots = generateStoryboardDraft(frames)

    assert.equal(shots.length, 8)
    assert.equal(shots[0].title, "分镜 1/8")
    assert.equal(shots[7].title, "分镜 8/8")
  })

  it("calculates shot duration from next frame time", () => {
    const frames = makeFrames(4, 5) // 0, 5, 10, 15
    const shots = generateStoryboardDraft(frames)

    assert.equal(shots[0].durationSec, 5)
    assert.equal(shots[1].durationSec, 5)
    assert.equal(shots[2].durationSec, 5)
    // Last shot uses default duration
    assert.equal(shots[3].durationSec, 3)
  })

  it("uses default duration for last shot", () => {
    const frames = makeFrames(1)
    const shots = generateStoryboardDraft(frames)

    assert.equal(shots.length, 1)
    assert.equal(shots[0].durationSec, 3)
  })

  it("respects custom default last shot duration", () => {
    const frames = makeFrames(2)
    const shots = generateStoryboardDraft(frames, {
      defaultLastShotDurationSec: 5,
    })

    assert.equal(shots[1].durationSec, 5)
  })

  it("preserves sourceFrameId and timeSec", () => {
    const frames = [makeFrame(12.5, "a"), makeFrame(25.0, "b")]
    const shots = generateStoryboardDraft(frames)

    assert.equal(shots[0].sourceFrameId, "frame_12.5")
    assert.equal(shots[0].timeSec, 12.5)
    assert.equal(shots[1].sourceFrameId, "frame_25")
    assert.equal(shots[1].timeSec, 25)
  })

  it("returns empty array for empty frames", () => {
    const shots = generateStoryboardDraft([])
    assert.deepEqual(shots, [])
  })

  it("generates correct description with formatted time", () => {
    const frames = [makeFrame(90.5)]
    const shots = generateStoryboardDraft(frames)

    assert.equal(
      shots[0].description,
      "基于参考视频 1分30.5秒 处画面生成的分镜",
    )
  })

  it("rounds duration to 1 decimal", () => {
    const frames: ExtractedVideoFrame[] = [
      makeFrame(0),
      makeFrame(3.456),
      makeFrame(7.891),
    ]
    const shots = generateStoryboardDraft(frames)

    assert.equal(shots[0].durationSec, 3.5)
    assert.equal(shots[1].durationSec, 4.4)
    assert.equal(shots[2].durationSec, 3)
  })

  it("sets default camera for all shots", () => {
    const frames = makeFrames(3)
    const shots = generateStoryboardDraft(frames)

    for (const shot of shots) {
      assert.equal(shot.camera, "medium shot / static camera")
    }
  })

  it("includes visualPrompt with keyframe time", () => {
    const frames = [makeFrame(42)]
    const shots = generateStoryboardDraft(frames)

    assert.ok(
      shots[0].visualPrompt.includes("t=42s"),
      `visualPrompt missing time: ${shots[0].visualPrompt}`,
    )
  })

  it("preserves thumbnail data URLs", () => {
    const frames = makeFrames(2)
    const shots = generateStoryboardDraft(frames)

    assert.equal(shots[0].thumbnail, frames[0].dataUrl)
    assert.equal(shots[1].thumbnail, frames[1].dataUrl)
  })
})
