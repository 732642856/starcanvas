import type { ProductionRunQueueTask } from "../../../../../lib/storyboard/productionRunQueue.ts";
import type { AIUsageRecord, AIUsageStatus, AITaskType } from "./aiUsageTypes.ts";
import { estimateCostUsd } from "./estimateCost.ts";

export type BuildProductionTaskUsageRecordInput = {
  task: ProductionRunQueueTask;
  canvasId?: string;
  nodeId?: string;
  runId?: string;
  provider: string;
  model: string;
  startedAt: string;
  finishedAt: string;
  status: AIUsageStatus;
  error?: string;
  imageSize?: string;
  videoSeconds?: number;
  videoResolution?: string;
};

function taskTypeForAction(action: ProductionRunQueueTask["action"]): AITaskType {
  switch (action) {
    case "generate-storyboard-image":
      return "image";
    case "generate-video-clip":
      return "video";
    case "generate-voice-track":
      return "audio";
    case "create-subtitle-track":
    case "review-handoff-warnings":
      return "text";
    default:
      return "unknown";
  }
}

function cleanText(value: string | undefined, fallback: string): string {
  const text = value?.trim();
  return text || fallback;
}

export function buildProductionTaskUsageRecord(
  input: BuildProductionTaskUsageRecordInput,
): AIUsageRecord {
  const taskType = taskTypeForAction(input.task.action);
  const provider = cleanText(input.provider, "production");
  const model = cleanText(input.model, input.task.action);
  const imageCount = taskType === "image" ? 1 : undefined;
  const videoSeconds = taskType === "video" ? input.videoSeconds : undefined;
  const estimatedCostUsd = estimateCostUsd({
    provider,
    model,
    taskType,
    imageCount,
    videoSeconds,
  });

  return {
    id: `usage-${input.task.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    canvasId: input.canvasId,
    nodeId: input.nodeId ?? input.task.shotId,
    runId: input.runId ?? input.task.id,
    provider,
    model,
    taskType,
    imageCount,
    imageSize: taskType === "image" ? input.imageSize : undefined,
    videoSeconds,
    videoResolution: taskType === "video" ? input.videoResolution : undefined,
    estimatedCostUsd,
    currency: "USD",
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    status: input.status,
    error: input.error?.trim() || undefined,
  };
}
