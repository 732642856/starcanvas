/**
 * Tests for onboardingStorage
 */
import { describe, it, beforeEach, afterEach } from "node:test"
import assert from "node:assert/strict"
import {
  loadOnboardingState,
  saveOnboardingState,
  dismissOnboarding,
  completeStep,
  resetOnboarding,
} from "../onboardingStorage.ts"
import { createDefaultState, ONBOARDING_STORAGE_KEY } from "../types.ts"
import type { OnboardingState, OnboardingStepId } from "../types.ts"

// ── Mock localStorage ─────────────────────────────────

let store: Record<string, string>

beforeEach(() => {
  store = {}
  globalThis.localStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
    key: () => null,
    length: 0,
  } as Storage
})

afterEach(() => {
  // @ts-expect-error cleanup global mock
  delete globalThis.localStorage
})

// ── Tests ──────────────────────────────────────────────

describe("onboardingStorage", () => {
  it("returns default state when no stored data", () => {
    const state = loadOnboardingState()
    const defaults = createDefaultState()

    assert.equal(state.dismissed, defaults.dismissed)
    assert.deepEqual(state.steps, defaults.steps)
    assert.equal(state.completedAt, undefined)
  })

  it("saves and loads state correctly", () => {
    const state: OnboardingState = {
      dismissed: true,
      completedAt: "2026-01-01T00:00:00Z",
      steps: { "choose-style": true, "adjust-cinematic-params": false, "generate-ai-script": false, "import-script-to-canvas": false, "apply-shot-preset": false, "adjust-color-grade": false },
    }

    saveOnboardingState(state)
    const loaded = loadOnboardingState()

    assert.equal(loaded.dismissed, true)
    assert.equal(loaded.completedAt, "2026-01-01T00:00:00Z")
    assert.equal(loaded.steps["choose-style"], true)
  })

  it("dismissOnboarding sets dismissed to true", () => {
    dismissOnboarding()
    const state = loadOnboardingState()
    assert.equal(state.dismissed, true)
  })

  it("completeStep marks a single step", () => {
    completeStep("choose-style")
    const state = loadOnboardingState()
    assert.equal(state.steps["choose-style"], true)
    assert.equal(state.steps["adjust-cinematic-params"], false)
  })

  it("completeStep on last step sets completedAt", () => {
    // Complete all except the last
    const allSteps: OnboardingStepId[] = [
      "choose-style", "adjust-cinematic-params", "generate-ai-script",
      "import-script-to-canvas", "apply-shot-preset",
    ]
    for (const step of allSteps) {
      completeStep(step)
    }

    // Last step should trigger completedAt
    completeStep("adjust-color-grade")
    const state = loadOnboardingState()

    assert.ok(state.completedAt != null, "completedAt should be set")
    for (const key of [...allSteps, "adjust-color-grade"] as OnboardingStepId[]) {
      assert.equal(state.steps[key], true)
    }
  })

  it("resetOnboarding clears stored data", () => {
    completeStep("choose-style")
    resetOnboarding()
    const state = loadOnboardingState()
    const defaults = createDefaultState()
    assert.deepEqual(state.steps, defaults.steps)
  })

  it("handles corrupted localStorage gracefully", () => {
    store[ONBOARDING_STORAGE_KEY] = "{ invalid json "
    const state = loadOnboardingState()
    const defaults = createDefaultState()
    assert.deepEqual(state.steps, defaults.steps)
  })
})
