import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { collectPreviewTransactionLifecycleOperations } from "./previewTransactionLifecycleCore.ts";

describe("preview transaction lifecycle", () => {
  it("collects a commit operation after all draft nodes are confirmed", () => {
    const operations = collectPreviewTransactionLifecycleOperations({
      "tx-commit": {
        id: "tx-commit",
        expectedDraftCount: 2,
        draftNodes: {
          "node-1": "confirmed",
          "node-2": "confirmed",
        },
        deferredActions: [
          {
            action: "connect_nodes",
            sourceId: "角色设定：林雾",
            targetId: "角色设定：周祁",
          },
        ],
        previewReport: {
          total: 2,
          applied: 2,
          skipped: 0,
          failed: 0,
          pendingConfirmation: 0,
          results: [],
          aliasMap: {
            "角色设定：林雾": "node-1",
            "角色设定：周祁": "node-2",
          },
        },
        phase: "preview",
        createdAt: 1,
      },
    });

    assert.deepEqual(operations, [
      {
        type: "commit",
        txId: "tx-commit",
        actions: [
          {
            action: "connect_nodes",
            sourceId: "node-1",
            targetId: "node-2",
          },
        ],
      },
    ]);
  });

  it("collects a cancel operation when every draft node was discarded", () => {
    const operations = collectPreviewTransactionLifecycleOperations({
      "tx-cancel": {
        id: "tx-cancel",
        draftNodes: {
          "node-1": "discarded",
          "node-2": "discarded",
        },
        deferredActions: [],
        phase: "preview",
        createdAt: 1,
      },
    });

    assert.deepEqual(operations, [{ type: "cancel", txId: "tx-cancel" }]);
  });

  it("does not collect operations while preview drafts are still incomplete", () => {
    const operations = collectPreviewTransactionLifecycleOperations({
      "tx-blocked": {
        id: "tx-blocked",
        expectedDraftCount: 2,
        draftNodes: {
          "node-1": "confirmed",
        },
        deferredActions: [
          {
            action: "connect_nodes",
            sourceId: "node-1",
            targetId: "node-2",
          },
        ],
        phase: "preview",
        createdAt: 1,
      },
    });

    assert.deepEqual(operations, []);
  });
});
