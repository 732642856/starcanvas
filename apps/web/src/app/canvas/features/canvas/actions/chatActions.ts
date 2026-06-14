// ============================================================================
// ChatCanvasAction — 统一的 AI→画布 Action 类型体系
// Canonical source (single source of truth). All other files import from here.
// ============================================================================

// ============================================================================
// DISCRIMINATED UNION — each action type has its own shape
// ============================================================================

export type CreateNodeAction = {
  action: "create_node"
  nodeType?: "content" | "image" | "workflow" | "agent" | "sketch"
  nodeKind?: string
  title?: string
  content?: string
  prompt?: string
  position?: { x: number; y: number }
  data?: Record<string, unknown>
  description?: string
}

export type UpdateNodeAction = {
  action: "update_node"
  nodeId: string
  updates?: Record<string, unknown>
  description?: string
}

export type ConnectNodesAction = {
  action: "connect_nodes"
  sourceId: string
  targetId: string
  description?: string
}

export type SelectNodeAction = {
  action: "select_node"
  nodeId?: string
  id?: string
  description?: string
}

export type FocusNodeAction = {
  action: "focus_node"
  nodeId?: string
  id?: string
  description?: string
}

export type RunNodeAction = {
  action: "run_node"
  nodeId?: string
  id?: string
  title?: string
  description?: string
}

export type CreateWorkflowTemplateAction = {
  action: "create_workflow_template"
  template?: "tapnow_preproduction" | "arc_reel_agent" | "video_preproduction"
  title?: string
  description?: string
}

export type OpenPanelAction = {
  action: "open_panel"
  panel:
    | "chat"
    | "add_node"
    | "asset_library"
    | "project_bible"
    | "character_bible"
    | "scene_bible"
    | "style_bible"
    | "run_queue"
    | "property"
  description?: string
}

export type GenerateStoryboardAction = {
  action: "generate_storyboard"
  title?: string
  sourceNodeId?: string
  shots?: Array<{
    title?: string
    content?: string
    prompt?: string
    duration?: string
    cameraMovement?: string
    shotType?: string
  }>
  description?: string
}

export type LayoutCanvasAction = {
  action: "layout_canvas"
  layout?: "horizontal" | "vertical" | "grid"
  description?: string
}

export type DeleteNodeAction = {
  action: "delete_node"
  nodeId?: string
  id?: string
  description?: string
}

// ============================================================================
// UNION
// ============================================================================

export type ChatCanvasAction =
  | CreateNodeAction
  | UpdateNodeAction
  | ConnectNodesAction
  | SelectNodeAction
  | FocusNodeAction
  | RunNodeAction
  | CreateWorkflowTemplateAction
  | OpenPanelAction
  | GenerateStoryboardAction
  | LayoutCanvasAction
  | DeleteNodeAction

// Action type string literal union (for validation and schema)
export type ChatCanvasActionType = ChatCanvasAction["action"]

// ============================================================================
// APPLY ACTION RESULT
// ============================================================================

export type ApplyActionStatus =
  | "applied"           // successfully applied
  | "skipped"           // valid but skipped (e.g. target node not found)
  | "failed"            // error during application
  | "pending_confirmation"  // needs user approval (e.g. run_node without auto-run)

export type ApplyActionResult = {
  index: number         // zero-based position in the actions array
  action: ChatCanvasActionType  // the action type string
  status: ApplyActionStatus
  nodeId?: string       // generated/affected node id
  edgeId?: string       // generated/affected edge id
  reason?: string       // human-readable explanation
  error?: string        // error message if status === "failed"
}

export type ApplyActionsReport = {
  total: number
  applied: number
  skipped: number
  failed: number
  pendingConfirmation: number
  results: ApplyActionResult[]
  aliasMap: Record<string, string>  // title → generated node id (for AI→canvas reference)
}

// ============================================================================
// HELPERS
// ============================================================================

/** Human-readable label for an action type */
export function getActionLabel(actionType: ChatCanvasActionType): string {
  const labels: Record<ChatCanvasActionType, string> = {
    create_node: "创建节点",
    update_node: "更新节点",
    connect_nodes: "连接节点",
    select_node: "选中节点",
    focus_node: "聚焦节点",
    run_node: "运行节点",
    create_workflow_template: "创建工作流模板",
    open_panel: "打开面板",
    generate_storyboard: "生成分镜",
    layout_canvas: "整理画布",
    delete_node: "删除节点",
  }
  return labels[actionType] || actionType
}

/** Status icon for a single action result */
export function getStatusIcon(status: ApplyActionStatus): string {
  switch (status) {
    case "applied": return "✓"
    case "skipped": return "⊘"
    case "failed": return "✗"
    case "pending_confirmation": return "⚠"
  }
}

/** Build a concise summary string for the report */
export function formatActionsSummary(report: ApplyActionsReport): string {
  const parts: string[] = []
  if (report.applied > 0) parts.push(`✓ 已执行 ${report.applied} 个操作`)
  if (report.skipped > 0) parts.push(`⊘ 跳过 ${report.skipped} 个`)
  if (report.failed > 0) parts.push(`✗ 失败 ${report.failed} 个`)
  if (report.pendingConfirmation > 0) parts.push(`⚠ ${report.pendingConfirmation} 个待确认`)
  if (parts.length === 0) return "无操作"
  return parts.join("  ")
}

// ============================================================================
// HELPERS — extract nodeId from various action shapes
// ============================================================================

export function extractActionNodeId(action: ChatCanvasAction): string | undefined {
  return (action as any).nodeId ?? (action as any).id
}

export function extractActionSourceId(action: ChatCanvasAction): string | undefined {
  return (action as any).sourceId
}

export function extractActionTargetId(action: ChatCanvasAction): string | undefined {
  return (action as any).targetId
}

// ============================================================================
// FORMATTER — human-readable action summary for confirmation UI
// (从 WorkBuddy 副本迁移，支持 Ask 模式的三态确认面板)
// ============================================================================

/** Generate a human-readable one-line summary for a single action */
export function formatActionSummary(action: ChatCanvasAction): string {
  switch (action.action) {
    case "create_node": {
      const kind = action.nodeKind ?? action.nodeType ?? "content"
      const title = action.title ? `「${action.title}」` : ""
      return `创建${kind}节点${title}`
    }
    case "update_node": {
      return `更新节点 ${action.nodeId}`
    }
    case "connect_nodes": {
      return `连接节点 ${action.sourceId} → ${action.targetId}`
    }
    case "delete_node": {
      const did = action.nodeId ?? action.id
      return `删除节点 ${did ?? "未知"}`
    }
    case "select_node": {
      const sid = action.nodeId ?? action.id
      return sid ? `选中节点 ${sid}` : "取消选中"
    }
    case "focus_node": {
      const fid = action.nodeId ?? action.id
      return `聚焦到节点 ${fid ?? "未知"}`
    }
    case "run_node": {
      const rid = action.nodeId ?? action.id
      return `运行节点 ${rid ?? "未知"}`
    }
    default:
      return `未知操作: ${(action as any).action ?? "?"}`
  }
}

/**
 * Annotate a list of pending actions with human-readable summaries.
 * Returns a copy with a `_summary` field on each entry for use in UI.
 */
export function getPendingActionSummaries(actions: ChatCanvasAction[]): Array<ChatCanvasAction & { _summary: string; _index: number }> {
  return actions.map((act, i) => ({
    ...act,
    _summary: formatActionSummary(act),
    _index: i,
  }))
}
