import test from "node:test"
import assert from "node:assert/strict"

import { normalizeViduTask } from "./vidu-client.ts"

test("normalizes a successful Vidu task to completed with an output URL", () => {
  assert.deepEqual(normalizeViduTask({ state: "SUCCESS", creations: [{ url: "https://cdn.example/video.mp4" }] }), {
    status: "COMPLETED",
    videoUrl: "https://cdn.example/video.mp4",
    errorMessage: undefined,
  })
})

test("normalizes pending Vidu task states to polling", () => {
  assert.deepEqual(normalizeViduTask({ output: { task_status: "RUNNING" } }), {
    status: "POLLING",
    errorMessage: undefined,
  })
})

test("normalizes failed Vidu task states with provider diagnostics", () => {
  assert.deepEqual(normalizeViduTask({ output: { task_status: "FAILED", message: "quota exceeded" } }), {
    status: "FAILED",
    errorMessage: "quota exceeded",
  })
  assert.equal(normalizeViduTask({ output: { task_status: "CANCELED" } }).status, "FAILED")
})
