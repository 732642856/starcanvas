import test from "node:test"
import assert from "node:assert/strict"

import { mapRunToAgentNodePatch } from "../../../lib/workbench-kernel/adapters/canvas/agent-node-run-state.ts"
import { createAgentSkillRuntime } from "./createAgentSkillRuntime.ts"

test("Film Crew 从画布装配经共享 Runtime 完成并映射回 AgentNode 状态", async () => {
  const bundle = createAgentSkillRuntime({
    createRunId: () => "film-canvas-run-1",
    orchestrate: async (_context, options) => {
      options.onAgentProgress?.({ roleId: "director", status: "running" })
      options.onAgentProgress?.({ roleId: "director", status: "done", output: "拆解完成" })
      return {
        success: true,
        finalOutput: { emotionalCurve: [0.2, 0.8] },
        agentStatuses: [{ roleId: "director", status: "done", output: "拆解完成" }],
        executionTrace: ["director:running", "director:done"],
      }
    },
  })

  const result = await bundle.runtime.execute({
    protocolVersion: "1.0",
    requestId: "canvas-request-1",
    projectId: "project-1",
    workspaceId: "general",
    sourceNodeId: "agent-node-1",
    skillSelector: {
      mode: "explicit",
      id: "film.crew.orchestrator",
      version: "1.0.0",
    },
    intent: { type: "film.crew.run", goal: "分析画布中的剧本任务" },
    inputs: { content: "INT. ROOM - NIGHT" },
    execution: { mode: "standard", reviewPolicy: "none" },
    requestedOutputs: ["analysis"],
  })

  const patch = mapRunToAgentNodePatch({
    runId: result.runId,
    status: result.status,
    summary: result.summary,
    data: result.data as {
      agentStatuses?: [{ roleId: string; status: "done"; output: string }]
      executionTrace?: string[]
    },
  })

  assert.equal(result.runId, "film-canvas-run-1")
  assert.equal((await bundle.runs.getRun(result.runId))?.status, "completed")
  assert.equal(patch.agentStatus, "done")
  assert.equal(patch.lastSuccessfulRunId, "film-canvas-run-1")
  assert.deepEqual(patch.crewStatuses, [{ roleId: "director", status: "done", output: "拆解完成" }])
  assert.deepEqual(patch.executionTrace, ["director:running", "director:done"])
  assert.equal(patch.runMeta?.runStatus, "succeeded")
})
