import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  hasClarificationAction,
  shouldAutoApplyClarificationSelection,
  shouldAutoApplyAutoAgentActions,
} from "./chatAutoAgentFlow.ts"
import type { ChatCanvasAction } from "../../features/canvas/actions/chatActions.ts"

const createNodeAction: ChatCanvasAction = {
  action: "create_node",
  nodeType: "content",
  title: "分镜草案",
  content: "雨夜旧影院重逢。",
}

const clarificationAction: ChatCanvasAction = {
  action: "ask_clarification",
  question: "你想把它推进到哪一步？",
  options: ["生成分镜", "拆成制作圣经"],
}

describe("chatAutoAgentFlow", () => {
  it("detects clarification actions", () => {
    assert.equal(hasClarificationAction([createNodeAction]), false)
    assert.equal(hasClarificationAction([clarificationAction]), true)
  })

  it("only auto-applies concrete actions in max mode", () => {
    assert.equal(shouldAutoApplyAutoAgentActions("ask", [createNodeAction]), false)
    assert.equal(shouldAutoApplyAutoAgentActions("preview", [createNodeAction]), false)
    assert.equal(shouldAutoApplyAutoAgentActions("max", [createNodeAction]), true)
  })

  it("does not auto-apply clarification even in max mode", () => {
    assert.equal(shouldAutoApplyAutoAgentActions("max", [clarificationAction]), false)
  })

  it("treats ask/max clarification selection as confirmation but keeps preview non-destructive", () => {
    assert.equal(shouldAutoApplyClarificationSelection("ask", [createNodeAction]), true)
    assert.equal(shouldAutoApplyClarificationSelection("max", [createNodeAction]), true)
    assert.equal(shouldAutoApplyClarificationSelection("preview", [createNodeAction]), false)
    assert.equal(shouldAutoApplyClarificationSelection("ask", [clarificationAction]), false)
  })
})
