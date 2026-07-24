import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildClarificationAnswerContext,
  buildClarificationResumePayload,
  buildPendingClarificationSnapshot,
  getPendingActionSummaries,
  resolveActionNodeReference,
  shouldClearPendingClarificationAfterAnswer,
  type AskClarificationAction,
} from "./chatActions.ts"

describe("resolveActionNodeReference", () => {
  const nodes = [
    { id: "script-1", data: { title: "剧本节点" } },
    { id: "concept-old", data: { title: "整体视觉概念图生成" } },
    { id: "concept-new", data: { title: "整体视觉概念图生成" } },
  ]

  it("keeps explicit ids when the node exists", () => {
    assert.equal(
      resolveActionNodeReference({ nodeId: "script-1", nodes }),
      "script-1",
    )
  })

  it("resolves aliases created earlier in the same action batch", () => {
    assert.equal(
      resolveActionNodeReference({
        title: "整体视觉概念图生成",
        aliasMap: { "整体视觉概念图生成": "concept-created" },
        nodes,
      }),
      "concept-created",
    )
  })

  it("resolves title-only actions to the newest matching canvas node", () => {
    assert.equal(
      resolveActionNodeReference({ title: "整体视觉概念图生成", nodes }),
      "concept-new",
    )
  })

  it("returns the raw explicit id when it cannot be resolved yet", () => {
    assert.equal(
      resolveActionNodeReference({ nodeId: "external-node-id", nodes }),
      "external-node-id",
    )
  })

  it("does not invent an id for a missing title-only reference", () => {
    assert.equal(
      resolveActionNodeReference({ title: "不存在的节点", nodes }),
      undefined,
    )
  })
})

describe("clarification helpers", () => {
  const clarificationAction: AskClarificationAction = {
    action: "ask_clarification",
    question: "这条短片最终要横屏还是竖屏？",
    options: ["横屏 16:9", "竖屏 9:16"],
    clarificationId: "clarification-conversation-1-assistant-msg-1-0",
  }

  it("formats ask_clarification as a visible workflow pause", () => {
    const summary = getPendingActionSummaries([clarificationAction])[0]
    assert.match(summary?._summary ?? "", /需要澄清：这条短片最终要横屏还是竖屏/)
  })

  it("builds a persistable pending clarification snapshot", () => {
    const snapshot = buildPendingClarificationSnapshot({
      action: clarificationAction,
      messageId: "assistant-msg-1",
      conversationId: "thread-1",
      createdAt: 123456,
    })

    assert.deepEqual(snapshot, {
      clarificationId: "clarification-conversation-1-assistant-msg-1-0",
      threadId: "thread-1",
      messageId: "assistant-msg-1",
      question: "这条短片最终要横屏还是竖屏？",
      options: ["横屏 16:9", "竖屏 9:16"],
      createdAt: 123456,
    })
  })

  it("builds explicit answer context for the next turn", () => {
    const text = buildClarificationAnswerContext({
      clarificationId: "clarification-conversation-1-assistant-msg-1-0",
      threadId: "thread-1",
      question: "这条短片最终要横屏还是竖屏？",
      options: ["横屏 16:9", "竖屏 9:16"],
      answer: "竖屏 9:16，节奏偏剧情短片。",
    })

    assert.match(text, /【用户正在回答上一轮澄清问题】/)
    assert.match(text, /澄清ID：clarification-conversation-1-assistant-msg-1-0/)
    assert.match(text, /线程ID：thread-1/)
    assert.match(text, /问题：这条短片最终要横屏还是竖屏？/)
    assert.match(text, /用户回答：竖屏 9:16，节奏偏剧情短片。/)
  })

  it("builds a structured resume payload for auto-agent", () => {
    const payload = buildClarificationResumePayload({
      snapshot: {
        clarificationId: "clarification-conversation-1-assistant-msg-1-0",
        threadId: "thread-1",
        messageId: "assistant-msg-1",
        question: "这条短片最终要横屏还是竖屏？",
        options: ["横屏 16:9", "竖屏 9:16"],
        createdAt: 123456,
      },
      answer: "竖屏 9:16，节奏偏剧情短片。",
    })

    assert.deepEqual(payload, {
      clarificationId: "clarification-conversation-1-assistant-msg-1-0",
      threadId: "thread-1",
      messageId: "assistant-msg-1",
      question: "这条短片最终要横屏还是竖屏？",
      options: ["横屏 16:9", "竖屏 9:16"],
      answer: "竖屏 9:16，节奏偏剧情短片。",
    })
  })

  it("keeps a newly issued clarification pending instead of clearing the next one", () => {
    assert.equal(
      shouldClearPendingClarificationAfterAnswer({
        answeredClarificationId: "clarification-a",
        currentPendingClarificationId: "clarification-a",
      }),
      true,
    )
    assert.equal(
      shouldClearPendingClarificationAfterAnswer({
        answeredClarificationId: "clarification-a",
        currentPendingClarificationId: "clarification-b",
      }),
      false,
    )
    assert.equal(
      shouldClearPendingClarificationAfterAnswer({
        answeredClarificationId: undefined,
        currentPendingClarificationId: "clarification-a",
      }),
      false,
    )
  })
})
