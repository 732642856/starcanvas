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
  template?:
    | "tapnow_preproduction"
    | "arc_reel_agent"
    | "video_preproduction"
    | "grid_storyboard_video"
    | "character_turnaround_video"
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
    | "production_queue"
    | "run_queue"
    | "property"
    | "settings"
  description?: string
}

export type ConfigureProviderAction = {
  action: "configure_provider"
  baseUrl?: string
  apiKey?: string
  defaultModel?: string
  imageModel?: string
  videoModel?: string
  timeoutMs?: number
  keyStorageMode?: "session" | "local"
  openSettings?: boolean
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

export type AskClarificationAction = {
  action: "ask_clarification"
  question: string
  options?: string[]
  clarificationId?: string
  threadId?: string
  description?: string
  data?: Record<string, unknown>
}

export type PendingClarificationSnapshot = {
  clarificationId: string
  threadId?: string
  messageId: string
  question: string
  options?: string[]
  createdAt: number
}

export type ClarificationResumePayload = {
  clarificationId: string
  threadId?: string
  messageId: string
  question: string
  options?: string[]
  answer: string
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
  | ConfigureProviderAction
  | GenerateStoryboardAction
  | LayoutCanvasAction
  | DeleteNodeAction
  | AskClarificationAction

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
    configure_provider: "配置模型",
    generate_storyboard: "生成分镜",
    layout_canvas: "整理画布",
    delete_node: "删除节点",
    ask_clarification: "询问澄清",
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

export function isAskClarificationAction(action: ChatCanvasAction): action is AskClarificationAction {
  return action.action === "ask_clarification"
}

export function hasOnlyClarificationActions(actions: ChatCanvasAction[]): boolean {
  return actions.length > 0 && actions.every(isAskClarificationAction)
}

function toClarificationTokenPart(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown"
}

export function normalizeAskClarificationAction(
  action: AskClarificationAction,
  params: {
    messageId: string
    conversationId?: string
    actionIndex: number
  },
): AskClarificationAction {
  const threadId = action.threadId ?? params.conversationId
  const clarificationId = action.clarificationId ?? [
    "clarification",
    toClarificationTokenPart(threadId ?? "thread"),
    toClarificationTokenPart(params.messageId),
    String(params.actionIndex),
  ].join("-")

  return {
    ...action,
    clarificationId,
    threadId,
  }
}

export function buildPendingClarificationSnapshot(params: {
  action: AskClarificationAction
  messageId: string
  conversationId?: string
  createdAt: number
}): PendingClarificationSnapshot {
  const normalized = normalizeAskClarificationAction(params.action, {
    messageId: params.messageId,
    conversationId: params.conversationId,
    actionIndex: 0,
  })

  return {
    clarificationId: normalized.clarificationId!,
    threadId: normalized.threadId,
    messageId: params.messageId,
    question: normalized.question,
    options: normalized.options,
    createdAt: params.createdAt,
  }
}

export function buildClarificationAnswerContext(params: {
  clarificationId?: string
  threadId?: string
  question: string
  options?: string[]
  answer: string
}): string {
  const lines = [
    "【用户正在回答上一轮澄清问题】",
    params.clarificationId ? `澄清ID：${params.clarificationId}` : undefined,
    params.threadId ? `线程ID：${params.threadId}` : undefined,
    `问题：${params.question.trim()}`,
  ].filter(Boolean) as string[]
  const options = params.options
    ?.map((option) => option.trim())
    .filter(Boolean)
    .slice(0, 4)
  if (options?.length) {
    lines.push(`可选项：${options.join(" / ")}`)
  }
  lines.push(`用户回答：${params.answer.trim()}`)
  lines.push("请基于这个回答继续原计划；信息足够时优先输出可执行 canvas-actions。")
  return lines.join("\n")
}

export function buildClarificationResumePayload(params: {
  snapshot: PendingClarificationSnapshot
  answer: string
}): ClarificationResumePayload {
  return {
    clarificationId: params.snapshot.clarificationId,
    threadId: params.snapshot.threadId,
    messageId: params.snapshot.messageId,
    question: params.snapshot.question,
    options: params.snapshot.options,
    answer: params.answer.trim(),
  }
}

export function shouldClearPendingClarificationAfterAnswer(params: {
  answeredClarificationId?: string | null
  currentPendingClarificationId?: string | null
}): boolean {
  if (!params.answeredClarificationId) return false
  if (!params.currentPendingClarificationId) return true
  return params.currentPendingClarificationId === params.answeredClarificationId
}

export type ChatActionNodeReference = {
  id: string
  title?: unknown
  data?: { title?: unknown } | null
}

function normalizeActionReference(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function getActionNodeTitle(node: ChatActionNodeReference): string | undefined {
  return normalizeActionReference(node.data?.title) ?? normalizeActionReference(node.title)
}

/**
 * Resolve an AI-supplied node reference against the current canvas.
 *
 * AI actions often refer to nodes by the title they just created. The executor
 * still needs a concrete React Flow node id, so we accept explicit ids, aliases
 * gathered during this action batch, and unique/readable node titles.
 */
export function resolveActionNodeReference(params: {
  nodeId?: string
  id?: string
  title?: string
  aliasMap?: Record<string, string>
  nodes?: readonly ChatActionNodeReference[]
}): string | undefined {
  const aliasMap = params.aliasMap ?? {}
  const nodes = params.nodes ?? []
  const explicitId = normalizeActionReference(params.nodeId) ?? normalizeActionReference(params.id)
  const candidates = [params.nodeId, params.id, params.title]
    .map(normalizeActionReference)
    .filter((candidate, index, list): candidate is string => Boolean(candidate) && list.indexOf(candidate) === index)
  const nodeIds = new Set(nodes.map((node) => node.id))

  for (const candidate of candidates) {
    if (nodeIds.has(candidate)) return candidate

    const aliasTarget = normalizeActionReference(aliasMap[candidate])
    if (aliasTarget) return aliasTarget

    const titledNodes = nodes.filter((node) => getActionNodeTitle(node) === candidate)
    if (titledNodes.length > 0) return titledNodes[titledNodes.length - 1]!.id
  }

  return explicitId
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
      return `运行节点 ${rid ?? action.title ?? "未知"}`
    }
    case "open_panel": {
      return `打开 ${action.panel} 面板`
    }
    case "configure_provider": {
      const parts = []
      if (action.baseUrl) parts.push("中转站地址")
      if (action.apiKey) parts.push("API Key")
      if (action.defaultModel) parts.push("文本模型")
      if (action.imageModel) parts.push("图片模型")
      if (action.videoModel) parts.push("视频模型")
      return parts.length > 0 ? `配置 ${parts.join(" / ")}` : "更新模型设置"
    }
    case "create_workflow_template": {
      return `创建工作流模板 ${action.template ?? ""}`.trim()
    }
    case "generate_storyboard": {
      return `生成 ${action.shots?.length ?? 0} 个分镜`
    }
    case "ask_clarification": {
      return `需要澄清：${action.question}`
    }
    case "layout_canvas": {
      return `整理画布（${action.layout ?? "horizontal"}）`
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
export function transformActionsForAgentMode(
  actions: ChatCanvasAction[],
  mode: "ask" | "max" | "preview",
  messageId: string,
): ChatCanvasAction[] {
  if (mode !== "preview") return actions

  return actions.map((action) => {
    if (action.action !== "create_node") return action
    return {
      ...action,
      data: {
        ...action.data,
        isDraft: true,
        draftSourceChatId: messageId,
        runMeta: {
          runStatus: "pending",
          source: "ai",
          message: "AI 预览草稿，确认后继续运行。",
          pendingReason: "chat-preview",
        },
      },
    }
  })
}

export function splitPreviewActions(actions: ChatCanvasAction[]): {
  previewActions: ChatCanvasAction[]
  deferredActions: ChatCanvasAction[]
} {
  const previewActions: ChatCanvasAction[] = []
  const deferredActions: ChatCanvasAction[] = []

  for (const action of actions) {
    if (action.action === "create_node") {
      previewActions.push(action)
      continue
    }
    deferredActions.push(action)
  }

  return { previewActions, deferredActions }
}

export function resolveDeferredPreviewActions(
  actions: ChatCanvasAction[],
  aliasMap: Record<string, string>,
): ChatCanvasAction[] {
  return actions.map((action) => {
    if (action.action === "run_node") {
      if (action.nodeId || action.id || !action.title) return action
      const resolvedNodeId = aliasMap[action.title]
      if (!resolvedNodeId) return action
      return {
        ...action,
        nodeId: resolvedNodeId,
      }
    }

    if (action.action === "connect_nodes") {
      const resolvedSourceId = aliasMap[action.sourceId] ?? action.sourceId
      const resolvedTargetId = aliasMap[action.targetId] ?? action.targetId
      return {
        ...action,
        sourceId: resolvedSourceId,
        targetId: resolvedTargetId,
      }
    }

    return action
  })
}

export function getAppliedNodeIds(report?: ApplyActionsReport): string[] {
  if (!report) return []
  return report.results
    .filter((result) => result.action === "create_node" && result.status === "applied" && result.nodeId)
    .map((result) => result.nodeId as string)
}
