import type { SkillRequest } from "../../../lib/workbench-kernel/contracts/skill.ts"

export const CANVAS_LOCAL_PROJECT_ID = "canvas-local"

export interface CreateFilmCrewRuntimeRequestOptions {
  nodeId: string
  content: string
  requestId: string
  projectId?: string
}

/** Builds the fixed, explicit SkillRuntime contract for an AgentNode execution. */
export function createFilmCrewRuntimeRequest(
  options: CreateFilmCrewRuntimeRequestOptions,
): SkillRequest<{ content: string }> {
  return {
    protocolVersion: "1.0",
    requestId: options.requestId,
    projectId: options.projectId ?? CANVAS_LOCAL_PROJECT_ID,
    workspaceId: "general",
    sourceNodeId: options.nodeId,
    skillSelector: {
      mode: "explicit",
      id: "film.crew.orchestrator",
      version: "1.0.0",
    },
    intent: {
      type: "film.crew.run",
      goal: "分析并处理画布中的影视任务",
    },
    inputs: { content: options.content },
    execution: { mode: "standard", reviewPolicy: "none" },
    requestedOutputs: ["analysis"],
  }
}
