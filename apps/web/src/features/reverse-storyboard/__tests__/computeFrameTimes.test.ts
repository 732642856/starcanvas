/**
 * Tests for computeFrameTimes
 */
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { computeFrameTimes } from "../computeFrameTimes.ts"

describe("computeFrameTimes", () => {
  // ── Normal cases ────────────────────────────────────
  it("returns 8 evenly spaced frames for a 30s video", () => {
    const times = computeFrameTimes(30, { count: 8 })
    assert.equal(times.length, 8)
    assert.equal(times[0], 0)
    assert.ok(times[times.length - 1] <= 30)
    // Check even spacing (within rounding tolerance)
    const spacing = 30 / 7 // 8 frames = 7 intervals
    for (let i = 1; i < times.length; i++) {
      const actualSpacing = times[i] - times[i - 1]
      assert.ok(
        Math.abs(actualSpacing - spacing) < 0.2,
        `Frame ${i}: spacing ${actualSpacing} not close to ${spacing}`,
      )
    }
  })

  it("distributes 8 frames across a 60s video", () => {
    const times = computeFrameTimes(60, { count: 8 })
    assert.equal(times.length, 8)
    assert.equal(times[0], 0)
    assert.equal(times[times.length - 1], 60)
  })

  it("uses default count of 8 when not specified", () => {
    const times = computeFrameTimes(100)
    assert.equal(times.length, 8)
  })

  // ── Count boundaries ─────────────────────────────────
  it("respects custom frame count", () => {
    const times = computeFrameTimes(60, { count: 5 })
    assert.equal(times.length, 5)
  })

  it("caps frames at maxFrames", () => {
    const times = computeFrameTimes(300, { count: 20, maxFrames: 12 })
    assert.ok(times.length <= 12)
  })

  // ── Edge cases ───────────────────────────────────────
  it("returns empty array for zero duration", () => {
    const times = computeFrameTimes(0)
    assert.deepEqual(times, [])
  })

  it("returns empty array for negative duration", () => {
    const times = computeFrameTimes(-5)
    assert.deepEqual(times, [])
  })

  it("returns first frame only for very short videos", () => {
    const times = computeFrameTimes(0.3, { count: 8 })
    assert.equal(times.length, 1)
    assert.equal(times[0], 0)
  })

  it("returns fewer frames for short durations", () => {
    // 3s with min spacing of 0.5s → max 7 frames, but we want 8
    // So it should produce at most 7 frames
    const times = computeFrameTimes(3, { count: 8 })
    assert.ok(times.length <= 7)
    assert.equal(times[0], 0)
  })

  it("deduplicates end-time repeats", () => {
    // When spacing causes last frame to round to durationSec,
    // it should be deduplicated
    const times = computeFrameTimes(10, { count: 11 })
    assert.equal(times[0], 0)
    // Check no consecutive duplicates
    for (let i = 1; i < times.length; i++) {
      assert.notEqual(times[i], times[i - 1], `Duplicate at index ${i}`)
    }
  })

  it("rounds to 1 decimal place", () => {
    const times = computeFrameTimes(10, { count: 4 })
    for (const t of times) {
      const rounded = Math.round(t * 10) / 10
      assert.equal(t, rounded, `Time ${t} not rounded to 1 decimal`)
    }
  })
})
