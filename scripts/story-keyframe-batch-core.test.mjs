import assert from "node:assert/strict"
import test from "node:test"

import {
  buildKeyframeBatchRequest,
  selectKeyframeBatchShots,
  shouldDetachPaidImageBatch,
} from "./story-keyframe-batch-core.mjs"

const shot = {
  id: "shot-06",
  imagePrompt: "Use both Zhaoheng and Jingchai character references. They stand beside a soot-black wok.",
}

test("text-only batch mode removes unavailable reference instructions and locks character appearance", () => {
  const result = buildKeyframeBatchRequest({
    shot,
    requestId: "test-request",
    mode: "text-only",
    references: { zhaoheng: "zhaoheng-data", jingchai: "jingchai-data" },
  })

  assert.equal(result.retryAttempts, 1)
  assert.equal("sourceImage" in result, false)
  assert.match(result.prompt, /22-year-old East Asian crown prince/i)
  assert.match(result.prompt, /17-year-old East Asian palace maid/i)
  assert.doesNotMatch(result.prompt, /character reference/i)
})

test("batch requests can use a caller-selected validated test size", () => {
  const result = buildKeyframeBatchRequest({
    shot,
    requestId: "test-request",
    mode: "text-only",
    references: {},
    size: "1024x1024",
  })

  assert.equal(result.size, "1024x1024")
})

test("reference batch mode keeps the existing reference-image contract", () => {
  const result = buildKeyframeBatchRequest({
    shot,
    requestId: "test-request",
    mode: "reference",
    references: { zhaoheng: "zhaoheng-data", jingchai: "jingchai-data" },
  })

  assert.equal(result.retryAttempts, 1)
  assert.deepEqual(result.sourceImage, ["zhaoheng-data", "jingchai-data"])
  assert.match(result.prompt, /character references/i)
})

test("default keyframe batch selects only work still pending both image and video", () => {
  const shots = selectKeyframeBatchShots([
    { id: "shot-01", status: "keyframe_pending_video_pending" },
    { id: "shot-02", status: "video_completed" },
  ], [])

  assert.deepEqual(shots.map((item) => item.id), ["shot-01"])
})

test("an explicit shot selection can backfill a keyframe after its video is completed", () => {
  const shots = selectKeyframeBatchShots([
    { id: "shot-01", status: "video_completed" },
    { id: "shot-02", status: "keyframe_pending_video_pending" },
  ], ["shot-01"])

  assert.deepEqual(shots.map((item) => item.id), ["shot-01"])
})

test("detached execution is opt-in and only applies to a paid parent runner", () => {
  assert.equal(shouldDetachPaidImageBatch({ isLive: false, detachRequested: true, isDetachedChild: false }), false)
  assert.equal(shouldDetachPaidImageBatch({ isLive: true, detachRequested: false, isDetachedChild: false }), false)
  assert.equal(shouldDetachPaidImageBatch({ isLive: true, detachRequested: true, isDetachedChild: true }), false)
  assert.equal(shouldDetachPaidImageBatch({ isLive: true, detachRequested: true, isDetachedChild: false }), true)
})
