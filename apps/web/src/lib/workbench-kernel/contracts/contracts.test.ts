import test from "node:test"
import assert from "node:assert/strict"
import {
  isResourceRef,
  isTerminalRunStatus,
  type SkillRequest,
} from "./index.ts"

test("resource ref 只接受受支持 scheme", () => {
  assert.equal(isResourceRef("asset://scripts/scene-003/v1"), true)
  assert.equal(isResourceRef("bible://characters/lin-mo"), true)
  assert.equal(isResourceRef("https://example.com/raw"), false)
})

test("终态判断覆盖成功失败取消", () => {
  assert.equal(isTerminalRunStatus("completed"), true)
  assert.equal(isTerminalRunStatus("failed"), true)
  assert.equal(isTerminalRunStatus("cancelled"), true)
  assert.equal(isTerminalRunStatus("waiting_review"), false)
})

test("SkillRequest 支持明确选择与意图路由", () => {
  const request: SkillRequest = {
    protocolVersion: "1.0",
    requestId: "req-1",
    projectId: "project-1",
    workspaceId: "director",
    skillSelector: { mode: "route", allowedDomains: ["film"] },
    intent: { type: "storyboard.generate", goal: "生成分镜" },
    inputs: { sceneRef: "asset://scripts/scene-003/v1" },
    execution: { mode: "standard", reviewPolicy: "required" },
    requestedOutputs: ["storyboard"]
  }
  assert.equal(request.skillSelector.mode, "route")
})
