import test from "node:test"
import assert from "node:assert/strict"

import { runSmoke } from "./vidu-production-smoke.mts"

test("real Vidu smoke exits without a request unless explicitly enabled", async () => {
  const result = await runSmoke({ STARCANVAS_RUN_REAL_VIDU_SMOKE: undefined })
  assert.equal(result.skipped, true)
})
