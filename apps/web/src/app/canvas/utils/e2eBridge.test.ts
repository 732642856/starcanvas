import assert from "node:assert/strict"
import test from "node:test"

import { shouldExposeStarCanvasE2EBridge } from "./e2eBridge.ts"

test("exposes e2e bridge in non-production browser env", () => {
  assert.equal(
    shouldExposeStarCanvasE2EBridge({
      nodeEnv: "development",
      hasWindow: true,
      webdriver: false,
    }),
    true,
  )
})

test("does not expose e2e bridge without window", () => {
  assert.equal(
    shouldExposeStarCanvasE2EBridge({
      nodeEnv: "development",
      hasWindow: false,
      webdriver: true,
    }),
    false,
  )
})

test("does not expose e2e bridge for normal production users", () => {
  assert.equal(
    shouldExposeStarCanvasE2EBridge({
      nodeEnv: "production",
      hasWindow: true,
      webdriver: false,
    }),
    false,
  )
})

test("exposes e2e bridge for webdriver-driven production e2e", () => {
  assert.equal(
    shouldExposeStarCanvasE2EBridge({
      nodeEnv: "production",
      hasWindow: true,
      webdriver: true,
    }),
    true,
  )
})
