import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { normalizeGenerationError } from "./normalizeGenerationError.ts"

describe("normalizeGenerationError", () => {
  it("maps upstream 524 responses to provider timeout", () => {
    const error = normalizeGenerationError({
      status: 524,
      provider: "openai-compatible",
      body: "<html><title>524 A Timeout Occurred</title></html>",
    })

    assert.equal(error.code, "PROVIDER_TIMEOUT")
    assert.equal(error.status, 524)
    assert.equal(error.retryable, true)
    assert.match(error.userMessage, /图片生成超时/)
    assert.match(error.detail, /524/)
  })
})
