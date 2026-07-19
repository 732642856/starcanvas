import type { RunEvent, RunRecord, RunStatus } from "../../contracts/run.ts"
import type { SkillResult } from "../../contracts/skill.ts"
import type { RunPort } from "../../ports/run-port.ts"

export type RunStoreErrorCode =
  | "RUN_NOT_FOUND"
  | "DUPLICATE_RUN"
  | "INVALID_RUN_TRANSITION"
  | "EVENT_RUN_MISMATCH"
  | "INVALID_EVENT_CURSOR"

export class RunStoreError extends Error {
  readonly code: RunStoreErrorCode
  readonly details?: Record<string, unknown>

  constructor(code: RunStoreErrorCode, details?: Record<string, unknown>) {
    super(code)
    this.name = "RunStoreError"
    this.code = code
    this.details = details
  }
}

const allowedTransitions: Record<RunStatus, ReadonlySet<RunStatus>> = {
  queued: new Set(["running", "cancelled"]),
  running: new Set([
    "waiting_input",
    "waiting_review",
    "paused",
    "completed",
    "completed_with_warnings",
    "failed",
    "cancelled",
  ]),
  waiting_input: new Set(["running", "cancelled"]),
  waiting_review: new Set(["running", "failed", "cancelled"]),
  paused: new Set(["running", "cancelled"]),
  completed: new Set(),
  completed_with_warnings: new Set(),
  failed: new Set(),
  cancelled: new Set(),
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

export class InMemoryRunAdapter implements RunPort {
  private readonly runs = new Map<string, RunRecord>()
  private readonly listeners = new Map<string, Set<(event: RunEvent) => void>>()
  private readonly clock: () => string

  constructor(clock: () => string = () => new Date().toISOString()) {
    this.clock = clock
  }

  async createRun(record: RunRecord): Promise<RunRecord> {
    if (this.runs.has(record.runId)) {
      throw new RunStoreError("DUPLICATE_RUN", { runId: record.runId })
    }
    const stored = clone(record)
    this.runs.set(record.runId, stored)
    return clone(stored)
  }

  async getRun(runId: string): Promise<RunRecord | null> {
    const record = this.runs.get(runId)
    return record === undefined ? null : clone(record)
  }

  async getResult(runId: string): Promise<SkillResult | null> {
    const result = this.runs.get(runId)?.result
    return result === undefined ? null : clone(result)
  }

  async listEvents(
    runId: string,
    cursor = 0,
  ): Promise<{ items: RunEvent[]; nextCursor: number }> {
    const record = this.requireRun(runId)
    if (!Number.isSafeInteger(cursor) || cursor < 0) {
      throw new RunStoreError("INVALID_EVENT_CURSOR", { runId, cursor })
    }
    const nextCursor = record.events.length
    return { items: clone(record.events.slice(cursor)), nextCursor }
  }

  subscribe(runId: string, listener: (event: RunEvent) => void): () => void {
    this.requireRun(runId)
    const listeners = this.listeners.get(runId) ?? new Set()
    listeners.add(listener)
    this.listeners.set(runId, listeners)
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) this.listeners.delete(runId)
    }
  }

  async appendEvent(runId: string, event: RunEvent): Promise<void> {
    const record = this.requireRun(runId)
    if (event.runId !== runId) {
      throw new RunStoreError("EVENT_RUN_MISMATCH", {
        runId,
        eventRunId: event.runId,
      })
    }
    const storedEvent = clone(event)
    record.events.push(storedEvent)
    record.updatedAt = this.clock()
    for (const listener of this.listeners.get(runId) ?? []) {
      try {
        listener(clone(storedEvent))
      } catch {
        // Listener failures cannot roll back an event that is already persisted.
      }
    }
  }

  async updateStatus(runId: string, status: RunStatus): Promise<void> {
    const record = this.requireRun(runId)
    if (!allowedTransitions[record.status].has(status)) {
      throw new RunStoreError("INVALID_RUN_TRANSITION", {
        runId,
        from: record.status,
        to: status,
      })
    }
    record.status = status
    record.updatedAt = this.clock()
  }

  async saveResult(runId: string, result: SkillResult): Promise<void> {
    const record = this.requireRun(runId)
    record.result = clone(result)
    record.updatedAt = this.clock()
  }

  async pauseRun(runId: string): Promise<void> {
    await this.updateStatus(runId, "paused")
  }

  async resumeRun(runId: string): Promise<void> {
    await this.updateStatus(runId, "running")
  }

  async cancelRun(runId: string, reason?: string): Promise<void> {
    await this.updateStatus(runId, "cancelled")
    await this.appendEvent(runId, {
      type: "run.cancelled",
      runId,
      timestamp: this.clock(),
      ...(reason === undefined ? {} : { reason }),
    })
  }

  private requireRun(runId: string): RunRecord {
    const record = this.runs.get(runId)
    if (record === undefined) {
      throw new RunStoreError("RUN_NOT_FOUND", { runId })
    }
    return record
  }
}
