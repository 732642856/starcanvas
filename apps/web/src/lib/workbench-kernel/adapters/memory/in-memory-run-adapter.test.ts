import test from "node:test"
import assert from "node:assert/strict"
import type { RunEvent, RunRecord, RunStatus } from "../../contracts/run.ts"
import type { SkillResult } from "../../contracts/skill.ts"
import type { RunPort } from "../../ports/run-port.ts"
import { InMemoryRunAdapter, RunStoreError } from "./in-memory-run-adapter.ts"

const timestamps = [
  "2026-07-11T00:00:01.000Z",
  "2026-07-11T00:00:02.000Z",
  "2026-07-11T00:00:03.000Z",
]

function createStore(): InMemoryRunAdapter {
  let index = 0
  return new InMemoryRunAdapter(() => timestamps[index++] ?? timestamps.at(-1)!)
}

function run(runId = "run-1", status: RunStatus = "queued"): RunRecord {
  return {
    runId,
    requestId: `request-${runId}`,
    projectId: "project-1",
    workspaceId: "director",
    resolvedSkill: { id: "film.crew", version: "1.0.0", definitionDigest: "digest" },
    status,
    events: [],
    createdAt: "2026-07-11T00:00:00.000Z",
    updatedAt: "2026-07-11T00:00:00.000Z",
  }
}

function result(runId = "run-1"): SkillResult<{ nested: { value: string } }> {
  return {
    protocolVersion: "1.0",
    requestId: `request-${runId}`,
    runId,
    skillId: "film.crew",
    skillVersion: "1.0.0",
    status: "completed",
    summary: "完成",
    data: { nested: { value: "original" } },
    artifacts: [],
    quality: { schemaValid: true, checks: {} },
  }
}

async function assertRunStoreError(
  action: () => Promise<unknown>,
  code: string,
  details: Record<string, unknown>,
): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof RunStoreError)
    assert.equal(error.name, "RunStoreError")
    assert.equal(error.code, code)
    assert.deepEqual(error.details, details)
    return true
  })
}

test("实现 RunPort 全部方法", () => {
  const store: RunPort = createStore()
  assert.equal(typeof store.createRun, "function")
  assert.equal(typeof store.getRun, "function")
  assert.equal(typeof store.getResult, "function")
  assert.equal(typeof store.listEvents, "function")
  assert.equal(typeof store.subscribe, "function")
  assert.equal(typeof store.appendEvent, "function")
  assert.equal(typeof store.updateStatus, "function")
  assert.equal(typeof store.saveResult, "function")
  assert.equal(typeof store.pauseRun, "function")
  assert.equal(typeof store.resumeRun, "function")
  assert.equal(typeof store.cancelRun, "function")
})

test("运行可跨调用查询，事件按游标读取且时间戳由 clock 确定", async () => {
  const store = createStore()
  await store.createRun(run())
  const first: RunEvent = {
    type: "run.progress",
    runId: "run-1",
    timestamp: "2026-07-11T00:00:10.000Z",
    current: 1,
    total: 2,
    message: "第一步",
  }
  const second: RunEvent = {
    type: "run.started",
    runId: "run-1",
    timestamp: "2026-07-11T00:00:11.000Z",
  }
  await store.appendEvent("run-1", first)
  await store.appendEvent("run-1", second)

  assert.equal((await store.getRun("run-1"))?.events.length, 2)
  assert.deepEqual(await store.listEvents("run-1", 1), { items: [second], nextCursor: 2 })
  assert.deepEqual(await store.listEvents("run-1", 99), { items: [], nextCursor: 2 })
  assert.equal((await store.getRun("run-1"))?.updatedAt, "2026-07-11T00:00:02.000Z")
  assert.equal(await store.getRun("missing"), null)
  assert.equal(await store.getResult("missing"), null)
})

test("create、get、result、events 和 listener 的值均与内部状态隔离", async () => {
  const store = createStore()
  const source = run()
  const created = await store.createRun(source)
  source.resolvedSkill.id = "changed-source"
  created.resolvedSkill.id = "changed-created"

  const event: RunEvent = {
    type: "run.progress",
    runId: "run-1",
    timestamp: "2026-07-11T00:00:10.000Z",
    current: 1,
    total: 2,
    message: "original",
  }
  let received: RunEvent | undefined
  store.subscribe("run-1", (next) => {
    received = next
    if (next.type === "run.progress") next.message = "changed-listener"
  })
  await store.appendEvent("run-1", event)
  if (event.type === "run.progress") event.message = "changed-source"

  const savedResult = result()
  await store.saveResult("run-1", savedResult)
  savedResult.data!.nested.value = "changed-source"

  const fetched = await store.getRun("run-1")
  assert.ok(fetched)
  fetched.resolvedSkill.id = "changed-read"
  if (fetched.events[0].type === "run.progress") fetched.events[0].message = "changed-read"
  fetched.result!.data = { nested: { value: "changed-read" } }

  const listed = await store.listEvents("run-1")
  if (listed.items[0].type === "run.progress") listed.items[0].message = "changed-list"
  const fetchedResult = await store.getResult("run-1") as SkillResult<{ nested: { value: string } }>
  fetchedResult.data!.nested.value = "changed-result-read"

  const finalRun = await store.getRun("run-1")
  const finalResult = await store.getResult("run-1") as SkillResult<{ nested: { value: string } }>
  assert.equal(finalRun?.resolvedSkill.id, "film.crew")
  assert.equal(finalRun?.events[0].type === "run.progress" && finalRun.events[0].message, "original")
  assert.equal(finalResult.data?.nested.value, "original")
  assert.equal(received?.type, "run.progress")
})

test("重复 run 和未找到 run 使用稳定结构化错误", async () => {
  const store = createStore()
  await store.createRun(run())
  await assertRunStoreError(
    () => store.createRun(run()),
    "DUPLICATE_RUN",
    { runId: "run-1" },
  )

  const operations = [
    () => store.listEvents("missing"),
    () => store.appendEvent("missing", { type: "run.started", runId: "missing", timestamp: timestamps[0] }),
    () => store.updateStatus("missing", "running"),
    () => store.saveResult("missing", result("missing")),
    () => store.pauseRun("missing"),
    () => store.resumeRun("missing"),
    () => store.cancelRun("missing"),
  ]
  for (const operation of operations) {
    await assertRunStoreError(operation, "RUN_NOT_FOUND", { runId: "missing" })
  }
  assert.throws(
    () => store.subscribe("missing", () => undefined),
    (error: unknown) => error instanceof RunStoreError
      && error.code === "RUN_NOT_FOUND"
      && error.details?.runId === "missing",
  )
})

test("状态机仅允许 brief 指定的转换", async () => {
  const allowed: Array<[RunStatus, RunStatus]> = [
    ["queued", "running"], ["queued", "cancelled"],
    ["running", "waiting_input"], ["running", "waiting_review"], ["running", "paused"],
    ["running", "completed"], ["running", "completed_with_warnings"], ["running", "failed"],
    ["running", "cancelled"], ["waiting_input", "running"], ["waiting_input", "cancelled"],
    ["waiting_review", "running"], ["waiting_review", "failed"], ["waiting_review", "cancelled"],
    ["paused", "running"], ["paused", "cancelled"],
  ]

  for (const [from, to] of allowed) {
    const store = createStore()
    await store.createRun(run(`${from}-${to}`, from))
    await store.updateStatus(`${from}-${to}`, to)
    assert.equal((await store.getRun(`${from}-${to}`))?.status, to)
  }

  const disallowed: Array<[RunStatus, RunStatus]> = [
    ["queued", "paused"], ["running", "queued"], ["waiting_input", "failed"],
    ["waiting_review", "completed"], ["paused", "failed"], ["running", "running"],
  ]
  for (const [from, to] of disallowed) {
    const store = createStore()
    const runId = `${from}-${to}`
    await store.createRun(run(runId, from))
    await assertRunStoreError(
      () => store.updateStatus(runId, to),
      "INVALID_RUN_TRANSITION",
      { runId, from, to },
    )
  }
})

test("所有终态均不可转换", async () => {
  const terminal: RunStatus[] = ["completed", "completed_with_warnings", "failed", "cancelled"]
  for (const status of terminal) {
    const store = createStore()
    await store.createRun(run(status, status))
    await assertRunStoreError(
      () => store.updateStatus(status, "running"),
      "INVALID_RUN_TRANSITION",
      { runId: status, from: status, to: "running" },
    )
  }
})

test("pause、resume 和 cancel 委托严格状态转换并保存取消事件", async () => {
  const store = createStore()
  await store.createRun(run())
  await store.updateStatus("run-1", "running")
  await store.pauseRun("run-1")
  assert.equal((await store.getRun("run-1"))?.status, "paused")
  await store.resumeRun("run-1")
  assert.equal((await store.getRun("run-1"))?.status, "running")
  await store.cancelRun("run-1", "user")

  const cancelled = await store.getRun("run-1")
  assert.equal(cancelled?.status, "cancelled")
  assert.deepEqual(cancelled?.events.at(-1), {
    type: "run.cancelled",
    runId: "run-1",
    timestamp: "2026-07-11T00:00:03.000Z",
    reason: "user",
  })
  await assertRunStoreError(
    () => store.resumeRun("run-1"),
    "INVALID_RUN_TRANSITION",
    { runId: "run-1", from: "cancelled", to: "running" },
  )
})

test("listener 只接收订阅 run 的新事件且 unsubscribe 生效", async () => {
  const store = createStore()
  await store.createRun(run("run-1"))
  await store.createRun(run("run-2"))
  const received: RunEvent[] = []
  const unsubscribe = store.subscribe("run-1", (event) => received.push(event))

  await store.appendEvent("run-2", { type: "run.started", runId: "run-2", timestamp: timestamps[0] })
  await store.appendEvent("run-1", { type: "run.started", runId: "run-1", timestamp: timestamps[1] })
  unsubscribe()
  await store.appendEvent("run-1", { type: "run.started", runId: "run-1", timestamp: timestamps[2] })

  assert.deepEqual(received, [
    { type: "run.started", runId: "run-1", timestamp: timestamps[1] },
  ])
})

test("拒绝把其他 run 的事件写入当前运行", async () => {
  const store = createStore()
  await store.createRun(run("run-1"))

  await assertRunStoreError(
    () => store.appendEvent("run-1", {
      type: "run.started",
      runId: "run-2",
      timestamp: timestamps[0],
    }),
    "EVENT_RUN_MISMATCH",
    { runId: "run-1", eventRunId: "run-2" },
  )
  assert.deepEqual((await store.getRun("run-1"))?.events, [])
})

test("单个 listener 抛错不影响事件持久化和其他 listener", async () => {
  const store = createStore()
  await store.createRun(run())
  const received: RunEvent[] = []
  store.subscribe("run-1", () => {
    throw new Error("listener failed")
  })
  store.subscribe("run-1", (event) => received.push(event))
  const event: RunEvent = {
    type: "run.started",
    runId: "run-1",
    timestamp: timestamps[0],
  }

  await store.appendEvent("run-1", event)

  assert.deepEqual((await store.getRun("run-1"))?.events, [event])
  assert.deepEqual(received, [event])
})

test("拒绝非法事件游标", async () => {
  const store = createStore()
  await store.createRun(run())

  for (const cursor of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    await assertRunStoreError(
      () => store.listEvents("run-1", cursor),
      "INVALID_EVENT_CURSOR",
      { runId: "run-1", cursor },
    )
  }
})
