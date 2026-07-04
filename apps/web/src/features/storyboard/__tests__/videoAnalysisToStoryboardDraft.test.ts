import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { buildStoryboardDraftFromVideoAnalysis } from "../videoAnalysisToStoryboardDraft.ts"
import type { VideoAnalysisResult } from "../../../app/canvas/types/video-analysis.ts"

function makeAnalysis(): VideoAnalysisResult {
  return {
    summary: "真实视频分析：画面偏暖，变化明显。",
    keyframes: [
      {
        sourceVideoId: "video-1",
        timestampMs: 0,
        frameIndex: 0,
        imageUrl: "data:image/jpeg;base64,a",
        width: 160,
        height: 90,
        description: "画面较暗，暖色灯光，动作刚开始。",
      },
      {
        sourceVideoId: "video-1",
        timestampMs: 2600,
        frameIndex: 1,
        imageUrl: "data:image/jpeg;base64,b",
        width: 160,
        height: 90,
        description: "画面更明亮，主体位置发生变化。",
      },
    ],
    events: [
      {
        startMs: 0,
        endMs: 2600,
        label: "visual-style",
        description: "整体偏暖，高对比。",
      },
      {
        startMs: 0,
        endMs: 2600,
        label: "scene-boundary",
        description: "场景段 1（0.0s-2.6s）：偏暗，对比强烈。",
      },
    ],
    scenes: [
      {
        sceneIndex: 0,
        startMs: 0,
        endMs: 2600,
        representativeFrameIndex: 0,
        frameIndexes: [0, 1],
        changeScore: 0,
        description: "场景段 1（0.0s-2.6s）：偏暗，对比强烈。",
        confidence: 0.72,
      },
    ],
    captions: [],
    objects: [],
  }
}

describe("buildStoryboardDraftFromVideoAnalysis", () => {
  it("maps keyframes to storyboard draft shots", () => {
    const shots = buildStoryboardDraftFromVideoAnalysis(makeAnalysis(), {
      videoAnalysisNodeId: "analyze-1",
      sourceTitle: "视频分析",
    })

    assert.equal(shots.length, 2)
    assert.equal(shots[0].title, "参考视频镜头 1/2")
    assert.equal(shots[0].thumbnail, "data:image/jpeg;base64,a")
    assert.equal(shots[0].durationSec, 2.6)
    assert.equal(shots[1].durationSec, 3)
  })

  it("preserves traceable source metadata", () => {
    const shots = buildStoryboardDraftFromVideoAnalysis(makeAnalysis(), {
      videoAnalysisNodeId: "analyze-1",
      sourceTitle: "视频分析",
    })

    assert.equal(shots[0].sourceType, "reference-video")
    assert.equal(shots[0].sourceMeta?.videoAnalysisNodeId, "analyze-1")
    assert.equal(shots[0].sourceMeta?.sourceVideoId, "video-1")
    assert.equal(shots[0].sourceMeta?.frameIndex, 0)
    assert.equal(shots[0].sourceMeta?.timeSec, 0)
    assert.deepEqual(shots[0].sourceMeta?.eventLabels, ["visual-style", "scene-boundary"])
  })

  it("uses analysis descriptions and event hints in content and prompt", () => {
    const shots = buildStoryboardDraftFromVideoAnalysis(makeAnalysis())

    assert.match(shots[0].description, /暖色灯光/)
    assert.match(shots[0].description, /整体偏暖/)
    assert.match(shots[0].description, /场景段 1/)
    assert.match(shots[0].visualPrompt, /Cinematic storyboard frame/)
    assert.match(shots[0].visualPrompt, /场景段 1/)
    assert.match(shots[0].visualPrompt, /Preserve the original composition/)
  })

  it("sorts frames by timestamp and respects maxShots", () => {
    const analysis = makeAnalysis()
    analysis.keyframes = [...analysis.keyframes].reverse()

    const shots = buildStoryboardDraftFromVideoAnalysis(analysis, { maxShots: 1 })

    assert.equal(shots.length, 1)
    assert.equal(shots[0].sourceMeta?.timestampMs, 0)
  })

  it("returns empty array without keyframes", () => {
    const shots = buildStoryboardDraftFromVideoAnalysis({
      ...makeAnalysis(),
      keyframes: [],
    })

    assert.deepEqual(shots, [])
  })
})
