import assert from "node:assert/strict"
import test from "node:test"

import { createViduSubmissionRegistry } from "./vidu-submission-registry.ts"

test("coalesces concurrent submissions for the same request id", async () => {
  const registry = createViduSubmissionRegistry()
  let submissions = 0
  let resolveTask: (taskId: string) => void = () => undefined
  const pendingTask = new Promise<string>((resolve) => {
    resolveTask = resolve
  })
  const createTask = async () => {
    submissions += 1
    return pendingTask
  }

  const first = registry.getOrCreate("production-video-shot-01", createTask)
  const second = registry.getOrCreate("production-video-shot-01", createTask)

  assert.equal(submissions, 1)
  resolveTask("task-concurrent")
  assert.deepEqual(await Promise.all([first, second]), ["task-concurrent", "task-concurrent"])
})

test("reuses a known Vidu task for the same request id without submitting again", async () => {
  const registry = createViduSubmissionRegistry({ now: () => 1_000, ttlMs: 60_000 })
  let submissions = 0

  const first = await registry.getOrCreate("video-request-1", async () => {
    submissions += 1
    return "task-1"
  })
  const second = await registry.getOrCreate("video-request-1", async () => {
    submissions += 1
    return "task-2"
  })

  assert.equal(first, "task-1")
  assert.equal(second, "task-1")
  assert.equal(submissions, 1)
})

test("does not reuse an expired Vidu task id", async () => {
  let now = 1_000
  const registry = createViduSubmissionRegistry({ now: () => now, ttlMs: 60_000 })

  await registry.getOrCreate("video-request-1", async () => "task-1")
  now += 60_001
  const result = await registry.getOrCreate("video-request-1", async () => "task-2")

  assert.equal(result, "task-2")
})

test("does not retain an unsuccessful submission", async () => {
  const registry = createViduSubmissionRegistry({ now: () => 1_000, ttlMs: 60_000 })
  await assert.rejects(() => registry.getOrCreate("video-request-1", async () => {
    throw new Error("upstream rejected")
  }))

  const result = await registry.getOrCreate("video-request-1", async () => "task-2")
  assert.equal(result, "task-2")
})
