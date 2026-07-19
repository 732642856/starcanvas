import assert from "node:assert/strict"
import test from "node:test"

import { ImageGenerationError } from "./imageGeneration.ts"
import {
  buildUnknownImageResultMessage,
  isUnknownImageResultError,
  shouldRetryProductionImageError,
} from "./productionImageRetry.ts"

test("does not retry a 524 image result whose upstream outcome may be unknown", () => {
  const error = new ImageGenerationError({
    message: "图片生成超时",
    code: "PROVIDER_TIMEOUT",
    status: 524,
    retryable: true,
  })

  assert.equal(shouldRetryProductionImageError(error, false), false)
  assert.equal(isUnknownImageResultError(error), true)
  assert.match(buildUnknownImageResultMessage(error), /^结果未知：/)
})

test("keeps the existing retry path for retryable, non-ambiguous image failures", () => {
  const error = new ImageGenerationError({
    message: "服务繁忙",
    code: "UPSTREAM_ERROR",
    status: 503,
    retryable: true,
  })

  assert.equal(shouldRetryProductionImageError(error, false), true)
  assert.equal(isUnknownImageResultError(error), false)
})

test("does not retry after cancellation or an explicitly non-retryable error", () => {
  const error = new ImageGenerationError({
    message: "参数错误",
    code: "API_ERROR",
    status: 400,
    retryable: false,
  })

  assert.equal(shouldRetryProductionImageError(error, true), false)
  assert.equal(shouldRetryProductionImageError(error, false), false)
})
