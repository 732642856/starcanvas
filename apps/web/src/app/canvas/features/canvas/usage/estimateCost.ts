// ============================================================================
// Cost Estimation — 根据 usage 数据估算美元成本
// ============================================================================

import { findPricing } from "./modelPricing.ts"
import type { AITaskType } from "./aiUsageTypes.ts"

export interface EstimateInput {
  provider: string
  model: string
  taskType: AITaskType
  inputTokens?: number
  outputTokens?: number
  imageCount?: number
  videoSeconds?: number
}

/**
 * 估算单次调用成本（美元）
 * 返回 undefined 表示定价表中没有该模型
 */
export function estimateCostUsd(params: EstimateInput): number | undefined {
  const pricing = findPricing(params.provider, params.model, params.taskType)
  if (!pricing) return undefined

  let cost = 0

  // Text tokens
  if (params.inputTokens !== undefined && pricing.inputPer1MTokensUsd !== undefined) {
    cost += (params.inputTokens / 1_000_000) * pricing.inputPer1MTokensUsd
  }
  if (params.outputTokens !== undefined && pricing.outputPer1MTokensUsd !== undefined) {
    cost += (params.outputTokens / 1_000_000) * pricing.outputPer1MTokensUsd
  }

  // Image
  if (params.imageCount !== undefined && pricing.imagePerUnitUsd !== undefined) {
    cost += params.imageCount * pricing.imagePerUnitUsd
  }

  // Video
  if (params.videoSeconds !== undefined && pricing.videoPerSecondUsd !== undefined) {
    cost += params.videoSeconds * pricing.videoPerSecondUsd
  }

  return cost
}

/**
 * 格式化美元金额
 */
export function formatCostUsd(costUsd: number | undefined): string {
  if (costUsd === undefined) return "—"
  if (costUsd < 0.01) return "<$0.01"
  return `$${costUsd.toFixed(3)}`
}

/**
 * 格式化 token 数量
 */
export function formatTokens(n: number | undefined): string {
  if (n === undefined) return "—"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}
