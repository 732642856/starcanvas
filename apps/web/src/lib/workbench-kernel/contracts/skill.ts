import type { ResourceRef } from "./resource.ts"

export type ReviewPolicy = "none" | "optional" | "required"
export type SkillResultStatus = "completed" | "completed_with_warnings" | "failed"
export type SkillErrorCategory =
  | "input" | "validation" | "routing" | "execution"
  | "policy" | "quality" | "review" | "dependency"

export interface SkillRequest<TInputs = unknown> {
  protocolVersion: "1.0"
  requestId: string
  projectId: string
  workspaceId: string
  sourceNodeId?: string
  skillSelector:
    | { mode: "explicit"; id: string; version?: string }
    | { mode: "route"; allowedDomains?: string[]; excludedSkillIds?: string[] }
  intent: { type: string; goal: string; constraints?: string[] }
  inputs: TInputs
  contextRefs?: ResourceRef[]
  execution: {
    mode: "fast" | "standard" | "deep"
    reviewPolicy: ReviewPolicy
    timeoutMs?: number
    maxRetries?: number
  }
  requestedOutputs: string[]
}

export interface SkillError {
  code: string
  category: SkillErrorCategory
  message: string
  retryable: boolean
  missingRefs?: ResourceRef[]
  recoveryActions?: Array<{ intent: string; label: string }>
}

export interface SkillResult<TData = unknown> {
  protocolVersion: "1.0"
  requestId: string
  runId: string
  skillId: string
  skillVersion: string
  status: SkillResultStatus
  summary: string
  data?: TData
  artifacts: Array<{
    id: string
    type: string
    uri: ResourceRef
    operation: "create" | "update" | "link"
  }>
  warnings?: Array<{ code: string; message: string; severity: "low" | "medium" | "high"; targetRef?: ResourceRef }>
  quality: { schemaValid: boolean; confidence?: number; checks: Record<string, "passed" | "warning" | "failed"> }
  review?: { required: boolean; type: string; targets: ResourceRef[] }
  nextActions?: Array<{ intent: string; label: string; recommendedSkillId?: string }>
  humanReadable?: { format: "markdown"; content: string }
  error?: SkillError
}
