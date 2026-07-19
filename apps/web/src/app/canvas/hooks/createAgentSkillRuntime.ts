import { FilmCrewSkillAdapter, type FilmCrewOrchestrator } from "../../../lib/workbench-kernel/adapters/film-crew/film-crew-skill-adapter.ts"
import { InMemoryRunAdapter } from "../../../lib/workbench-kernel/adapters/memory/in-memory-run-adapter.ts"
import { FILM_CREW_SKILL_DEFINITION } from "../../../lib/workbench-kernel/catalog/film-crew-skills.ts"
import { SkillRegistry } from "../../../lib/workbench-kernel/registry/skill-registry.ts"
import { SkillRuntime } from "../../../lib/workbench-kernel/runtime/skill-runtime.ts"

export interface AgentSkillRuntimeBundle {
  registry: SkillRegistry
  runs: InMemoryRunAdapter
  runtime: SkillRuntime
}

export interface CreateAgentSkillRuntimeOptions {
  orchestrate: FilmCrewOrchestrator
  createRunId?: () => string
}

/**
 * 画布 AgentNode 的第一条共享 Runtime 装配：保持存储与 UI 解耦，
 * 当前仅使用内存 RunPort，持久化 RunPort 会在后续切片替换。
 */
export function createAgentSkillRuntime(
  options: CreateAgentSkillRuntimeOptions,
): AgentSkillRuntimeBundle {
  const registry = new SkillRegistry([FILM_CREW_SKILL_DEFINITION])
  const runs = new InMemoryRunAdapter()
  const adapter = new FilmCrewSkillAdapter(options.orchestrate)
  const runtime = new SkillRuntime({
    registry,
    runs,
    executors: new Map([[FILM_CREW_SKILL_DEFINITION.execution.entrypoint, adapter]]),
    ...(options.createRunId === undefined ? {} : { createRunId: options.createRunId }),
  })

  return { registry, runs, runtime }
}
