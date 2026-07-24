import assert from "node:assert/strict"
import test from "node:test"

import {
  completeImageGenerationJob,
  createImageGenerationJob,
  getImageGenerationJob,
  markImageGenerationJobRunning,
  resetImageGenerationJobsForTests,
} from "./job-store.ts"

test("tracks an async image generation job lifecycle in memory", () => {
  resetImageGenerationJobsForTests()
  const job = createImageGenerationJob({ requestId: "req-1" })
  assert.equal(job.status, "queued")

  markImageGenerationJobRunning(job.id)
  assert.equal(getImageGenerationJob(job.id)?.status, "running")

  completeImageGenerationJob(job.id, { imageUrl: "data:image/png;base64,abc" })
  assert.equal(getImageGenerationJob(job.id)?.status, "completed")
  assert.deepEqual(getImageGenerationJob(job.id)?.result, { imageUrl: "data:image/png;base64,abc" })
})
