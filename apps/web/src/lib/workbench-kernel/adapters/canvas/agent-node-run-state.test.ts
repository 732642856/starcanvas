import test from "node:test"
import assert from "node:assert/strict"

import { mapRunToAgentNodePatch } from "./agent-node-run-state.ts"

test("completed 运行映射为旧节点 done 状态和正式导演组字段", () => {
  const patch = mapRunToAgentNodePatch({
    runId: "run-1",
    status: "completed",
    summary: "导演组分析完成",
    data: {
      agentStatuses: [{ roleId: "director", status: "done" }],
      executionTrace: ["director:done"],
    },
  })

  assert.equal(patch.agentStatus, "done")
  assert.equal(patch.agentOutput, "导演组分析完成")
  assert.equal(patch.activeRunId, undefined)
  assert.equal(patch.lastSuccessfulRunId, "run-1")
  assert.deepEqual(patch.crewStatuses, [{ roleId: "director", status: "done" }])
  assert.deepEqual(patch.executionTrace, ["director:done"])
  assert.equal(patch.runMeta?.runStatus, "succeeded")
  assert.equal(patch.runMeta?.runId, "run-1")
})

test("运行中状态保留 activeRunId 并映射为 running", () => {
  const patch = mapRunToAgentNodePatch({
    runId: "run-2",
    status: "waiting_review",
    summary: "等待审核",
  })

  assert.equal(patch.agentStatus, "running")
  assert.equal(patch.activeRunId, "run-2")
  assert.equal(Object.hasOwn(patch, "lastSuccessfulRunId"), false)
  assert.equal(patch.runMeta?.runStatus, "running")
})

test("failed 运行映射为 error 并保留失败摘要但不清空最近成功运行", () => {
  const patch = mapRunToAgentNodePatch({
    runId: "run-3",
    status: "failed",
    summary: "执行失败",
  })

  assert.equal(patch.agentStatus, "error")
  assert.equal(patch.agentOutput, "执行失败")
  assert.equal(patch.activeRunId, undefined)
  assert.equal(Object.hasOwn(patch, "lastSuccessfulRunId"), false)
  assert.equal(patch.runMeta?.runStatus, "failed")
  assert.equal(patch.runMeta?.error, "执行失败")
})

test("映射结果克隆导演组数组，避免调用方反向修改输入", () => {
  const agentStatuses = [{ roleId: "writer", status: "running" }]
  const executionTrace = ["writer:start"]
  const patch = mapRunToAgentNodePatch({
    runId: "run-4",
    status: "running",
    summary: "执行中",
    data: { agentStatuses, executionTrace },
  })

  agentStatuses[0].status = "done"
  executionTrace.push("writer:done")

  assert.deepEqual(patch.crewStatuses, [{ roleId: "writer", status: "running" }])
  assert.deepEqual(patch.executionTrace, ["writer:start"])
})
