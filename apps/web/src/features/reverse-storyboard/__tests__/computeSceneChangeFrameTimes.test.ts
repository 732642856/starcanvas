import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  computeSceneChangeFrameSelections,
  computeSceneChangeFrameTimes,
} from "../computeSceneChangeFrameTimes.ts"

function makeFrame(value: number) {
  const data = new Uint8ClampedArray(4 * 4 * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = value
    data[i + 1] = value
    data[i + 2] = value
    data[i + 3] = 255
  }
  return {
    data,
    width: 4,
    height: 4,
  } as ImageData
}

describe("computeSceneChangeFrameTimes", () => {
  it("picks strong scene-change timestamps first", () => {
    const times = computeSceneChangeFrameTimes(
      12,
      [
        { timeSec: 0, imageData: makeFrame(10) },
        { timeSec: 2, imageData: makeFrame(12) },
        { timeSec: 4, imageData: makeFrame(230) },
        { timeSec: 6, imageData: makeFrame(232) },
        { timeSec: 8, imageData: makeFrame(20) },
        { timeSec: 10, imageData: makeFrame(24) },
      ],
      { count: 4, threshold: 0.1 },
    )

    assert.equal(times[0], 0)
    assert.ok(times.includes(4))
    assert.ok(times.includes(8))
  })

  it("returns selection metadata for representative and scene-change frames", () => {
    const selections = computeSceneChangeFrameSelections(
      12,
      [
        { timeSec: 0, imageData: makeFrame(10) },
        { timeSec: 2, imageData: makeFrame(12) },
        { timeSec: 4, imageData: makeFrame(230) },
        { timeSec: 6, imageData: makeFrame(232) },
        { timeSec: 8, imageData: makeFrame(20) },
      ],
      { count: 3, threshold: 0.1 },
    )

    assert.equal(selections[0].timeSec, 0)
    assert.equal(selections[0].reason, "representative")
    assert.ok(selections.some((selection) => selection.reason === "scene-change"))
    assert.ok(selections.every((selection, index) => selection.sceneIndex === index))
    assert.ok(selections.some((selection) => selection.score > 0.1))
  })

  it("falls back to sample points if the threshold is too high", () => {
    const times = computeSceneChangeFrameTimes(
      10,
      [
        { timeSec: 0, imageData: makeFrame(40) },
        { timeSec: 2, imageData: makeFrame(42) },
        { timeSec: 4, imageData: makeFrame(43) },
        { timeSec: 6, imageData: makeFrame(44) },
        { timeSec: 8, imageData: makeFrame(45) },
      ],
      { count: 4, threshold: 0.95 },
    )

    assert.equal(times[0], 0)
    assert.ok(times.length >= 3)
  })

  it("marks fallback selections when the threshold is too high", () => {
    const selections = computeSceneChangeFrameSelections(
      10,
      [
        { timeSec: 0, imageData: makeFrame(40) },
        { timeSec: 2, imageData: makeFrame(42) },
        { timeSec: 4, imageData: makeFrame(43) },
      ],
      { count: 3, threshold: 0.95 },
    )

    assert.equal(selections[0].reason, "representative")
    assert.ok(selections.slice(1).every((selection) => selection.reason === "uniform-fallback"))
  })

  it("handles empty samples and invalid duration", () => {
    assert.deepEqual(computeSceneChangeFrameTimes(0, []), [])
    assert.deepEqual(computeSceneChangeFrameTimes(10, []), [0])
  })
})
