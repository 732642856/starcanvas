import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  deriveChatActionUiState,
  getCancelablePreviewNodeIds,
  getPendingActionDisplayActions,
  getPreviewDraftBlockingReason,
  getPreviewDraftProgress,
  hasDraftPreviewActions,
  shouldAutoCancelPreviewTransaction,
  shouldAutoApplyDeferredPreviewActions,
} from "./chatPreviewState.ts"

describe("chat preview state", () => {
  it("detects draft preview create actions", () => {
    assert.equal(
      hasDraftPreviewActions([
        {
          action: "create_node",
          nodeType: "content",
          data: { isDraft: true },
        },
      ]),
      true,
    )
  })

  it("prefers committed transaction state over local message flags", () => {
    const report = {
      results: [{ index: 0, action: "run_node", status: "applied" as const }],
      aliasMap: {},
    }

    assert.deepEqual(
      deriveChatActionUiState(
        {
          actionsApplied: false,
          actions: [{ action: "run_node", nodeId: "node-1" }],
        },
        {
          id: "tx-1",
          conversationId: "conv-1",
          draftNodes: { "node-1": "confirmed" },
          deferredActions: [{ action: "run_node", nodeId: "node-1" }],
          commitReport: report,
          phase: "deferred_applied",
          createdAt: 1,
        },
      ),
      {
        phase: "applied",
        report,
        isDraftPreview: true,
      },
    )
  })

  it("surfaces cancelled transactions as cancelled", () => {
    assert.deepEqual(
      deriveChatActionUiState(
        {
          actionsApplied: true,
          actions: [
            {
              action: "create_node",
              nodeType: "content",
              data: { isDraft: true },
            },
          ],
        },
        {
          id: "tx-2",
          draftNodes: { "node-1": "discarded" },
          deferredActions: [],
          phase: "cancelled",
          createdAt: 1,
        },
      ),
      {
        phase: "cancelled",
        report: undefined,
        isDraftPreview: true,
      },
    )
  })

  it("treats preview transactions without deferred actions as already applied", () => {
    const report = {
      results: [{ index: 0, action: "create_node", status: "applied" as const }],
      aliasMap: {},
    }

    assert.deepEqual(
      deriveChatActionUiState(
        {
          actions: [
            {
              action: "create_node",
              nodeType: "content",
              data: { isDraft: true },
            },
          ],
        },
        {
          id: "tx-preview-only",
          draftNodes: { "node-1": "pending" },
          deferredActions: [],
          previewReport: report,
          phase: "preview",
          createdAt: 1,
        },
      ),
      {
        phase: "applied",
        report,
        isDraftPreview: true,
      },
    )
  })

  it("ignores stale local cancelled flags when preview transaction is still pending", () => {
    assert.deepEqual(
      deriveChatActionUiState(
        {
          actionsCancelled: true,
          actions: [
            {
              action: "create_node",
              nodeType: "content",
              data: { isDraft: true },
            },
          ],
        },
        {
          id: "tx-pending",
          draftNodes: { "node-1": "pending" },
          deferredActions: [{ action: "run_node", nodeId: "node-1" }],
          phase: "preview",
          createdAt: 1,
        },
      ),
      {
        phase: "pending",
        report: undefined,
        isDraftPreview: true,
      },
    )
  })

  it("only deletes still-pending draft nodes when cancelling a preview", () => {
    assert.deepEqual(
      getCancelablePreviewNodeIds({
        id: "tx-3",
        draftNodes: {
          "node-pending": "pending",
          "node-confirmed": "confirmed",
          "node-discarded": "discarded",
        },
        deferredActions: [],
        phase: "preview",
        createdAt: 1,
      }),
      ["node-pending"],
    )
  })

  it("falls back to legacy preview node ids when no transaction exists", () => {
    assert.deepEqual(getCancelablePreviewNodeIds(undefined, ["node-1"]), ["node-1"])
  })

  it("treats deferred-only messages as draft preview when the transaction still owns draft nodes", () => {
    assert.deepEqual(
      deriveChatActionUiState(
        {
          actions: [{ action: "run_node", nodeId: "node-1" }],
        },
        {
          id: "tx-4",
          draftNodes: { "node-1": "confirmed" },
          deferredActions: [{ action: "run_node", nodeId: "node-1" }],
          phase: "preview",
          createdAt: 1,
        },
      ),
      {
        phase: "pending",
        report: undefined,
        isDraftPreview: true,
      },
    )
  })

  it("auto-applies deferred actions only after all draft nodes are confirmed", () => {
    assert.equal(
      shouldAutoApplyDeferredPreviewActions({
        id: "tx-5",
        draftNodes: {
          "node-1": "confirmed",
          "node-2": "confirmed",
        },
        deferredActions: [{ action: "connect_nodes", sourceId: "node-1", targetId: "node-2" }],
        phase: "preview",
        createdAt: 1,
      }),
      true,
    )

    assert.equal(
      shouldAutoApplyDeferredPreviewActions({
        id: "tx-6",
        draftNodes: {
          "node-1": "confirmed",
          "node-2": "pending",
        },
        deferredActions: [{ action: "connect_nodes", sourceId: "node-1", targetId: "node-2" }],
        phase: "preview",
        createdAt: 1,
      }),
      false,
    )

    assert.equal(
      shouldAutoApplyDeferredPreviewActions({
        id: "tx-expected-missing",
        expectedDraftCount: 2,
        draftNodes: {
          "node-1": "confirmed",
        },
        deferredActions: [{ action: "connect_nodes", sourceId: "node-1", targetId: "node-2" }],
        phase: "preview",
        createdAt: 1,
      }),
      false,
    )
  })

  it("auto-cancels preview transactions when all draft nodes are discarded", () => {
    assert.equal(
      shouldAutoCancelPreviewTransaction({
        id: "tx-cancel-all",
        draftNodes: {
          "node-1": "discarded",
          "node-2": "discarded",
        },
        deferredActions: [],
        phase: "preview",
        createdAt: 1,
      }),
      true,
    )
  })

  it("auto-cancels deferred preview transactions when all draft nodes are resolved and at least one was discarded", () => {
    assert.equal(
      shouldAutoCancelPreviewTransaction({
        id: "tx-cancel-mixed",
        draftNodes: {
          "node-1": "confirmed",
          "node-2": "discarded",
        },
        deferredActions: [{ action: "connect_nodes", sourceId: "node-1", targetId: "node-2" }],
        phase: "preview",
        createdAt: 1,
      }),
      true,
    )

    assert.equal(
      shouldAutoCancelPreviewTransaction({
        id: "tx-still-pending",
        draftNodes: {
          "node-1": "confirmed",
          "node-2": "pending",
        },
        deferredActions: [{ action: "connect_nodes", sourceId: "node-1", targetId: "node-2" }],
        phase: "preview",
        createdAt: 1,
      }),
      false,
    )
  })

  it("summarizes preview draft progress for chat guidance", () => {
    assert.deepEqual(
      getPreviewDraftProgress({
        id: "tx-progress",
        expectedDraftCount: 5,
        draftNodes: {
          "node-1": "pending",
          "node-2": "confirmed",
          "node-3": "discarded",
          "node-4": "confirmed",
        },
        deferredActions: [],
        phase: "preview",
        createdAt: 1,
      }),
      {
        total: 5,
        visible: 4,
        pending: 1,
        confirmed: 2,
        discarded: 1,
        missing: 1,
      },
    )

    assert.equal(getPreviewDraftProgress(undefined), undefined)
  })

  it("explains when deferred preview actions are blocked by missing draft nodes", () => {
    assert.equal(
      getPreviewDraftBlockingReason({
        id: "tx-blocked",
        expectedDraftCount: 2,
        draftNodes: {
          "node-1": "confirmed",
        },
        deferredActions: [{ action: "connect_nodes", sourceId: "node-1", targetId: "node-2" }],
        phase: "preview",
        createdAt: 1,
      }),
      "有 1 个草稿未成功生成，后续操作已暂停。请取消本次草稿后重试。",
    )
  })

  it("uses deferred actions for pending preview summaries while preserving original message actions", () => {
    const actions = [
      {
        action: "create_node" as const,
        nodeType: "content" as const,
        title: "角色设定：林雾",
        data: { isDraft: true },
      },
      {
        action: "connect_nodes" as const,
        sourceId: "角色设定：林雾",
        targetId: "角色设定：周祁",
      },
    ]

    assert.deepEqual(
      getPendingActionDisplayActions(
        { actions },
        {
          id: "tx-display",
          expectedDraftCount: 2,
          draftNodes: { "node-1": "pending" },
          deferredActions: [actions[1]],
          phase: "preview",
          createdAt: 1,
        },
      ),
      [actions[1]],
    )

    assert.deepEqual(getPendingActionDisplayActions({ actions }, undefined), actions)
  })
})

