import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { DEFAULT_LOCAL_API_BASE, resolveLocalApiBase } from "./local-api-base.mjs"

test("defaults story automation to the canonical local Next port", () => {
  assert.equal(DEFAULT_LOCAL_API_BASE, "http://127.0.0.1:3000")
  assert.equal(resolveLocalApiBase({}), DEFAULT_LOCAL_API_BASE)
  assert.equal(resolveLocalApiBase({ STARCANVAS_LOCAL_API_BASE: "   " }), DEFAULT_LOCAL_API_BASE)
})

test("honors an explicit local API override without a double slash", () => {
  assert.equal(
    resolveLocalApiBase({ STARCANVAS_LOCAL_API_BASE: " http://127.0.0.1:4010/ " }),
    "http://127.0.0.1:4010",
  )
})

test("all paid story batch runners reuse the shared local API resolver", async () => {
  for (const file of [
    "run-story-keyframe-batch.mjs",
    "run-story-low-cost-anchor.mjs",
    "run-story-video-batch.mjs",
  ]) {
    const source = await readFile(new URL(`./${file}`, import.meta.url), "utf8")
    assert.match(source, /from "\.\/local-api-base\.mjs"/)
    assert.match(source, /resolveLocalApiBase\(process\.env\)/)
    assert.doesNotMatch(source, /127\.0\.0\.1:3183/)
  }
})
