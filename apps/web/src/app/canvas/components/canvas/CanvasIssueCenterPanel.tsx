"use client"

import { AlertCircle, AlertTriangle, CheckCircle2, X } from "lucide-react"

import type { CanvasIssue } from "@/lib/storyboard/canvasIssueCenter"
import { DESIGN_TOKENS } from "../../styles/designSystem"

type CanvasIssueCenterPanelProps = {
  isOpen: boolean
  issues: CanvasIssue[]
  onClose: () => void
  onResolveIssue: (issue: CanvasIssue) => void
  rightOffset?: number
}

const ISSUE_STYLE = {
  blocking: { icon: AlertCircle, color: "#fb7185", label: "阻塞" },
  warning: { icon: AlertTriangle, color: "#fbbf24", label: "复核" },
  info: { icon: CheckCircle2, color: "#93c5fd", label: "提示" },
} as const

export function CanvasIssueCenterPanel({
  isOpen,
  issues,
  onClose,
  onResolveIssue,
  rightOffset = 20,
}: CanvasIssueCenterPanelProps) {
  if (!isOpen) return null

  return (
    <aside
      className="fixed top-[5.25rem] z-[70] flex max-h-[calc(100vh-7rem)] w-[390px] flex-col overflow-hidden rounded-2xl border shadow-2xl"
      style={{ right: rightOffset, backgroundColor: "rgba(15, 15, 20, 0.96)", borderColor: DESIGN_TOKENS.border }}
      data-testid="canvas-issue-center"
    >
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: DESIGN_TOKENS.border }}>
        <div>
          <h2 className="text-sm font-medium" style={{ color: DESIGN_TOKENS.text }}>生产问题</h2>
          <p className="mt-0.5 text-[11px]" style={{ color: DESIGN_TOKENS.textMuted }}>
            {issues.length === 0 ? "当前画布没有待处理问题" : `${issues.length} 项需要处理或复核`}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭生产问题" className="flex h-8 w-8 items-center justify-center rounded hover:bg-white/10" style={{ color: DESIGN_TOKENS.textMuted }}>
          <X size={16} />
        </button>
      </header>

      <div className="min-h-0 overflow-y-auto">
        {issues.map((issue) => {
          const style = ISSUE_STYLE[issue.severity]
          const Icon = style.icon
          return (
            <button
              key={issue.id}
              type="button"
              onClick={() => onResolveIssue(issue)}
              data-testid={`canvas-issue-${issue.id}`}
              className="flex w-full items-start gap-3 border-b px-4 py-3 text-left transition hover:bg-white/[0.05]"
              style={{ borderColor: "rgba(255,255,255,0.07)" }}
            >
              <Icon size={16} className="mt-0.5 shrink-0" style={{ color: style.color }} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2 text-[11px]" style={{ color: DESIGN_TOKENS.textMuted }}>
                  <span className="truncate">#{issue.order} {issue.title || "未命名镜头"}</span>
                  <span className="shrink-0" style={{ color: style.color }}>{style.label}</span>
                </span>
                <span className="mt-1 block text-xs leading-relaxed" style={{ color: DESIGN_TOKENS.text }}>{issue.message}</span>
                <span className="mt-1 block text-[11px]" style={{ color: DESIGN_TOKENS.accent }}>定位并处理</span>
              </span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}
