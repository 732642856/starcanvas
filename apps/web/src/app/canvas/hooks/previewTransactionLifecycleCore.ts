import type { ChatCanvasAction } from "../features/canvas/actions/chatActions.ts";
import { resolveDeferredPreviewActions } from "../features/canvas/actions/chatActions.ts";
import type { PreviewTransaction } from "../stores/canvasStore";
import {
  shouldAutoCancelPreviewTransaction,
  shouldAutoApplyDeferredPreviewActions,
} from "../components/chat/chatPreviewState.ts";

export type PreviewTransactionLifecycleOperation =
  | {
      type: "cancel";
      txId: string;
    }
  | {
      type: "commit";
      txId: string;
      actions: ChatCanvasAction[];
    };

export function collectPreviewTransactionLifecycleOperations(
  previewTransactions: Record<string, PreviewTransaction>,
): PreviewTransactionLifecycleOperation[] {
  const operations: PreviewTransactionLifecycleOperation[] = [];

  for (const [txId, previewTransaction] of Object.entries(previewTransactions)) {
    if (shouldAutoCancelPreviewTransaction(previewTransaction)) {
      operations.push({ type: "cancel", txId });
      continue;
    }

    if (!shouldAutoApplyDeferredPreviewActions(previewTransaction)) continue;

    operations.push({
      type: "commit",
      txId,
      actions: resolveDeferredPreviewActions(
        previewTransaction.deferredActions,
        previewTransaction.previewReport?.aliasMap ?? {},
      ),
    });
  }

  return operations;
}
