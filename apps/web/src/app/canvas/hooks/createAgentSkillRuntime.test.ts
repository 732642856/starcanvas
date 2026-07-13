import test from "node:test"
import assert from "node:assert/strict"

import { createAgentSkillRuntime } from "./createAgentSkillRuntime.ts"

test("装配函数注册 Film Crew 并返回可执行 runtime", async () => {
  const bundle = createAgentSkillRuntime({
    orchestrate: async () => ({
      success: true,
      finalOutput: { emotionalCurve: [0.3, 0.8] },
      agentStatuses: [],
      executionTrace: [],
    }),
  })

  assert.equal(bundle.registry.getSkill("film.crew.orchestrator")?.version, "1.0.0")
  assert.equal(typeof bundle.runtime.execute, "function")

  const result = await bundle.runtime.execute({
    protocolVersion: "1.0",
    requestId: "request-1",
    projectId: "project-1",
    workspaceId: "general",
    sourceNodeId: "agent-1",
    skillSelector: { mode: "explicit", id: "film.crew.orchestrator", version: "1.0.0" },
    intent: { type: "film.crew.run", goal: "分析剧本" },
    inputs: { content: "INT. ROOM - NIGHT" },
    execution: { mode: "standard", reviewPolicy: "none" },
    requestedOutputs: ["analysis"],
  })

  assert.equal(result.status, "completed")
  assert.equal(result.skillId, "film.crew.orchestrator")
  assert.equal((await bundle.runs.getRun(result.runId))?.status, "completed")
})
