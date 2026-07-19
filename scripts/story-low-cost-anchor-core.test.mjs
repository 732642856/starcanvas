import assert from "node:assert/strict"
import test from "node:test"

import {
  ANCHOR_AUTHORIZATION,
  buildLowCostAnchorRequest,
  isLowCostAnchorAuthorized,
} from "./story-low-cost-anchor-core.mjs"

test("builds a square, single-reference, single-attempt Gate 1 request", () => {
  const request = buildLowCostAnchorRequest({
    requestId: "anchor-test",
    sourceImage: "data:image/png;base64,anchor",
  })

  assert.equal(request.model, "gpt-image-2")
  assert.equal(request.size, "1024x1024")
  assert.equal(request.retryAttempts, 1)
  assert.deepEqual(request.sourceImage, ["data:image/png;base64,anchor"])
})

test("requires both the paid gate flag and exact authorization text", () => {
  assert.equal(isLowCostAnchorAuthorized({}), false)
  assert.equal(isLowCostAnchorAuthorized({ STARCANVAS_ALLOW_PAID_IMAGE_ANCHOR: "1" }), false)
  assert.equal(isLowCostAnchorAuthorized({ STARCANVAS_IMAGE_ANCHOR_AUTHORIZATION: ANCHOR_AUTHORIZATION }), false)
  assert.equal(isLowCostAnchorAuthorized({
    STARCANVAS_ALLOW_PAID_IMAGE_ANCHOR: "1",
    STARCANVAS_IMAGE_ANCHOR_AUTHORIZATION: ANCHOR_AUTHORIZATION,
  }), true)
})
