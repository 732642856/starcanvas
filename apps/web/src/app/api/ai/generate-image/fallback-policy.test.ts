import assert from "node:assert/strict"
import test from "node:test"

import {
  resolveImageFallbackModels,
  resolveImageGenerationMode,
  resolveImageQuality,
  shouldFallbackImageModel,
} from "./fallback-policy.ts"

test("defaults image generation to low-quality draft mode", () => {
  assert.equal(resolveImageGenerationMode(undefined), "draft")
  assert.equal(resolveImageQuality("draft", undefined), "low")
})

test("keeps explicit final mode and requested quality", () => {
  assert.equal(resolveImageGenerationMode("final"), "final")
  assert.equal(resolveImageQuality("final", "high"), "high")
})

test("deduplicates fallback models and excludes the primary model", () => {
  assert.deepEqual(
    resolveImageFallbackModels("gpt-image-2", "gpt-image-2,gpt-image-1.5,gpt-image-1-mini,gpt-image-1.5"),
    ["gpt-image-1.5", "gpt-image-1-mini"],
  )
})

test("falls back for 524 and other transient gateway failures only", () => {
  assert.equal(shouldFallbackImageModel(524), true)
  assert.equal(shouldFallbackImageModel(503), true)
  assert.equal(shouldFallbackImageModel(400), false)
})
