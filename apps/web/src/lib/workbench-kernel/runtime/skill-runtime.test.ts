import test from "node:test"
import assert from "node:assert/strict"
import type { SkillDefinition } from "../contracts/registry.ts"
import type { SkillRequest, SkillResult } from "../contracts/skill.ts"
import { InMemoryRunAdapter } from "../adapters/memory/in-memory-run-adapter.ts"
import { SkillRegistry } from "../registry/skill-registry.ts"
import { SkillRuntime, SkillRuntimeError } from "./skill-runtime.ts"

const skill: SkillDefinition = {
  id: "film.crew.orchestrator",
  version: "1.0.0",
  name: "导演组总控",
  layer: "L1",
  role: "primary",
  domains: ["film"],
  intents: ["film.crew.run"],
  inputSchema: "schema://film/crew/input/1.0",
  outputSchema: "schema://film/crew/output/1.0",
  execution: { type: "hybrid", entrypoint: "adapter://film-crew" },
  routing: { priority: 100, requiredContext: [] },
  quality: { contractTests: [], examples: [], regressionSet: "regression://film/crew/v1" },
}

function request(selector: SkillRequest["skillSelector"] = {
  mode: "route",
  allowedDomains: ["film"],
}): SkillRequest {
  return {
    protocolVersion: "1.0",
    requestId: "req-1",
    projectId: "p1",
    workspaceId: "director",
    skillSelector: selector,
    intent: { type: "film.crew.run", goal: "分析场景" },
    inputs: {},
    execution: { mode: "standard", reviewPolicy: "none" },
    requestedOutputs: ["analysis"],
  }
}

function completedResult(runId: string, overrides: Partial<SkillResult> = {}): SkillResult {
  return {
    protocolVersion: "1.0",
    requestId: "req-1",
    runId,
    skillId: skill.id,
    skillVersion: skill.version,
    status: "completed",
    summary: "完成",
    artifacts: [],
    quality: { schemaValid: true, checks: {} },
    ...overrides,
  }
}

function runtimeWith(execute: (context: { runId: string }) => Promise<SkillResult>) {
  const runs = new InMemoryRunAdapter()
  const runtime = new SkillRuntime({
    registry: new SkillRegistry([skill]),
    runs,
    executors: new Map([[skill.execution.entrypoint, { execute }]]),
    createRunId: () => "run-1",
    clock: () => "2026-07-11T00:00:00.000Z",
  })
  return { runtime, runs }
}

async function assertRuntimeError(
  action: () => Promise<unknown>,
  code: string,
): Promise<SkillRuntimeError> {
  let captured: SkillRuntimeError | undefined
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof SkillRuntimeError)
    assert.equal(error.code, code)
    captured = error
    return true
  })
  return captured!
}

test("runtime 解析 Skill 后保存确切版本并完成运行", async () => {
  const { runtime, runs } = runtimeWith(async ({ runId }) => completedResult(runId))

  const result = await runtime.execute(request())

  assert.equal(result.skillId, skill.id)
  const stored = await runs.getRun(result.runId)
  assert.equal(stored?.resolvedSkill.version, "1.0.0")
  assert.equal(stored?.status, "completed")
  assert.equal(stored?.events[0]?.type, "run.started")
  assert.deepEqual(await runs.getResult(result.runId), result)
})

test("explicit selector 支持确切版本并拒绝未知 Skill", async () => {
  const { runtime } = runtimeWith(async ({ runId }) => completedResult(runId))
  const result = await runtime.execute(request({
    mode: "explicit",
    id: skill.id,
    version: skill.version,
  }))
  assert.equal(result.skillVersion, skill.version)

  await assertRuntimeError(
    () => runtime.execute(request({ mode: "explicit", id: "missing" })),
    "SKILL_NOT_FOUND",
  )
})

test("无候选路由转换为结构化 routing 错误", async () => {
  const { runtime } = runtimeWith(async ({ runId }) => completedResult(runId))
  const error = await assertRuntimeError(
    () => runtime.execute({
      ...request(),
      intent: { type: "missing.intent", goal: "无候选" },
    }),
    "NO_ROUTING_CANDIDATE",
  )
  assert.equal(error.skillError.category, "routing")
})

test("无执行器时记录 failed 运行", async () => {
  const runs = new InMemoryRunAdapter()
  const runtime = new SkillRuntime({
    registry: new SkillRegistry([skill]),
    runs,
    executors: new Map(),
    createRunId: () => "run-1",
    clock: () => "2026-07-11T00:00:00.000Z",
  })

  await assertRuntimeError(() => runtime.execute(request()), "EXECUTOR_NOT_FOUND")
  const stored = await runs.getRun("run-1")
  assert.equal(stored?.status, "failed")
  assert.equal(stored?.events.at(-1)?.type, "run.failed")
})

test("执行器抛错时转换为 execution 错误并记录失败", async () => {
  const { runtime, runs } = runtimeWith(async () => {
    throw new Error("upstream unavailable")
  })

  const error = await assertRuntimeError(() => runtime.execute(request()), "SKILL_EXECUTION_FAILED")
  assert.equal(error.skillError.category, "execution")
  assert.equal((await runs.getRun("run-1"))?.status, "failed")
})

test("执行器结构化 SkillError 被 Runtime 原样保留", async () => {
  const { runtime, runs } = runtimeWith(async () => {
    throw Object.assign(new Error("content required"), {
      skillError: {
        code: "FILM_CREW_CONTENT_REQUIRED",
        category: "input" as const,
        message: "content required",
        retryable: false,
      },
    })
  })

  const error = await assertRuntimeError(
    () => runtime.execute(request()),
    "FILM_CREW_CONTENT_REQUIRED",
  )
  assert.equal(error.skillError.category, "input")
  const failure = (await runs.getRun("run-1"))?.events.at(-1)
  assert.equal(failure?.type, "run.failed")
  assert.equal(failure?.type === "run.failed" ? failure.error.code : undefined, "FILM_CREW_CONTENT_REQUIRED")
})

test("执行器返回错误身份字段时拒绝保存结果", async () => {
  const { runtime, runs } = runtimeWith(async ({ runId }) => completedResult(runId, {
    runId: "wrong-run",
  }))

  await assertRuntimeError(() => runtime.execute(request()), "INVALID_EXECUTOR_RESULT")
  assert.equal(await runs.getResult("run-1"), null)
  assert.equal((await runs.getRun("run-1"))?.status, "failed")
})

test("completed_with_warnings 映射到对应终态", async () => {
  const { runtime, runs } = runtimeWith(async ({ runId }) => completedResult(runId, {
    status: "completed_with_warnings",
    warnings: [{ code: "LOW_CONFIDENCE", message: "置信度偏低", severity: "low" }],
  }))

  const result = await runtime.execute(request())

  assert.equal(result.status, "completed_with_warnings")
  assert.equal((await runs.getRun("run-1"))?.status, "completed_with_warnings")
})
