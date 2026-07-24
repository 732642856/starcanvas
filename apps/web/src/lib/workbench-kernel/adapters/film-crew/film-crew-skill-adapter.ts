import type {
  AgentContext,
  AgentOperationMode,
  CrewExecutionResult,
} from "../../../agents/film-crew-agents.ts"
import type { CrewOrchestratorOptions } from "../../../agents/orchestrator.ts"
import type { SkillError, SkillResult } from "../../contracts/skill.ts"
import type {
  SkillExecutionContext,
  SkillExecutorPort,
} from "../../ports/skill-executor-port.ts"

export type FilmCrewOrchestrator = (
  input: AgentContext,
  options: CrewOrchestratorOptions,
) => Promise<CrewExecutionResult>

export class FilmCrewSkillAdapterError extends Error {
  readonly skillError: SkillError

  constructor(skillError: SkillError) {
    super(`[${skillError.code}] ${skillError.message}`)
    this.name = "FilmCrewSkillAdapterError"
    this.skillError = structuredClone(skillError)
  }
}

interface FilmCrewInputs {
  content: string
  characterRelations?: string
  genre?: string
  style?: string
  targetPlatform?: AgentContext["targetPlatform"]
  shotDensity?: AgentContext["shotDensity"]
  additionalNotes?: string
  title?: string
  mode?: AgentOperationMode
  canvasNodes?: AgentContext["canvasNodes"]
  /** Only server-validated LocalSkill context may populate this field. */
  localSkillContext?: string
}

function inputError(code: string, message: string): FilmCrewSkillAdapterError {
  return new FilmCrewSkillAdapterError({
    code,
    category: "input",
    message,
    retryable: false,
  })
}

function executionError(message: string): FilmCrewSkillAdapterError {
  return new FilmCrewSkillAdapterError({
    code: "FILM_CREW_EXECUTION_FAILED",
    category: "execution",
    message,
    retryable: true,
  })
}

const TARGET_PLATFORMS = new Set<AgentContext["targetPlatform"]>([
  "short-drama", "film", "interactive", "commercial",
])
const SHOT_DENSITIES = new Set<AgentContext["shotDensity"]>([
  "sparse", "normal", "dense",
])
const OPERATION_MODES = new Set<AgentOperationMode>(["ask", "max", "preview"])

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== "string") {
    throw inputError("FILM_CREW_INVALID_INPUT", `inputs.${field} must be a string`)
  }
  return value
}

function mapInputs(inputs: unknown): AgentContext {
  if (inputs === null || typeof inputs !== "object") {
    throw inputError("FILM_CREW_CONTENT_REQUIRED", "inputs.content must be a non-empty string")
  }
  const value = inputs as Partial<FilmCrewInputs>
  if (typeof value.content !== "string" || value.content.trim().length === 0) {
    throw inputError("FILM_CREW_CONTENT_REQUIRED", "inputs.content must be a non-empty string")
  }
  if (value.targetPlatform !== undefined && !TARGET_PLATFORMS.has(value.targetPlatform)) {
    throw inputError("FILM_CREW_INVALID_INPUT", "inputs.targetPlatform is invalid")
  }
  if (value.shotDensity !== undefined && !SHOT_DENSITIES.has(value.shotDensity)) {
    throw inputError("FILM_CREW_INVALID_INPUT", "inputs.shotDensity is invalid")
  }
  if (value.mode !== undefined && !OPERATION_MODES.has(value.mode)) {
    throw inputError("FILM_CREW_INVALID_INPUT", "inputs.mode is invalid")
  }
  const characterRelations = optionalString(value.characterRelations, "characterRelations")
  const additionalNotes = optionalString(value.additionalNotes, "additionalNotes")
  const title = optionalString(value.title, "title")
  const localSkillContext = optionalString(value.localSkillContext, "localSkillContext")
  return {
    script: value.content,
    genre: value.genre ?? "剧情",
    style: value.style ?? "默认",
    targetPlatform: value.targetPlatform ?? "film",
    shotDensity: value.shotDensity ?? "normal",
    mode: value.mode ?? "preview",
    ...(characterRelations === undefined ? {} : { characterRelations }),
    ...(additionalNotes === undefined ? {} : { additionalNotes }),
    ...(title === undefined ? {} : { title }),
    ...(localSkillContext === undefined ? {} : { localSkillContext }),
    ...(value.canvasNodes === undefined ? {} : { canvasNodes: value.canvasNodes }),
  }
}

export class FilmCrewSkillAdapter implements SkillExecutorPort {
  private readonly orchestrate: FilmCrewOrchestrator
  private readonly clock: () => string

  constructor(
    orchestrate: FilmCrewOrchestrator,
    clock: () => string = () => new Date().toISOString(),
  ) {
    this.orchestrate = orchestrate
    this.clock = clock
  }

  async execute(context: SkillExecutionContext): Promise<SkillResult> {
    const input = mapInputs(context.request.inputs)
    if (context.signal?.aborted) {
      throw new FilmCrewSkillAdapterError({
        code: "FILM_CREW_CANCELLED",
        category: "execution",
        message: "Film Crew execution was cancelled before start",
        retryable: true,
      })
    }
    let progress = 0
    let emitQueue = Promise.resolve()
    try {
      const crew = await this.orchestrate(input, {
        ...(context.signal === undefined ? {} : { signal: context.signal }),
        onAgentProgress: (status) => {
          progress += 1
          const event = {
            type: "run.progress" as const,
            runId: context.runId,
            timestamp: this.clock(),
            current: progress,
            total: Math.max(progress, 1),
            message: `${status.roleId}:${status.status}`,
          }
          emitQueue = emitQueue.then(() => context.emit(event))
        },
      })
      await emitQueue
      if (context.signal?.aborted) {
        throw new FilmCrewSkillAdapterError({
          code: "FILM_CREW_CANCELLED",
          category: "execution",
          message: "Film Crew execution was cancelled",
          retryable: true,
        })
      }
      if (progress === 0) {
        await context.emit({
          type: "run.progress",
          runId: context.runId,
          timestamp: this.clock(),
          current: 1,
          total: 1,
          message: "film-crew:completed",
        })
      }

      const failed = crew.agentStatuses.filter((status) => status.status === "error")
      const status = crew.success ? "completed" : "completed_with_warnings"
      return {
        protocolVersion: "1.0",
        requestId: context.request.requestId,
        runId: context.runId,
        skillId: context.skill.id,
        skillVersion: context.skill.version,
        status,
        summary: crew.success ? "导演组分析完成" : "导演组分析完成，但部分角色执行失败",
        data: {
          finalOutput: crew.finalOutput,
          agentStatuses: crew.agentStatuses,
          executionTrace: crew.executionTrace,
        },
        artifacts: [],
        ...(failed.length === 0 ? {} : {
          warnings: [{
            code: "FILM_CREW_PARTIAL_FAILURE",
            message: `${failed.length} 个导演组角色执行失败`,
            severity: "high" as const,
          }],
        }),
        quality: {
          schemaValid: true,
          checks: { crewExecution: failed.length === 0 ? "passed" : "warning" },
        },
        humanReadable: {
          format: "markdown",
          content: crew.executionTrace.join("\n"),
        },
      }
    } catch (error) {
      if (error instanceof FilmCrewSkillAdapterError) throw error
      throw executionError(
        error instanceof Error ? error.message : "Film Crew execution failed",
      )
    }
  }
}
