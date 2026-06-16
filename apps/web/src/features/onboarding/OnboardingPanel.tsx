/**
 * OnboardingPanel — Guided creation checklist.
 *
 * First-visit auto-show with 6-step checklist.
 * Each step links to the corresponding feature panel.
 * Progress persisted in localStorage.
 */
"use client"

import React, { useCallback } from "react"
import { createPortal } from "react-dom"
import { X, Check, ArrowRight, MapPin } from "lucide-react"
import type { OnboardingStepId } from "./types.ts"
import { ONBOARDING_STEPS } from "./types.ts"

// ── Step Definitions ──────────────────────────────────

export interface OnboardingStepDef {
  id: OnboardingStepId
  title: string
  description: string
  actionLabel: string
  emoji: string
}

export const STEP_DEFS: OnboardingStepDef[] = [
  {
    id: "choose-style",
    title: "选择视觉风格",
    description: "从 109 个影视级风格预设中选择一个",
    actionLabel: "打开风格库",
    emoji: "🎨",
  },
  {
    id: "adjust-cinematic-params",
    title: "调整影调参数",
    description: "景别、镜头运动、光线、色调、景深、画幅比",
    actionLabel: "打开参数面板",
    emoji: "🎥",
  },
  {
    id: "generate-ai-script",
    title: "AI 生成剧本",
    description: "输入故事梗概，自动生成结构化分镜剧本",
    actionLabel: "打开 AI 剧本",
    emoji: "✨",
  },
  {
    id: "import-script-to-canvas",
    title: "导入画布",
    description: "将生成的剧本导入到画布中作为可编辑节点",
    actionLabel: "导入画布",
    emoji: "📥",
  },
  {
    id: "apply-shot-preset",
    title: "应用镜头预设",
    description: "从 55 个镜头库中选择适合的镜头语言",
    actionLabel: "打开镜头库",
    emoji: "🔍",
  },
  {
    id: "adjust-color-grade",
    title: "调整色彩分级",
    description: "使用交互式 RGB 曲线进行专业色彩调校",
    actionLabel: "打开色彩面板",
    emoji: "🌈",
  },
]

// ── Props ─────────────────────────────────────────────

export interface OnboardingPanelProps {
  isOpen: boolean
  steps: Record<OnboardingStepId, boolean>
  completedCount: number
  totalCount: number
  allComplete: boolean
  onClose: () => void
  onDismiss: () => void
  onReset: () => void
  /** Callback map: step id → panel opener */
  stepActions: Record<OnboardingStepId, () => void>
}

// ── Component ─────────────────────────────────────────

function OnboardingPanelInner({
  isOpen,
  steps,
  completedCount,
  totalCount,
  allComplete,
  onClose,
  onDismiss,
  onReset,
  stepActions,
}: OnboardingPanelProps) {
  if (!isOpen) return null

  return createPortal(
    <div className="fixed top-16 right-4 z-[92] min-w-[320px] max-w-[380px] max-h-[calc(100vh-120px)] overflow-y-auto">
      <div data-testid="onboarding-panel" className="bg-[var(--color-bg-panel)] backdrop-blur-xl rounded-xl border border-[var(--color-border)] shadow-2xl overflow-hidden">
        {/* ── Header ─────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
            <MapPin size={16} />
            新手引导
            <span className="text-[10px] text-[var(--color-text-tertiary)] font-normal">
              {completedCount}/{totalCount}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onReset}
              className="text-[9px] px-2 py-1 rounded bg-[var(--color-hover)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] transition-colors"
              title="重置进度"
            >
              重置
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-[var(--color-hover)] transition-colors text-[var(--color-text-secondary)]"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Progress bar ─────────────────────────────── */}
        <div className="h-1 bg-[var(--color-bg)]">
          <div
            className="h-full bg-[var(--color-accent)] transition-all duration-500"
            style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
          />
        </div>

        {/* ── Steps ────────────────────────────────────── */}
        <div className="p-3 space-y-0.5">
          {STEP_DEFS.map((step, i) => {
            const done = steps[step.id]
            const isCurrent = !done && (i === 0 || steps[STEP_DEFS[i - 1].id])

            return (
              <div
                key={step.id}
                className={`flex items-center gap-2.5 p-2 rounded-lg transition-all ${
                  done
                    ? "bg-green-500/5"
                    : isCurrent
                    ? "bg-[var(--color-accent)]/10"
                    : "opacity-50"
                }`}
              >
                {/* Status icon */}
                <div
                  className={`flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0 ${
                    done
                      ? "bg-green-500/20 text-green-400"
                      : isCurrent
                      ? "bg-[var(--color-accent)]/20 text-[var(--color-accent)]"
                      : "bg-[var(--color-hover)] text-[var(--color-text-tertiary)]"
                  }`}
                >
                  {done ? (
                    <Check size={12} />
                  ) : (
                    <span className="text-[10px] font-bold">{i + 1}</span>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-medium text-[var(--color-text)]">
                      {step.emoji} {step.title}
                    </span>
                    {done && (
                      <span className="text-[8px] text-green-400">✓</span>
                    )}
                  </div>
                  <p className="text-[9px] text-[var(--color-text-tertiary)] truncate">
                    {step.description}
                  </p>
                </div>

                {/* Action button */}
                {!done && stepActions[step.id] && (
                  <button
                    data-testid={`onboarding-action-${step.id}`}
                    onClick={stepActions[step.id]}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-medium bg-[var(--color-accent)]/90 hover:bg-[var(--color-accent)] text-white transition-all flex-shrink-0"
                  >
                    {step.actionLabel}
                    <ArrowRight size={10} />
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Footer ───────────────────────────────────── */}
        <div className="px-4 py-2.5 border-t border-[var(--color-border)] flex items-center justify-between">
          {allComplete ? (
            <span className="text-[10px] text-green-400 font-medium">
              🎉 新手引导完成！
            </span>
          ) : (
            <span className="text-[10px] text-[var(--color-text-tertiary)]">
              完成所有步骤开启创作之旅
            </span>
          )}
          <button
            onClick={onDismiss}
            className="text-[10px] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] px-2 py-1 rounded hover:bg-[var(--color-hover)] transition-all"
          >
            {allComplete ? "关闭" : "跳过引导"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export { OnboardingPanelInner }
export default OnboardingPanelInner
