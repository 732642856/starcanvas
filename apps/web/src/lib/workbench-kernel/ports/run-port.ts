import type { RunEvent, RunRecord, RunStatus } from "../contracts/run.ts"
import type { SkillResult } from "../contracts/skill.ts"

export interface RunPort {
  createRun(record: RunRecord): Promise<RunRecord>
  getRun(runId: string): Promise<RunRecord | null>
  getResult(runId: string): Promise<SkillResult | null>
  listEvents(runId: string, cursor?: number): Promise<{ items: RunEvent[]; nextCursor: number }>
  subscribe(runId: string, listener: (event: RunEvent) => void): () => void
  appendEvent(runId: string, event: RunEvent): Promise<void>
  updateStatus(runId: string, status: RunStatus): Promise<void>
  saveResult(runId: string, result: SkillResult): Promise<void>
  pauseRun(runId: string): Promise<void>
  resumeRun(runId: string): Promise<void>
  cancelRun(runId: string, reason?: string): Promise<void>
}
