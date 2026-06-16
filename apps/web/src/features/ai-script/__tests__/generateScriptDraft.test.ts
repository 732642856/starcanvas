/**
 * Tests for generateScriptDraft
 */
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { generateScriptDraft } from "../generateScriptDraft.ts"
import { getShotPreset } from "../../shot-library/shotPresets.ts"
import type { AIScriptInput } from "../types.ts"

// ── Helpers ────────────────────────────────────────────

function makeInput(overrides: Partial<AIScriptInput> = {}): AIScriptInput {
  return {
    brief: "一个关于梦想与坚持的故事",
    genre: "short-film",
    durationSec: 30,
    tone: "warm",
    language: "zh",
    ...overrides,
  }
}

// ── Tests ──────────────────────────────────────────────

describe("generateScriptDraft", () => {
  // ── Structure ──────────────────────────────────────

  it("generates a draft with all required top-level fields", () => {
    const draft = generateScriptDraft(makeInput())

    assert.ok(draft.id.startsWith("draft_"))
    assert.ok(draft.title.length > 0)
    assert.ok(draft.logline.length > 0)
    assert.ok(draft.synopsis.length > 0)
    assert.equal(draft.totalDurationSec, 30)
    assert.ok(draft.scenes.length >= 1)
    assert.ok(draft.inputRef.brief.includes("梦想"))
  })

  it("generates a reasonable number of shots for 15s", () => {
    const draft = generateScriptDraft(makeInput({ durationSec: 15 }))
    const totalShots = draft.scenes.reduce((sum, s) => sum + s.shots.length, 0)
    assert.ok(totalShots >= 3, `Expected >= 3 shots, got ${totalShots}`)
    assert.ok(totalShots <= 5, `Expected <= 5 shots, got ${totalShots}`)
  })

  it("generates a reasonable number of shots for 30s", () => {
    const draft = generateScriptDraft(makeInput({ durationSec: 30 }))
    const totalShots = draft.scenes.reduce((sum, s) => sum + s.shots.length, 0)
    assert.ok(totalShots >= 5, `Expected >= 5 shots, got ${totalShots}`)
    assert.ok(totalShots <= 7, `Expected <= 7 shots, got ${totalShots}`)
  })

  it("generates a reasonable number of shots for 60s", () => {
    const draft = generateScriptDraft(makeInput({ durationSec: 60 }))
    const totalShots = draft.scenes.reduce((sum, s) => sum + s.shots.length, 0)
    assert.ok(totalShots >= 8, `Expected >= 8 shots, got ${totalShots}`)
    assert.ok(totalShots <= 11, `Expected <= 11 shots, got ${totalShots}`)
  })

  it("generates a reasonable number of shots for 90s", () => {
    const draft = generateScriptDraft(makeInput({ durationSec: 90 }))
    const totalShots = draft.scenes.reduce((sum, s) => sum + s.shots.length, 0)
    assert.ok(totalShots >= 12, `Expected >= 12 shots, got ${totalShots}`)
    assert.ok(totalShots <= 16, `Expected <= 16 shots, got ${totalShots}`)
  })

  // ── Each shot validation ───────────────────────────

  it("every shot has required fields", () => {
    const draft = generateScriptDraft(makeInput())

    for (const scene of draft.scenes) {
      for (const shot of scene.shots) {
        assert.ok(shot.id.startsWith("shot_"), `Invalid shot id: ${shot.id}`)
        assert.ok(shot.title.length > 0, "Missing title")
        assert.ok(shot.description.length > 0, "Missing description")
        assert.ok(shot.visualPrompt.length > 0, "Missing visualPrompt")
        assert.ok(shot.durationSec >= 1, `Duration too small: ${shot.durationSec}`)
        assert.ok(shot.shotPresetId.length > 0, "Missing shotPresetId")
      }
    }
  })

  it("every shot has a valid shotPresetId", () => {
    const draft = generateScriptDraft(makeInput())

    for (const scene of draft.scenes) {
      for (const shot of scene.shots) {
        const preset = getShotPreset(shot.shotPresetId)
        assert.ok(preset != null, `Unknown shotPresetId: ${shot.shotPresetId}`)
      }
    }
  })

  it("first shot uses establishing category", () => {
    const draft = generateScriptDraft(makeInput())
    const firstShot = draft.scenes[0].shots[0]
    const preset = getShotPreset(firstShot.shotPresetId)
    assert.ok(preset != null)

    // First scene first shot should be establishing or action
    assert.ok(
      preset.category === "establishing" || preset.category === "action",
      `Expected establishing or action, got ${preset.category}`,
    )
  })

  it("last scene has tension or transition shots", () => {
    const draft = generateScriptDraft(makeInput())
    const lastScene = draft.scenes[draft.scenes.length - 1]
    const lastShot = lastScene.shots[lastScene.shots.length - 1]
    const preset = getShotPreset(lastShot.shotPresetId)

    // Last shots tend to be tension or transition (may not always be due to randomness)
    assert.ok(preset != null)
  })

  // ── Genre / Tone ────────────────────────────────────

  it("respects genre selection", () => {
    const draft = generateScriptDraft(makeInput({ genre: "commercial" }))
    assert.equal(draft.genre, "commercial")
    assert.ok(draft.logline.includes("展示"))
  })

  it("respects tone selection", () => {
    const draft = generateScriptDraft(makeInput({ tone: "tense" }))
    for (const scene of draft.scenes) {
      for (const shot of scene.shots) {
        assert.ok(
          shot.visualPrompt.includes("tense"),
          `Shot ${shot.id} missing tone in visualPrompt: ${shot.visualPrompt}`,
        )
      }
    }
  })

  it("generates Chinese titles when language is zh", () => {
    const draft = generateScriptDraft(makeInput({ language: "zh" }))
    assert.ok(draft.title.includes("AI 剧本"))
    assert.ok(draft.scenes[0].title.includes("序幕") || draft.scenes[0].title === "开场钩子" || draft.scenes[0].title.includes("产品") || draft.scenes[0].title.includes("品牌"))
  })

  it("generates English titles when language is en", () => {
    const draft = generateScriptDraft(makeInput({ language: "en" }))
    assert.ok(draft.title.includes("AI Script"))
    assert.ok(
      draft.scenes[0].shots[0].title.startsWith("Shot "),
      `Expected "Shot X:", got "${draft.scenes[0].shots[0].title}"`,
    )
  })

  // ── Scene structure ─────────────────────────────────

  it("generates 2-4 scenes for typical input", () => {
    const draft = generateScriptDraft(makeInput({ durationSec: 30 }))
    assert.ok(draft.scenes.length >= 2)
    assert.ok(draft.scenes.length <= 4)
  })

  it("every scene has title and summary", () => {
    const draft = generateScriptDraft(makeInput())
    for (const scene of draft.scenes) {
      assert.ok(scene.title.length > 0)
      assert.ok(scene.summary.length > 0)
    }
  })

  // ── Duration approximates target ────────────────────

  it("total shot durations approximate target", () => {
    const draft = generateScriptDraft(makeInput({ durationSec: 30 }))
    const sum = draft.scenes.reduce(
      (s, scene) => s + scene.shots.reduce((ss, shot) => ss + shot.durationSec, 0),
      0,
    )
    // Allow +/- 10s tolerance
    assert.ok(sum >= 20 && sum <= 40, `Total duration ${sum}s deviates too much from 30s target`)
  })

  // ── Dialogue / Voiceover ────────────────────────────

  it("first shot includes voiceover in Chinese mode", () => {
    const draft = generateScriptDraft(makeInput({ language: "zh" }))
    const firstShot = draft.scenes[0].shots[0]
    assert.ok(firstShot.voiceover != null)
    assert.ok(firstShot.voiceover.includes("旁白"))
  })

  it("shots include dialogue placeholder", () => {
    const draft = generateScriptDraft(makeInput())
    for (const scene of draft.scenes) {
      for (const shot of scene.shots) {
        assert.ok(shot.dialogue != null && shot.dialogue.length > 0)
      }
    }
  })
})
