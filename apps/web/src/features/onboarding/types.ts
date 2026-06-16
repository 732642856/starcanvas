/**
 * Onboarding Checklist — Types
 *
 * Lightweight guided creation path for new users.
 * State persisted in localStorage under ONBOARDING_STORAGE_KEY.
 */
"use client"

export type OnboardingStepId =
  | "choose-style"
  | "adjust-cinematic-params"
  | "generate-ai-script"
  | "import-script-to-canvas"
  | "apply-shot-preset"
  | "adjust-color-grade"

export interface OnboardingStep {
  id: OnboardingStepId
  title: string
  description: string
  actionLabel: string
  /** Target panel to open when clicking the action */
  action: () => void
}

export interface OnboardingState {
  dismissed: boolean
  completedAt?: string
  steps: Record<OnboardingStepId, boolean>
}

export const ONBOARDING_STEPS: OnboardingStepId[] = [
  "choose-style",
  "adjust-cinematic-params",
  "generate-ai-script",
  "import-script-to-canvas",
  "apply-shot-preset",
  "adjust-color-grade",
]

export const ONBOARDING_STORAGE_KEY = "app:onboarding:v1"

export function createDefaultState(): OnboardingState {
  return {
    dismissed: false,
    steps: {
      "choose-style": false,
      "adjust-cinematic-params": false,
      "generate-ai-script": false,
      "import-script-to-canvas": false,
      "apply-shot-preset": false,
      "adjust-color-grade": false,
    },
  }
}
