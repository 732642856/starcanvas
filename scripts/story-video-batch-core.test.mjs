import assert from "node:assert/strict"
import test from "node:test"

import { buildReplacementArchiveEntry, buildRollbackOperations, buildStoryVideoRequest, mergeVideoBatchResults, parseViduSseResult } from "./story-video-batch-core.mjs"

test("keeps prior completed shots when a replacement run reports one updated shot", () => {
  const merged = mergeVideoBatchResults({
    existingResults: [
      { shotId: "shot-01", status: "completed_video", taskId: "old-01" },
      { shotId: "shot-05", status: "completed_video", taskId: "old-05" },
      { shotId: "shot-06", status: "completed_video", taskId: "old-06" },
    ],
    updatedResults: [
      { shotId: "shot-05", status: "completed_video", taskId: "new-05" },
    ],
    shotOrder: ["shot-01", "shot-02", "shot-03", "shot-05", "shot-06"],
  })

  assert.deepEqual(merged, [
    { shotId: "shot-01", status: "completed_video", taskId: "old-01" },
    { shotId: "shot-05", status: "completed_video", taskId: "new-05" },
    { shotId: "shot-06", status: "completed_video", taskId: "old-06" },
  ])
})

test("does not replace an existing completed shot with a failed retake", () => {
  const merged = mergeVideoBatchResults({
    existingResults: [{ shotId: "shot-05", status: "completed_video", taskId: "good-05" }],
    updatedResults: [{ shotId: "shot-05", status: "failed_video", error: "upstream failed" }],
    shotOrder: ["shot-05"],
  })

  assert.deepEqual(merged, [{ shotId: "shot-05", status: "completed_video", taskId: "good-05" }])
})

test("builds a deterministic rollback archive entry for an explicit replacement", () => {
  assert.deepEqual(
    buildReplacementArchiveEntry({
      shot: { id: "shot-06", title: "福锅认主" },
      videoDir: "/production/videos",
      receiptDir: "/production/receipts",
      archiveDir: "/production/archives/video-replacement-20260716T120000Z",
    }),
    {
      shotId: "shot-06",
      archivedVideo: "/production/archives/video-replacement-20260716T120000Z/videos/shot-06-福锅认主.mp4",
      archivedReceipt: "/production/archives/video-replacement-20260716T120000Z/receipts/shot-06.video.json",
    },
  )
})

test("builds rollback copies from an archive without inspecting arbitrary paths", () => {
  assert.deepEqual(
    buildRollbackOperations({
      outputDir: "/production",
      replacements: [{
        shotId: "shot-06",
        archivedVideo: "/production/archives/run/videos/shot-06-福锅认主.mp4",
        archivedReceipt: "/production/archives/run/receipts/shot-06.video.json",
      }],
    }),
    [
      {
        shotId: "shot-06",
        fromVideo: "/production/archives/run/videos/shot-06-福锅认主.mp4",
        toVideo: "/production/videos/shot-06-福锅认主.mp4",
        fromReceipt: "/production/archives/run/receipts/shot-06.video.json",
        toReceipt: "/production/receipts/shot-06.video.json",
      },
    ],
  )
})

test("builds a text-to-video request without an unavailable image input", () => {
  const request = buildStoryVideoRequest({
    id: "shot-02",
    videoPrompt: "Zhaoheng hears laughter and walks toward the rockery.",
  })

  assert.equal(request.mode, "t2v")
  assert.equal(request.duration, 3)
  assert.equal(request.resolution, "720P")
  assert.equal(request.size, "720*1280")
  assert.equal(request.watermark, false)
  assert.equal(request.audio, false)
  assert.equal("imageUrl" in request, false)
  assert.match(request.prompt, /22-year-old East Asian crown prince/i)
})

test("uses an existing approved keyframe for image-to-video when supplied", () => {
  const request = buildStoryVideoRequest({
    id: "shot-01",
    videoPrompt: "Jingchai throws the wok and looks back.",
  }, "data:image/png;base64,approved-keyframe")

  assert.equal(request.mode, "i2v")
  assert.equal(request.imageUrl, "data:image/png;base64,approved-keyframe")
  assert.equal(request.duration, 3)
  assert.equal(request.size, "720*1280")
})

test("uses supplied character references for reference-to-video", () => {
  const request = buildStoryVideoRequest({
    id: "shot-06",
    videoPrompt: "Jingchai presents the wok to Zhaoheng.",
  }, undefined, ["data:image/png;base64,prince", "data:image/png;base64,maid"])

  assert.equal(request.mode, "r2v")
  assert.deepEqual(request.referenceImageUrls, ["data:image/png;base64,prince", "data:image/png;base64,maid"])
  assert.equal("imageUrl" in request, false)
})

test("reads the Vidu result event from a completed SSE response", () => {
  const result = parseViduSseResult([
    "event: progress",
    'data: {"percent":30}',
    "",
    "event: result",
    'data: {"videoUrl":"https://example.com/shot.mp4","taskId":"task-1","usage":{"duration":3}}',
    "",
  ].join("\n"))

  assert.deepEqual(result, {
    videoUrl: "https://example.com/shot.mp4",
    taskId: "task-1",
    usage: { duration: 3 },
  })
})

test("surfaces a Vidu error event instead of treating it as a completed video", () => {
  assert.throws(
    () => parseViduSseResult('event: error\ndata: {"message":"upstream failed"}\n\n'),
    /upstream failed/,
  )
})
