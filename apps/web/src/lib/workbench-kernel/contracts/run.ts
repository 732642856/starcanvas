import type { SkillError, SkillResult } from "./skill.ts"

export type RunStatus =
  | "queued" | "running" | "waiting_input" | "waiting_review"
  | "paused" | "completed" | "completed_with_warnings"
  | "failed" | "cancelled"

export type RunEvent =
  | { type: "run.started"; runId: string; timestamp: string }
  | { type: "run.progress"; runId: string; timestamp: string; current: number; total: number; message: string }
  | { type: "review.requested"; runId: string; timestamp: string; reviewId: string }
  | { type: "review.resolved"; runId: string; timestamp: string; reviewId: string; decision: string }
  | { type: "run.completed"; runId: string; timestamp: string; status: "completed" | "completed_with_warnings" }
  | { type: "run.failed"; runId: string; timestamp: string; error: SkillError }
  | { type: "run.cancelled"; runId: string; timestamp: string; reason?: string }

export interface RunRecord {
  runId: string
  requestId: string
  projectId: string
  workspaceId: string
  resolvedSkill: { id: string; version: string; definitionDigest: string }
  status: RunStatus
  parentRunId?: string
  retryOf?: string
  events: RunEvent[]
  result?: SkillResult
  error?: SkillError
  createdAt: string
  updatedAt: string
}

export function isTerminalRunStatus(status: RunStatus): boolean {
  return status === "completed" || status === "completed_with_warnings" || status === "failed" || status === "cancelled"
}
