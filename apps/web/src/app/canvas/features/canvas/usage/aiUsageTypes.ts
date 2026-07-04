// ============================================================================
// AI Usage Types — 模型用量记录类型（非积分系统）
// ============================================================================

export type AITaskType =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "embedding"
  | "unknown"

export type AIUsageStatus = "success" | "failed" | "cancelled"

export interface AIUsageRecord {
  id: string

  // Context
  canvasId?: string
  nodeId?: string
  runId?: string

  // Model info
  provider: string
  model: string
  taskType: AITaskType

  // Token usage (text models)
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number

  // Image usage
  imageCount?: number
  imageSize?: string

  // Video usage
  videoSeconds?: number
  videoResolution?: string

  // Cost estimation
  estimatedCostUsd?: number
  currency: "USD"

  // Timestamps
  startedAt: string
  finishedAt: string

  // Status
  status: AIUsageStatus
  error?: string
}

// Aggregate statistics
export interface UsageStats {
  totalCostUsd: number
  todayCostUsd: number
  thisMonthCostUsd: number
  totalRuns: number
  todayRuns: number
  thisMonthRuns: number
  successRuns: number
  failedRuns: number
  totalTokens: number
  totalImages: number
  totalVideoSeconds: number
  byProvider: Record<string, { costUsd: number; runs: number }>
  byModel: Record<string, { costUsd: number; runs: number }>
  byTaskType: Record<string, { costUsd: number; runs: number }>
}

export function computeUsageStats(records: AIUsageRecord[]): UsageStats {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const stats: UsageStats = {
    totalCostUsd: 0,
    todayCostUsd: 0,
    thisMonthCostUsd: 0,
    totalRuns: records.length,
    todayRuns: 0,
    thisMonthRuns: 0,
    successRuns: 0,
    failedRuns: 0,
    totalTokens: 0,
    totalImages: 0,
    totalVideoSeconds: 0,
    byProvider: {},
    byModel: {},
    byTaskType: {},
  }

  for (const r of records) {
    const cost = r.estimatedCostUsd ?? 0

    // Totals
    stats.totalCostUsd += cost
    if (r.finishedAt >= todayStart) stats.todayCostUsd += cost
    if (r.finishedAt >= monthStart) stats.thisMonthCostUsd += cost
    if (r.finishedAt >= todayStart) stats.todayRuns++
    if (r.finishedAt >= monthStart) stats.thisMonthRuns++
    stats.totalTokens += r.totalTokens ?? 0
    stats.totalImages += r.imageCount ?? 0
    stats.totalVideoSeconds += r.videoSeconds ?? 0

    // Status counts
    if (r.status === "success") stats.successRuns++
    else if (r.status === "failed") stats.failedRuns++

    // By provider
    const providerKey = r.provider || "unknown"
    if (!stats.byProvider[providerKey]) {
      stats.byProvider[providerKey] = { costUsd: 0, runs: 0 }
    }
    stats.byProvider[providerKey].costUsd += cost
    stats.byProvider[providerKey].runs++

    // By model
    const modelKey = r.model || "unknown"
    if (!stats.byModel[modelKey]) {
      stats.byModel[modelKey] = { costUsd: 0, runs: 0 }
    }
    stats.byModel[modelKey].costUsd += cost
    stats.byModel[modelKey].runs++

    // By task type
    const typeKey = r.taskType
    if (!stats.byTaskType[typeKey]) {
      stats.byTaskType[typeKey] = { costUsd: 0, runs: 0 }
    }
    stats.byTaskType[typeKey].costUsd += cost
    stats.byTaskType[typeKey].runs++
  }

  return stats
}

export function getNodeCostUsd(records: AIUsageRecord[], nodeId: string): number {
  return records
    .filter((r) => r.nodeId === nodeId)
    .reduce((sum, r) => sum + (r.estimatedCostUsd ?? 0), 0)
}

export function getNodeLastCostUsd(records: AIUsageRecord[], nodeId: string): number | undefined {
  const nodeRecords = records
    .filter((r) => r.nodeId === nodeId && r.status === "success")
    .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))
  return nodeRecords[0]?.estimatedCostUsd
}
