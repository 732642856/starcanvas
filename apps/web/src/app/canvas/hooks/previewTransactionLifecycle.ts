"use client";

import { useEffect } from "react";
import type {
  ApplyActionsReport,
  ChatCanvasAction,
} from "../features/canvas/actions/chatActions";
import { useCanvasStore } from "../stores/canvasStore";
import { collectPreviewTransactionLifecycleOperations } from "./previewTransactionLifecycleCore";

export function usePreviewTransactionLifecycle(
  applyChatActions?: (actions: ChatCanvasAction[]) => ApplyActionsReport,
): void {
  const previewTransactions = useCanvasStore((state) => state.previewTransactions);
  const cancelPreviewTransaction = useCanvasStore(
    (state) => state.cancelPreviewTransaction,
  );
  const commitPreviewTransaction = useCanvasStore(
    (state) => state.commitPreviewTransaction,
  );

  useEffect(() => {
    if (!applyChatActions) return;

    const operations = collectPreviewTransactionLifecycleOperations(
      previewTransactions,
    );

    for (const operation of operations) {
      if (operation.type === "cancel") {
        cancelPreviewTransaction(operation.txId);
        continue;
      }

      const report = applyChatActions(operation.actions);
      commitPreviewTransaction({ txId: operation.txId, report });
    }
  }, [
    applyChatActions,
    cancelPreviewTransaction,
    commitPreviewTransaction,
    previewTransactions,
  ]);
}

