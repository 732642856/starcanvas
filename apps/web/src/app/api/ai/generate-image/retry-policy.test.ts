import assert from "node:assert/strict"
import test from "node:test"

import { shouldRetryImageUpstreamStatus } from "./retry-policy.ts"

test("does not retry a 524 image generation response because the upstream may have accepted the paid job", () => {
  assert.equal(shouldRetryImageUpstreamStatus(524), false)
})

test("keeps retries for unambiguous transient gateway and rate-limit failures", () => {
  assert.equal(shouldRetryImageUpstreamStatus(429), true)
  assert.equal(shouldRetryImageUpstreamStatus(503), true)
})

test("does not retry client validation failures", () => {
  assert.equal(shouldRetryImageUpstreamStatus(400), false)
})
