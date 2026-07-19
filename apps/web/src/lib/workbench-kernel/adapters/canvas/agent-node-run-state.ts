import type { CanvasNodeData, NodeRunStatus } from "../../../../app/canvas/components/canvas/types.ts"
import type { CrewAgentStatus } from "../../../agents/index.ts"
import type { RunStatus } from "../../contracts/run.ts"

export interface AgentNodeRunSnapshot {
  runId: string
  status: RunStatus
  summary: string
  data?: {
    agentStatuses?: CrewAgentStatus[]
    executionTrace?: string[]
  }
}

const ACTIVE_RUN_STATUSES = new Set<RunStatus>([
  "queued",
  "running",
  "waiting_input",
  "waiting_review",
  "paused",
])

function toAgentStatus(status: RunStatus): NonNullable<CanvasNodeData["agentStatus"]> {
  if (status === "completed" || status === "completed_with_warnings") return "done"
  if (status === "failed" || status === "cancelled") return "error"
  return "running"
}

function toNodeRunStatus(status: RunStatus): NodeRunStatus {
  if (status === "queued") return "queued"
  if (status === "completed" || status === "completed_with_warnings") return "succeeded"
  if (status === "failed") return "failed"
  if (status === "cancelled") return "cancelled"
  return "running"
}

export function mapRunToAgentNodePatch(snapshot: AgentNodeRunSnapshot): Partial<CanvasNodeData> {
  const isActive = ACTIVE_RUN_STATUSES.has(snapshot.status)
  const isSuccessful = snapshot.status === "completed" || snapshot.status === "completed_with_warnings"
  const isFailed = snapshot.status === "failed" || snapshot.status === "cancelled"

  const patch: Partial<CanvasNodeData> = {
    agentStatus: toAgentStatus(snapshot.status),
    agentOutput: snapshot.summary,
    activeRunId: isActive ? snapshot.runId : undefined,
    crewStatuses: snapshot.data?.agentStatuses?.map((status) => ({ ...status })),
    executionTrace: snapshot.data?.executionTrace ? [...snapshot.data.executionTrace] : undefined,
    runMeta: {
      runId: snapshot.runId,
      runStatus: toNodeRunStatus(snapshot.status),
      message: snapshot.summary,
      error: isFailed ? snapshot.summary : undefined,
    },
  }

  if (isSuccessful) patch.lastSuccessfulRunId = snapshot.runId
  return patch
}
