import test from "node:test"
import assert from "node:assert/strict"
import type {
  AgentContext,
  CrewAgentStatus,
  CrewExecutionResult,
} from "../../../agents/film-crew-agents.ts"
import { FILM_CREW_SKILL_DEFINITION } from "../../catalog/film-crew-skills.ts"
import type { RunEvent } from "../../contracts/run.ts"
import type { SkillExecutionContext } from "../../ports/skill-executor-port.ts"
import {
  FilmCrewSkillAdapter,
  FilmCrewSkillAdapterError,
} from "./film-crew-skill-adapter.ts"

function context(inputs: Record<string, unknown>): SkillExecutionContext {
  return {
    request: {
      protocolVersion: "1.0",
      requestId: "req-1",
      projectId: "project-1",
      workspaceId: "director",
      skillSelector: { mode: "explicit", id: FILM_CREW_SKILL_DEFINITION.id },
      intent: { type: "film.crew.run", goal: "分析剧本" },
      inputs,
      execution: { mode: "standard", reviewPolicy: "none" },
      requestedOutputs: ["analysis"],
    },
    runId: "run-1",
    skill: FILM_CREW_SKILL_DEFINITION,
    emit: async () => {},
  }
}

const doneStatus: CrewAgentStatus = {
  roleId: "director",
  status: "done",
  output: "导演意见",
}

const crewResult: CrewExecutionResult = {
  success: true,
  finalOutput: { emotionalCurve: [0.2, 0.8] },
  agentStatuses: [doneStatus],
  executionTrace: ["director:done"],
}

test("Film Crew Skill 定义满足确定性注册契约", () => {
  assert.equal(FILM_CREW_SKILL_DEFINITION.id, "film.crew.orchestrator")
  assert.equal(FILM_CREW_SKILL_DEFINITION.version, "1.0.0")
  assert.equal(FILM_CREW_SKILL_DEFINITION.role, "primary")
  assert.deepEqual(FILM_CREW_SKILL_DEFINITION.intents, [
    "film.crew.run",
    "director.analyze",
    "storyboard.consult",
  ])
  assert.equal(FILM_CREW_SKILL_DEFINITION.execution.entrypoint, "adapter://film-crew")
})

test("Film Crew 结果映射为统一 SkillResult 并保留运行数据", async () => {
  let received: AgentContext | undefined
  const adapter = new FilmCrewSkillAdapter(async (input) => {
    received = input
    return crewResult
  })
  const events: RunEvent[] = []
  const execution = context({
    content: "INT. ROOM - NIGHT",
    genre: "悬疑",
    style: "黑色电影",
    targetPlatform: "film",
    shotDensity: "dense",
    mode: "preview",
    title: "夜室",
  })
  execution.emit = async (event) => { events.push(event) }

  const result = await adapter.execute(execution)

  assert.deepEqual(received, {
    script: "INT. ROOM - NIGHT",
    genre: "悬疑",
    style: "黑色电影",
    targetPlatform: "film",
    shotDensity: "dense",
    mode: "preview",
    title: "夜室",
  })
  assert.equal(result.status, "completed")
  assert.equal(result.summary, "导演组分析完成")
  assert.deepEqual(result.data, {
    finalOutput: crewResult.finalOutput,
    agentStatuses: crewResult.agentStatuses,
    executionTrace: crewResult.executionTrace,
  })
  assert.equal(events.some((event) => event.type === "run.progress"), true)
})

test("orchestrator progress 映射为 run.progress 且透传取消信号", async () => {
  const controller = new AbortController()
  const events: RunEvent[] = []
  const adapter = new FilmCrewSkillAdapter(async (_input, options) => {
    assert.equal(options.signal, controller.signal)
    options.onAgentProgress?.({ roleId: "director", status: "running" })
    options.onAgentProgress?.(doneStatus)
    return crewResult
  })
  const execution = context({ content: "scene" })
  execution.signal = controller.signal
  execution.emit = async (event) => { events.push(event) }

  await adapter.execute(execution)

  const progress = events.filter((event) => event.type === "run.progress")
  assert.equal(progress.length, 2)
  assert.equal(progress[0]?.runId, "run-1")
  assert.match(progress[1]?.message ?? "", /director.*done/)
})

test("缺少 content 时抛出结构化 input 错误且不调用 orchestrator", async () => {
  let called = false
  const adapter = new FilmCrewSkillAdapter(async () => {
    called = true
    return crewResult
  })

  await assert.rejects(
    () => adapter.execute(context({ content: "   " })),
    (error: unknown) => {
      assert.ok(error instanceof FilmCrewSkillAdapterError)
      assert.equal(error.skillError.code, "FILM_CREW_CONTENT_REQUIRED")
      assert.equal(error.skillError.category, "input")
      return true
    },
  )
  assert.equal(called, false)
})

test("部分角色失败映射为 completed_with_warnings", async () => {
  const adapter = new FilmCrewSkillAdapter(async () => ({
    ...crewResult,
    success: false,
    agentStatuses: [{ roleId: "director", status: "error", error: "失败" }],
  }))

  const result = await adapter.execute(context({ content: "scene" }))

  assert.equal(result.status, "completed_with_warnings")
  assert.equal(result.warnings?.[0]?.code, "FILM_CREW_PARTIAL_FAILURE")
})

test("未知 orchestrator 异常转换为 execution 类结构化错误", async () => {
  const adapter = new FilmCrewSkillAdapter(async () => {
    throw new Error("upstream unavailable")
  })

  await assert.rejects(
    () => adapter.execute(context({ content: "scene" })),
    (error: unknown) => {
      assert.ok(error instanceof FilmCrewSkillAdapterError)
      assert.equal(error.skillError.code, "FILM_CREW_EXECUTION_FAILED")
      assert.equal(error.skillError.category, "execution")
      assert.match(error.skillError.message, /upstream unavailable/)
      return true
    },
  )
})

test("等待异步 progress emit 完成并保持事件顺序", async () => {
  const received: string[] = []
  const adapter = new FilmCrewSkillAdapter(async (_input, options) => {
    options.onAgentProgress?.({ roleId: "director", status: "running" })
    options.onAgentProgress?.(doneStatus)
    return crewResult
  })
  const execution = context({ content: "scene" })
  execution.emit = async (event) => {
    await new Promise((resolve) => setTimeout(resolve, event.type === "run.progress" && event.current === 1 ? 10 : 0))
    if (event.type === "run.progress") received.push(event.message)
  }

  await adapter.execute(execution)

  assert.deepEqual(received, ["director:running", "director:done"])
})

test("拒绝非法枚举输入且预取消不调用 orchestrator", async () => {
  let called = false
  const adapter = new FilmCrewSkillAdapter(async () => {
    called = true
    return crewResult
  })

  await assert.rejects(
    () => adapter.execute(context({ content: "scene", mode: "invalid" })),
    (error: unknown) => error instanceof FilmCrewSkillAdapterError
      && error.skillError.code === "FILM_CREW_INVALID_INPUT",
  )

  const controller = new AbortController()
  controller.abort()
  const execution = context({ content: "scene" })
  execution.signal = controller.signal
  await assert.rejects(
    () => adapter.execute(execution),
    (error: unknown) => error instanceof FilmCrewSkillAdapterError
      && error.skillError.code === "FILM_CREW_CANCELLED",
  )
  assert.equal(called, false)
})

test("Skill 定义的嵌套集合不可被修改", () => {
  assert.throws(() => {
    ;(FILM_CREW_SKILL_DEFINITION.domains as string[]).push("hacked")
  }, TypeError)
  assert.throws(() => {
    ;(FILM_CREW_SKILL_DEFINITION.execution as { entrypoint: string }).entrypoint = "hacked"
  }, TypeError)
})
