import type { SkillDefinition } from "../contracts/registry.ts"
import type { RunEvent, RunRecord, RunStatus } from "../contracts/run.ts"
import type { SkillError, SkillRequest, SkillResult } from "../contracts/skill.ts"
import type { RegistryPort } from "../ports/registry-port.ts"
import type { RunPort } from "../ports/run-port.ts"
import type { SkillExecutorPort } from "../ports/skill-executor-port.ts"
import { SkillRegistryError } from "../registry/skill-registry.ts"

export type SkillRuntimeErrorCode =
  | "SKILL_NOT_FOUND"
  | "NO_ROUTING_CANDIDATE"
  | "EXECUTOR_NOT_FOUND"
  | "SKILL_EXECUTION_FAILED"
  | "INVALID_EXECUTOR_RESULT"

export class SkillRuntimeError extends Error {
  readonly code: SkillRuntimeErrorCode
  readonly skillError: SkillError
  readonly runId?: string

  constructor(code: SkillRuntimeErrorCode, skillError: SkillError, runId?: string) {
    super(skillError.message)
    this.name = "SkillRuntimeError"
    this.code = code
    this.skillError = skillError
    this.runId = runId
  }
}

export interface SkillRuntimeOptions {
  registry: RegistryPort
  runs: RunPort
  executors: ReadonlyMap<string, SkillExecutorPort>
  createRunId?: () => string
  clock?: () => string
}

function stableDefinitionDigest(skill: SkillDefinition): string {
  const source = [
    skill.id,
    skill.version,
    skill.execution.type,
    skill.execution.entrypoint,
    skill.inputSchema,
    skill.outputSchema,
    [...skill.intents].sort().join(","),
    [...skill.domains].sort().join(","),
  ].join("|")
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`
}

function executionError(
  code: SkillRuntimeErrorCode,
  message: string,
  runId?: string,
  category: SkillError["category"] = "execution",
): SkillRuntimeError {
  return new SkillRuntimeError(code, {
    code,
    category,
    message,
    retryable: code === "SKILL_EXECUTION_FAILED",
  }, runId)
}

export class SkillRuntime {
  private readonly registry: RegistryPort
  private readonly runs: RunPort
  private readonly executors: ReadonlyMap<string, SkillExecutorPort>
  private readonly createRunId: () => string
  private readonly clock: () => string

  constructor(options: SkillRuntimeOptions) {
    this.registry = options.registry
    this.runs = options.runs
    this.executors = options.executors
    this.createRunId = options.createRunId ?? (() => crypto.randomUUID())
    this.clock = options.clock ?? (() => new Date().toISOString())
  }

  async execute(request: SkillRequest, signal?: AbortSignal): Promise<SkillResult> {
    const skill = this.resolveSkill(request)
    const runId = this.createRunId()
    const now = this.clock()
    const record: RunRecord = {
      runId,
      requestId: request.requestId,
      projectId: request.projectId,
      workspaceId: request.workspaceId,
      resolvedSkill: {
        id: skill.id,
        version: skill.version,
        definitionDigest: stableDefinitionDigest(skill),
      },
      status: "queued",
      events: [],
      createdAt: now,
      updatedAt: now,
    }
    await this.runs.createRun(record)
    await this.runs.updateStatus(runId, "running")
    await this.runs.appendEvent(runId, {
      type: "run.started",
      runId,
      timestamp: this.clock(),
    })

    try {
      const executor = this.executors.get(skill.execution.entrypoint)
      if (executor === undefined) {
        throw executionError(
          "EXECUTOR_NOT_FOUND",
          `No executor registered for ${skill.execution.entrypoint}`,
          runId,
        )
      }
      const result = await executor.execute({
        request,
        runId,
        skill,
        emit: (event: RunEvent) => this.runs.appendEvent(runId, event),
        ...(signal === undefined ? {} : { signal }),
      })
      this.validateResult(result, request, runId, skill)
      await this.runs.saveResult(runId, result)
      await this.runs.updateStatus(runId, result.status as RunStatus)
      await this.runs.appendEvent(runId, {
        type: "run.completed",
        runId,
        timestamp: this.clock(),
        status: result.status as "completed" | "completed_with_warnings",
      })
      return result
    } catch (error) {
      const runtimeError = error instanceof SkillRuntimeError
        ? error
        : executionError(
          "SKILL_EXECUTION_FAILED",
          error instanceof Error ? error.message : "Skill execution failed",
          runId,
        )
      await this.failRun(runId, runtimeError.skillError)
      throw runtimeError
    }
  }

  private resolveSkill(request: SkillRequest): SkillDefinition {
    if (request.skillSelector.mode === "explicit") {
      const skill = this.registry.getSkill(
        request.skillSelector.id,
        request.skillSelector.version,
      )
      if (skill === null) {
        throw executionError(
          "SKILL_NOT_FOUND",
          `Skill ${request.skillSelector.id} was not found`,
          undefined,
          "routing",
        )
      }
      return skill
    }

    try {
      return this.registry.routeIntent(request.intent, request.skillSelector).skill
    } catch (error) {
      if (error instanceof SkillRegistryError && error.code === "NO_ROUTING_CANDIDATE") {
        throw executionError(
          "NO_ROUTING_CANDIDATE",
          `No Skill can handle ${request.intent.type}`,
          undefined,
          "routing",
        )
      }
      throw error
    }
  }

  private validateResult(
    result: SkillResult,
    request: SkillRequest,
    runId: string,
    skill: SkillDefinition,
  ): void {
    const validIdentity = result.requestId === request.requestId
      && result.runId === runId
      && result.skillId === skill.id
      && result.skillVersion === skill.version
      && (result.status === "completed" || result.status === "completed_with_warnings")
    if (!validIdentity) {
      throw executionError(
        "INVALID_EXECUTOR_RESULT",
        "Executor result does not match the resolved request, run, or Skill",
        runId,
      )
    }
  }

  private async failRun(runId: string, error: SkillError): Promise<void> {
    const record = await this.runs.getRun(runId)
    if (record?.status !== "running") return
    await this.runs.updateStatus(runId, "failed")
    await this.runs.appendEvent(runId, {
      type: "run.failed",
      runId,
      timestamp: this.clock(),
      error,
    })
  }
}
