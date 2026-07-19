import type {
  ApplyActionsReport,
  ChatCanvasAction,
} from "../../features/canvas/actions/chatActions"
import type { PreviewTransaction } from "../../stores/canvasStore"

type ChatActionMessageState = {
  actions?: ChatCanvasAction[]
  actionsApplied?: boolean
  actionsCancelled?: boolean
  actionsReport?: ApplyActionsReport
}

export type ChatActionUiPhase = "pending" | "applied" | "cancelled"

export type ChatActionUiState = {
  phase: ChatActionUiPhase
  report?: ApplyActionsReport
  isDraftPreview: boolean
}

export type PreviewDraftProgress = {
  total: number
  visible: number
  pending: number
  confirmed: number
  discarded: number
  missing: number
}

export function hasDraftPreviewActions(
  actions: ChatCanvasAction[] | undefined,
): boolean {
  return (
    actions?.some(
      (action) => action.action === "create_node" && action.data?.isDraft === true,
    ) ?? false
  )
}

export function hasPreviewDraftTransaction(
  previewTransaction: PreviewTransaction | undefined,
): boolean {
  return Boolean(previewTransaction && Object.keys(previewTransaction.draftNodes).length > 0)
}

export function deriveChatActionUiState(
  message: ChatActionMessageState,
  previewTransaction?: PreviewTransaction,
): ChatActionUiState {
  const isDraftPreview =
    hasDraftPreviewActions(message.actions) || hasPreviewDraftTransaction(previewTransaction)

  if (previewTransaction && isDraftPreview) {
    if (previewTransaction.phase === "cancelled") {
      return {
        phase: "cancelled",
        report: previewTransaction.commitReport ?? previewTransaction.previewReport,
        isDraftPreview,
      }
    }

    if (previewTransaction.phase === "deferred_applied") {
      return {
        phase: "applied",
        report: previewTransaction.commitReport ?? previewTransaction.previewReport,
        isDraftPreview,
      }
    }

    if (previewTransaction.deferredActions.length === 0) {
      return {
        phase: "applied",
        report: previewTransaction.previewReport,
        isDraftPreview,
      }
    }

    return {
      phase: "pending",
      report: previewTransaction.previewReport,
      isDraftPreview,
    }
  }

  if (previewTransaction?.phase === "cancelled" || message.actionsCancelled) {
    return {
      phase: "cancelled",
      report: previewTransaction?.commitReport ?? message.actionsReport,
      isDraftPreview,
    }
  }

  if (previewTransaction?.phase === "deferred_applied") {
    return {
      phase: "applied",
      report: previewTransaction.commitReport ?? message.actionsReport,
      isDraftPreview,
    }
  }

  if (message.actionsApplied) {
    return {
      phase: "applied",
      report: message.actionsReport ?? previewTransaction?.previewReport,
      isDraftPreview,
    }
  }

  return {
    phase: "pending",
    report: previewTransaction?.previewReport ?? message.actionsReport,
    isDraftPreview,
  }
}

export function getCancelablePreviewNodeIds(
  previewTransaction: PreviewTransaction | undefined,
  fallbackNodeIds: string[] = [],
): string[] {
  if (!previewTransaction) return fallbackNodeIds

  return Object.entries(previewTransaction.draftNodes)
    .filter(([, state]) => state === "pending")
    .map(([nodeId]) => nodeId)
}

export function shouldAutoApplyDeferredPreviewActions(
  previewTransaction: PreviewTransaction | undefined,
): boolean {
  if (!previewTransaction) return false
  if (previewTransaction.phase !== "preview") return false
  if (previewTransaction.deferredActions.length === 0) return false

  const draftNodeStates = Object.values(previewTransaction.draftNodes)
  if (draftNodeStates.length === 0) return false
  const expectedDraftCount = previewTransaction.expectedDraftCount ?? draftNodeStates.length
  if (expectedDraftCount > draftNodeStates.length) return false

  return draftNodeStates.every((state) => state === "confirmed")
}

export function shouldAutoCancelPreviewTransaction(
  previewTransaction: PreviewTransaction | undefined,
): boolean {
  if (!previewTransaction) return false
  if (previewTransaction.phase !== "preview") return false

  const draftNodeStates = Object.values(previewTransaction.draftNodes)
  if (draftNodeStates.length === 0) return false

  if (draftNodeStates.every((state) => state === "discarded")) {
    return true
  }

  if (previewTransaction.deferredActions.length === 0) return false

  const hasDiscarded = draftNodeStates.some((state) => state === "discarded")
  const allResolved = draftNodeStates.every((state) => state !== "pending")

  return hasDiscarded && allResolved
}

export function getPreviewDraftProgress(
  previewTransaction: PreviewTransaction | undefined,
): PreviewDraftProgress | undefined {
  if (!previewTransaction) return undefined

  const states = Object.values(previewTransaction.draftNodes)
  const expectedDraftCount = previewTransaction.expectedDraftCount ?? states.length
  if (states.length === 0 && expectedDraftCount === 0) return undefined
  const visible = states.length
  const total = Math.max(expectedDraftCount, visible)
  const missing = Math.max(total - visible, 0)

  return {
    total,
    visible,
    pending: states.filter((state) => state === "pending").length,
    confirmed: states.filter((state) => state === "confirmed").length,
    discarded: states.filter((state) => state === "discarded").length,
    missing,
  }
}

export function getPreviewDraftBlockingReason(
  previewTransaction: PreviewTransaction | undefined,
): string | undefined {
  if (!previewTransaction || previewTransaction.phase !== "preview") return undefined
  if (previewTransaction.deferredActions.length === 0) return undefined

  const progress = getPreviewDraftProgress(previewTransaction)
  if (!progress || progress.missing === 0) return undefined

  return `有 ${progress.missing} 个草稿未成功生成，后续操作已暂停。请取消本次草稿后重试。`
}

export function getPendingActionDisplayActions(
  message: ChatActionMessageState,
  previewTransaction: PreviewTransaction | undefined,
): ChatCanvasAction[] {
  if (!message.actions) return []

  const isDraftPreview =
    hasDraftPreviewActions(message.actions) || hasPreviewDraftTransaction(previewTransaction)
  if (!isDraftPreview || !previewTransaction) return message.actions
  if (previewTransaction.phase !== "preview") return message.actions
  if (previewTransaction.deferredActions.length === 0) return message.actions

  return previewTransaction.deferredActions
}
