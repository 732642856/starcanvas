import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { assertBrowserCompositionInputSize, BROWSER_COMPOSITION_MAX_INPUT_BYTES } from "./videoCompositionGuard.ts"

describe("assertBrowserCompositionInputSize", () => {
  it("allows the exact browser composition boundary", () => {
    assert.doesNotThrow(() => assertBrowserCompositionInputSize(BROWSER_COMPOSITION_MAX_INPUT_BYTES))
  })

  it("rejects oversized input before loading FFmpeg", () => {
    assert.throws(
      () => assertBrowserCompositionInputSize(BROWSER_COMPOSITION_MAX_INPUT_BYTES + 1),
      /64 MB.*剪映交接包/,
    )
  })
})
