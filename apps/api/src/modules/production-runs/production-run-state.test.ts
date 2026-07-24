import test from "node:test"
import assert from "node:assert/strict"

import { assertProductionTaskTransition } from "./production-run-state.ts"

test("a queued task may enter submitting but may not complete directly", () => {
  assert.doesNotThrow(() => assertProductionTaskTransition("QUEUED", "SUBMITTING"))
  assert.throws(
    () => assertProductionTaskTransition("QUEUED", "COMPLETED"),
    /Invalid production task transition/,
  )
})
