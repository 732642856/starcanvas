import type { ChatCanvasAction } from "../../features/canvas/actions/chatActions.ts"

export type ChatAgentMode = "ask" | "max" | "preview"

export function hasClarificationAction(actions: readonly ChatCanvasAction[]): boolean {
  return actions.some((action) => action.action === "ask_clarification")
}

export function shouldAutoApplyAutoAgentActions(
  agentMode: ChatAgentMode,
  actions: readonly ChatCanvasAction[],
): boolean {
  return agentMode === "max" && actions.length > 0 && !hasClarificationAction(actions)
}

export function shouldAutoApplyClarificationSelection(
  agentMode: ChatAgentMode,
  actions: readonly ChatCanvasAction[],
): boolean {
  return agentMode !== "preview" && actions.length > 0 && !hasClarificationAction(actions)
}
