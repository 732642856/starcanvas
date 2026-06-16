/**
 * Onboarding Storage — localStorage-backed persistence.
 *
 * Pure functions with no React dependencies — testable in node:test.
 */
import {
  ONBOARDING_STORAGE_KEY,
  createDefaultState,
} from "./types.ts"
import type { OnboardingState, OnboardingStepId } from "./types.ts"

export function loadOnboardingState(): OnboardingState {
  try {
    const raw = localStorage.getItem(ONBOARDING_STORAGE_KEY)
    if (!raw) return createDefaultState()
    const parsed = JSON.parse(raw) as Partial<OnboardingState>
    const defaults = createDefaultState()

    return {
      dismissed: parsed.dismissed ?? defaults.dismissed,
      completedAt: parsed.completedAt,
      steps: {
        ...defaults.steps,
        ...(parsed.steps ?? {}),
      } as Record<OnboardingStepId, boolean>,
    }
  } catch {
    return createDefaultState()
  }
}

export function saveOnboardingState(state: OnboardingState): void {
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage full or unavailable — silently fail
  }
}

export function dismissOnboarding(): void {
  const state = loadOnboardingState()
  state.dismissed = true
  saveOnboardingState(state)
}

export function completeStep(stepId: OnboardingStepId): void {
  const state = loadOnboardingState()
  state.steps[stepId] = true

  // Check if all steps are completed
  const allDone = Object.values(state.steps).every(Boolean)
  if (allDone && !state.completedAt) {
    state.completedAt = new Date().toISOString()
  }

  saveOnboardingState(state)
}

export function resetOnboarding(): void {
  localStorage.removeItem(ONBOARDING_STORAGE_KEY)
}
