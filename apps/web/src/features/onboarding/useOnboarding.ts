/**
 * useOnboarding — React hook for onboarding checklist state.
 *
 * Exposes load/save/complete/dismiss/reset operations.
 * Used by OnboardingPanel and StarCanvas.tsx integration points.
 */
"use client"

import { useCallback, useEffect, useState } from "react"
import {
  loadOnboardingState,
  dismissOnboarding,
  completeStep as persistCompleteStep,
  resetOnboarding,
} from "./onboardingStorage.ts"
import type { OnboardingState, OnboardingStepId } from "./types.ts"

export function useOnboarding() {
  const [state, setState] = useState<OnboardingState>(() => loadOnboardingState())
  const [showPanel, setShowPanel] = useState(false)

  // Keep the checklist closed by default and surface it from the empty-state CTA
  // so the first screen stays focused on one primary task.
  useEffect(() => {
    setShowPanel(false)
  }, [state.dismissed, state.steps])

  const dismiss = useCallback(() => {
    dismissOnboarding()
    setState((prev) => ({ ...prev, dismissed: true }))
    setShowPanel(false)
  }, [])

  const completeStep = useCallback((stepId: OnboardingStepId) => {
    persistCompleteStep(stepId)
    setState(loadOnboardingState())
  }, [])

  const reset = useCallback(() => {
    resetOnboarding()
    setState(loadOnboardingState())
  }, [])

  const toggle = useCallback(() => {
    setShowPanel((prev) => !prev)
  }, [])

  const open = useCallback(() => {
    setShowPanel(true)
  }, [])

  const close = useCallback(() => {
    setShowPanel(false)
  }, [])

  const completedCount = Object.values(state.steps).filter(Boolean).length
  const totalCount = Object.keys(state.steps).length
  const allComplete = completedCount === totalCount

  return {
    state,
    showPanel,
    completedCount,
    totalCount,
    allComplete,
    dismiss,
    completeStep,
    reset,
    toggle,
    open,
    close,
  }
}
