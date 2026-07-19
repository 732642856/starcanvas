import type { ProductionPreflightIssueCode, ProductionPreflightReport } from "./productionPreflight.ts"

export type CanvasIssueSeverity = "blocking" | "warning" | "info"
export type CanvasIssueSource = "preflight" | "queue"

export type CanvasIssue = {
  id: string
  source: CanvasIssueSource
  severity: CanvasIssueSeverity
  shotId: string
  order: number
  title: string
  action: string
  message: string
}

type QueueIssueSource = {
  blockedActions?: Array<{
    shotId: string
    order: number
    title: string
    action: string
    reason: string
  }>
}

const ACTION_BY_PREFLIGHT_CODE: Record<ProductionPreflightIssueCode, string> = {
  "missing-visual-prompt": "strengthen-visual-prompt",
  "weak-visual-prompt": "strengthen-visual-prompt",
  "missing-shot-language": "add-shot-language",
  "missing-duration": "set-shot-duration",
  "missing-reference": "attach-reference-frame",
  "missing-character-anchor": "complete-character-anchor",
  "character-anchor-incomplete": "complete-character-anchor",
  "missing-source-time": "restore-source-timecode",
  "missing-voice-intent": "add-voice-intent",
  "handoff-warning": "review-handoff-warning",
}

const SEVERITY_RANK: Record<CanvasIssueSeverity, number> = {
  blocking: 0,
  warning: 1,
  info: 2,
}

export function buildCanvasIssues(input: {
  productionPreflight?: ProductionPreflightReport | null
  queue?: QueueIssueSource | null
} = {}): CanvasIssue[] {
  const issues: CanvasIssue[] = []
  const actions = new Set<string>()

  for (const shot of input.productionPreflight?.shots ?? []) {
    for (const issue of shot.issues) {
      const action = ACTION_BY_PREFLIGHT_CODE[issue.code]
      actions.add(`${shot.shotId}:${action}`)
      issues.push({
        id: `preflight:${shot.shotId}:${issue.code}`,
        source: "preflight",
        severity: issue.severity,
        shotId: shot.shotId,
        order: shot.order,
        title: shot.title,
        action,
        message: issue.message,
      })
    }
  }

  for (const action of input.queue?.blockedActions ?? []) {
    const actionKey = `${action.shotId}:${action.action}`
    if (actions.has(actionKey)) continue
    issues.push({
      id: `queue:${action.shotId}:${action.action}`,
      source: "queue",
      severity: "blocking",
      shotId: action.shotId,
      order: action.order,
      title: action.title,
      action: action.action,
      message: action.reason,
    })
  }

  return issues.sort((left, right) =>
    SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity]
    || left.order - right.order
    || left.id.localeCompare(right.id),
  )
}
