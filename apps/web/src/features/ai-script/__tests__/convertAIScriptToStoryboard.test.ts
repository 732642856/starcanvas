/**
 * Tests for convertAIScriptToStoryboard
 */
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { convertAIScriptToStoryboard, buildFullPrompt } from "../convertAIScriptToStoryboard.ts"
import { generateScriptDraft } from "../generateScriptDraft.ts"
import type { AIScriptInput } from "../types.ts"

describe("convertAIScriptToStoryboard", () => {
  const draft = generateScriptDraft({
    brief: "一个关于勇气的故事",
    genre: "short-film",
    durationSec: 30,
    tone: "warm",
    language: "zh",
  })

  const shots = convertAIScriptToStoryboard(draft)

  it("converts all draft shots to storyboard shots", () => {
    const totalDraftShots = draft.scenes.reduce(
      (s, scene) => s + scene.shots.length,
      0,
    )
    assert.equal(shots.length, totalDraftShots)
  })

  it("every converted shot has source.type = 'ai-script'", () => {
    for (const shot of shots) {
      assert.equal(shot.source.type, "ai-script")
    }
  })

  it("every converted shot has shotPresetId preserved", () => {
    for (const shot of shots) {
      assert.ok(shot.shotPresetId.length > 0)
    }
  })

  it("every converted shot has cinematic fields from preset", () => {
    for (const shot of shots) {
      assert.ok(shot.shotSize.length > 0, `Missing shotSize in ${shot.id}`)
      assert.ok(shot.cameraAngle.length > 0)
      assert.ok(shot.cameraMovement.length > 0)
      assert.ok(shot.lens.length > 0)
      assert.ok(shot.composition.length > 0)
      assert.ok(shot.mood.length > 0)
    }
  })

  it("every converted shot has visualPrompt", () => {
    for (const shot of shots) {
      assert.ok(shot.visualPrompt.length > 0)
    }
  })

  it("source contains scriptId, sceneId, shotId, shotPresetId", () => {
    for (const shot of shots) {
      assert.ok(shot.source.scriptId.length > 0)
      assert.ok(shot.source.sceneId.length > 0)
      assert.ok(shot.source.shotId.length > 0)
      assert.ok(shot.source.shotPresetId.length > 0)
    }
  })

  it("preserves dialogue and voiceover from draft shots", () => {
    let hasDialogue = false
    for (const shot of shots) {
      if (shot.dialogue && shot.dialogue.length > 0) hasDialogue = true
    }
    assert.ok(hasDialogue, "No shots have dialogue")
  })

  it("empty draft produces empty array", () => {
    const empty = convertAIScriptToStoryboard({
      ...draft,
      scenes: [],
    })
    assert.equal(empty.length, 0)
  })

  it("buildFullPrompt combines visual and preset data", () => {
    const firstShot = draft.scenes[0].shots[0]
    const prompt = buildFullPrompt(firstShot, "custom prefix")
    assert.ok(prompt.includes("custom prefix"))
    assert.ok(prompt.includes(firstShot.visualPrompt))
  })
})
