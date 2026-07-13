import type { SkillDefinition } from "../contracts/registry.ts"
import type { RunEvent } from "../contracts/run.ts"
import type { SkillRequest, SkillResult } from "../contracts/skill.ts"

export interface SkillExecutionContext {
  request: SkillRequest
  runId: string
  skill: SkillDefinition
  emit(event: RunEvent): Promise<void>
  signal?: AbortSignal
}

export interface SkillExecutorPort {
  execute(context: SkillExecutionContext): Promise<SkillResult>
}
