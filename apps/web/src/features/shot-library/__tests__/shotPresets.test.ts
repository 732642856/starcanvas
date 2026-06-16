/**
 * Tests for Shot Library presets
 */
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { SHOT_PRESETS, getShotPreset } from "../shotPresets.ts"
import { searchShotPresets, SHOT_CATEGORIES } from "../types.ts"
import type { ShotCategory } from "../types.ts"

// ── Helpers ────────────────────────────────────────────

const VALID_CATEGORIES: ShotCategory[] = [
  "establishing",
  "character",
  "action",
  "product",
  "transition",
  "tension",
]

// ── Tests ──────────────────────────────────────────────

describe("Shot Library — Preset Catalog", () => {
  // ── Structure / Validation ──────────────────────────

  it("contains at least 50 presets", () => {
    assert.ok(SHOT_PRESETS.length >= 50, `Expected >= 50, got ${SHOT_PRESETS.length}`)
  })

  it("every preset has a unique id", () => {
    const ids = SHOT_PRESETS.map((p) => p.id)
    const unique = new Set(ids)
    assert.equal(unique.size, ids.length, `Duplicate IDs found: ${ids.length - unique.size}`)
  })

  it("every preset has a valid category", () => {
    for (const p of SHOT_PRESETS) {
      assert.ok(
        VALID_CATEGORIES.includes(p.category),
        `Invalid category "${p.category}" in preset "${p.id}"`,
      )
    }
  })

  it("every preset has non-empty name", () => {
    for (const p of SHOT_PRESETS) {
      assert.ok(p.name.trim().length > 0, `Empty name in preset "${p.id}"`)
    }
  })

  it("every preset has non-empty prompt", () => {
    for (const p of SHOT_PRESETS) {
      assert.ok(
        p.prompt.trim().length > 0,
        `Empty prompt in preset "${p.id}"`,
      )
    }
  })

  it("every preset has shotSize and cameraAngle", () => {
    for (const p of SHOT_PRESETS) {
      assert.ok(p.shotSize.trim().length > 0, `Empty shotSize in "${p.id}"`)
      assert.ok(p.cameraAngle.trim().length > 0, `Empty cameraAngle in "${p.id}"`)
    }
  })

  it("every preset has at least one useCase", () => {
    for (const p of SHOT_PRESETS) {
      assert.ok(
        p.useCases.length > 0,
        `No useCases in preset "${p.id}"`,
      )
    }
  })

  // ── cinematicParams Validation ───────────────────────

  it("every preset has cinematicParams in 0-1 range", () => {
    const keys = ["shotScale", "cameraMotion", "lighting", "tone", "depthOfField", "aspectRatio"] as const

    for (const p of SHOT_PRESETS) {
      for (const key of keys) {
        const val = p.cinematicParams[key]
        assert.ok(
          val >= 0 && val <= 1,
          `cinematicParams.${key} = ${val} out of [0,1] in preset "${p.id}"`,
        )
      }
    }
  })

  it("covers all 6 categories", () => {
    const presentCategories = new Set(SHOT_PRESETS.map((p) => p.category))
    for (const cat of VALID_CATEGORIES) {
      assert.ok(
        presentCategories.has(cat),
        `Missing category: ${cat}`,
      )
    }
  })

  it("each category has at least 5 presets", () => {
    for (const cat of VALID_CATEGORIES) {
      const count = SHOT_PRESETS.filter((p) => p.category === cat).length
      assert.ok(
        count >= 5,
        `Category "${cat}" has only ${count} presets (need >= 5)`,
      )
    }
  })

  // ── Helper Functions ────────────────────────────────

  it("getShotPreset returns correct preset by id", () => {
    const p = getShotPreset("establish-extreme-wide")
    assert.ok(p !== undefined)
    assert.equal(p!.id, "establish-extreme-wide")
    assert.equal(p!.name, "极远景")
  })

  it("getShotPreset returns undefined for unknown id", () => {
    const p = getShotPreset("non-existent-id")
    assert.equal(p, undefined)
  })

  // ── Search ──────────────────────────────────────────

  it("searchShotPresets finds by name (Chinese)", () => {
    const results = searchShotPresets(SHOT_PRESETS, "特写")
    assert.ok(results.length >= 1, `Expected >= 1, got ${results.length}`)
    for (const r of results) {
      assert.ok(
        r.name.includes("特写") || r.shotSize.includes("close-up") || r.shotSize.includes("特写"),
      )
    }
  })

  it("searchShotPresets finds by English shot terms", () => {
    const results = searchShotPresets(SHOT_PRESETS, "close-up")
    assert.ok(results.length >= 3, `Expected >= 3, got ${results.length}`)
    for (const r of results) {
      assert.ok(
        r.shotSize.includes("close-up") || r.name.includes("特写"),
      )
    }
  })

  it("searchShotPresets finds by useCases", () => {
    const results = searchShotPresets(SHOT_PRESETS, "对话")
    assert.ok(results.length >= 2)
  })

  it("searchShotPresets filters by category", () => {
    const results = searchShotPresets(SHOT_PRESETS, "", "action")
    for (const r of results) {
      assert.equal(r.category, "action")
    }
  })

  it("searchShotPresets combines query + category filter", () => {
    const results = searchShotPresets(SHOT_PRESETS, "跟拍", "action")
    assert.ok(results.length >= 1)
    for (const r of results) {
      assert.equal(r.category, "action")
    }
  })

  it("searchShotPresets with empty query returns all in category", () => {
    const results = searchShotPresets(SHOT_PRESETS, "", "tension")
    const totalTension = SHOT_PRESETS.filter((p) => p.category === "tension").length
    assert.equal(results.length, totalTension)
  })

  it("searchShotPresets case-insensitive", () => {
    const lower = searchShotPresets(SHOT_PRESETS, "dutch")
    const upper = searchShotPresets(SHOT_PRESETS, "DUTCH")
    assert.equal(lower.length, upper.length)
  })

  // ── Categories ──────────────────────────────────────

  it("SHOT_CATEGORIES has 6 entries", () => {
    assert.equal(SHOT_CATEGORIES.length, 6)
  })

  it("SHOT_CATEGORIES all have unique ids", () => {
    const ids = SHOT_CATEGORIES.map((c) => c.id)
    assert.equal(new Set(ids).size, ids.length)
  })
})
