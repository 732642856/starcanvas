import assert from "node:assert/strict"
import test from "node:test"

import {
  CANVAS_LOCAL_PROJECT_ID,
  createFilmCrewRuntimeRequest,
} from "./agentSkillRuntimeRequest.ts"

test("AgentNode maps its script into the explicit Film Crew Runtime request", () => {
  const request = createFilmCrewRuntimeRequest({
    nodeId: "agent-42",
    content: "INT. PALACE - NIGHT",
    requestId: "request-42",
  })

  assert.deepEqual(request, {
    protocolVersion: "1.0",
    requestId: "request-42",
    projectId: CANVAS_LOCAL_PROJECT_ID,
    workspaceId: "general",
    sourceNodeId: "agent-42",
    skillSelector: {
      mode: "explicit",
      id: "film.crew.orchestrator",
      version: "1.0.0",
    },
    intent: {
      type: "film.crew.run",
      goal: "分析并处理画布中的影视任务",
    },
    inputs: { content: "INT. PALACE - NIGHT" },
    execution: { mode: "standard", reviewPolicy: "none" },
    requestedOutputs: ["analysis"],
  })
})

test("AgentNode request may use a stable caller-provided project id", () => {
  const request = createFilmCrewRuntimeRequest({
    nodeId: "agent-7",
    content: "scene",
    requestId: "request-7",
    projectId: "project-7",
  })

  assert.equal(request.projectId, "project-7")
})
