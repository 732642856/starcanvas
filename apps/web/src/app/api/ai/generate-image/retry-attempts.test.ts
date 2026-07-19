import assert from "node:assert/strict"
import test from "node:test"

import { resolveImageRetryAttempts } from "./retry-attempts.ts"

test("uses the configured retry count when the request does not opt out", () => {
  assert.equal(resolveImageRetryAttempts(undefined, 2), 2)
})

test("allows a caller to opt into one auditable upstream attempt", () => {
  assert.equal(resolveImageRetryAttempts(1, 2), 1)
})

test("rejects malformed or excessive caller retry counts", () => {
  assert.equal(resolveImageRetryAttempts("invalid", 2), 2)
  assert.equal(resolveImageRetryAttempts(99, 2), 2)
  assert.equal(resolveImageRetryAttempts(0, 2), 2)
})
