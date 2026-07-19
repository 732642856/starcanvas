import type {
  ProviderHealthItem,
  ProviderHealthSummary,
  ProviderHealthStatus,
} from "./provider-health-summary.ts";
import type {
  ProviderSmokeItem,
  ProviderRealSmokeTarget,
  ProviderSmokeReport,
  ProviderSmokeStatus,
} from "./providerSmoke.ts";
import {
  getStoredProviderSmokeReadinessStatus,
  type StoredProviderSmokeResult,
} from "./providerSmokeResult.ts";

export type TaskReadinessTaskId =
  | "chat-create"
  | "auto-agent-project-bootstrap"
  | "image-production"
  | "production-run";

export type TaskReadinessStatus = "ready" | "warning" | "blocked";

export interface TaskReadinessItem {
  taskId: TaskReadinessTaskId;
  label: string;
  status: TaskReadinessStatus;
  summary: string;
  blockingReasons: string[];
  recommendedFixes: string[];
}

export interface TaskReadinessSummary {
  items: TaskReadinessItem[];
  blockingCount: number;
  warningCount: number;
}

export interface BuildTaskReadinessSummaryInput {
  providerHealthSummary: ProviderHealthSummary | null;
  providerSmokeReport: ProviderSmokeReport | null;
  storedProviderSmokeResults?: Partial<Record<ProviderRealSmokeTarget, StoredProviderSmokeResult>>;
}

export function getTaskReadinessPrimaryBlockingReason(
  item: Pick<TaskReadinessItem, "blockingReasons" | "recommendedFixes"> | null | undefined,
): string | undefined {
  return item?.blockingReasons[0] ?? item?.recommendedFixes[0] ?? undefined;
}

export function getTaskReadinessPrimaryFixHint(
  item: Pick<TaskReadinessItem, "blockingReasons" | "recommendedFixes"> | null | undefined,
): string | undefined {
  return item?.recommendedFixes[0] ?? item?.blockingReasons[0] ?? undefined;
}

export function truncateReadinessHint(text: string | undefined, maxLength = 16): string | undefined {
  const normalized = text?.replace(/^原因：?/, "").trim();
  if (!normalized) return undefined;
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

type CapabilityStatus = {
  status: TaskReadinessStatus;
  reasons: string[];
  fixes: string[];
};

function toTaskStatus(
  status: ProviderHealthStatus | ProviderSmokeStatus | undefined,
): TaskReadinessStatus {
  if (status === "blocked") return "blocked";
  if (status === "warning") return "warning";
  return "ready";
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function mapHealthItem(
  summary: ProviderHealthSummary | null,
  id: "text" | "image" | "video",
): ProviderHealthItem | undefined {
  return summary?.items.find((item) => item.id === id);
}

function mapSmokeItem(
  report: ProviderSmokeReport | null,
  target: "text" | "image" | "video",
): ProviderSmokeItem | undefined {
  return report?.items.find((item) => item.target === target);
}

function mapStoredSmokeResult(
  results: BuildTaskReadinessSummaryInput["storedProviderSmokeResults"],
  target: "text" | "image" | "video",
): StoredProviderSmokeResult | undefined {
  return results?.[target];
}

function mergeCapabilityStatus(
  healthItem: ProviderHealthItem | undefined,
  smokeItem: ProviderSmokeItem | undefined,
  storedSmokeResult?: StoredProviderSmokeResult,
): CapabilityStatus {
  const healthStatus = toTaskStatus(healthItem?.status);
  const smokeStatus = toTaskStatus(smokeItem?.status);
  const storedStatus = getStoredProviderSmokeReadinessStatus(storedSmokeResult);
  const blocked = healthStatus === "blocked" || smokeStatus === "blocked" || storedStatus === "blocked";
  const warning = healthStatus === "warning" || smokeStatus === "warning" || storedStatus === "warning";
  const healthReasons =
    healthStatus === "ready" || !healthItem
      ? []
      : [...(healthItem.details ?? []), healthItem.message];
  const smokeReasons =
    smokeStatus === "ready" || !smokeItem
      ? []
      : [smokeItem.summary, ...smokeItem.details];
  const storedSmokeReasons =
    storedStatus === "ready" || !storedSmokeResult
      ? []
      : [
          `最近一次真实 smoke：${storedSmokeResult.summaryTitle}`,
          storedSmokeResult.message,
          ...(storedSmokeResult.details ?? []),
        ];

  return {
    status: blocked ? "blocked" : warning ? "warning" : "ready",
    reasons: dedupe([...storedSmokeReasons, ...smokeReasons, ...healthReasons]),
    fixes: dedupe(
      [
        ...(storedSmokeResult?.hints ?? []),
        ...(healthItem?.details ?? []),
        ...(smokeItem?.details ?? []),
      ].filter((detail) =>
        /配置|填写|provider|Provider|模型|Model|Key|API/i.test(detail),
      ),
    ),
  };
}

function buildTaskSummary(
  label: string,
  status: TaskReadinessStatus,
  parts: string[],
): string {
  if (status === "ready") return `${label} 可开始。`;
  if (status === "blocked") return `${label} 仍被阻塞：${parts[0] ?? "请先补齐依赖。"}`;
  return `${label} 可继续，但需注意：${parts[0] ?? "仍有部分前置条件待确认。"}`;
}

export function buildTaskReadinessSummary(
  input: BuildTaskReadinessSummaryInput,
): TaskReadinessSummary {
  const text = mergeCapabilityStatus(
    mapHealthItem(input.providerHealthSummary, "text"),
    mapSmokeItem(input.providerSmokeReport, "text"),
    mapStoredSmokeResult(input.storedProviderSmokeResults, "text"),
  );
  const image = mergeCapabilityStatus(
    mapHealthItem(input.providerHealthSummary, "image"),
    mapSmokeItem(input.providerSmokeReport, "image"),
    mapStoredSmokeResult(input.storedProviderSmokeResults, "image"),
  );
  const video = mergeCapabilityStatus(
    mapHealthItem(input.providerHealthSummary, "video"),
    mapSmokeItem(input.providerSmokeReport, "video"),
    mapStoredSmokeResult(input.storedProviderSmokeResults, "video"),
  );

  const items: TaskReadinessItem[] = [
    {
      taskId: "chat-create",
      label: "一句话创作 / 聊天",
      status: text.status,
      summary: buildTaskSummary("一句话创作 / 聊天", text.status, text.reasons),
      blockingReasons: text.status === "blocked" ? text.reasons : [],
      recommendedFixes: text.fixes,
    },
    {
      taskId: "auto-agent-project-bootstrap",
      label: "Auto Agent 项目骨架",
      status:
        text.status === "blocked"
          ? "blocked"
          : image.status === "blocked"
            ? "warning"
            : "ready",
      summary:
        text.status === "blocked"
          ? buildTaskSummary("Auto Agent 项目骨架", "blocked", text.reasons)
          : image.status === "blocked"
            ? "Auto Agent 可先生成文本骨架，但视觉概念图/生图步骤仍未就绪。"
            : "Auto Agent 项目骨架可开始。",
      blockingReasons: text.status === "blocked" ? text.reasons : [],
      recommendedFixes: dedupe([...text.fixes, ...image.fixes]),
    },
    {
      taskId: "image-production",
      label: "图片生产",
      status: image.status,
      summary: buildTaskSummary("图片生产", image.status, image.reasons),
      blockingReasons: image.status === "blocked" ? image.reasons : [],
      recommendedFixes: image.fixes,
    },
    {
      taskId: "production-run",
      label: "完整生产队列",
      status:
        image.status === "blocked"
          ? "blocked"
          : video.status === "blocked"
            ? "blocked"
            : video.status === "warning"
              ? "warning"
              : "ready",
      summary:
        image.status === "blocked"
          ? buildTaskSummary("完整生产队列", "blocked", image.reasons)
          : video.status === "blocked"
            ? buildTaskSummary("完整生产队列", "blocked", video.reasons)
            : video.status === "warning"
              ? "完整生产队列可开始，但视频链路仍需人工确认 provider / key 条件。"
              : "完整生产队列可开始。",
      blockingReasons:
        image.status === "blocked"
          ? image.reasons
          : video.status === "blocked"
            ? video.reasons
            : [],
      recommendedFixes: dedupe([...image.fixes, ...video.fixes]),
    },
  ];

  return {
    items,
    blockingCount: items.filter((item) => item.status === "blocked").length,
    warningCount: items.filter((item) => item.status === "warning").length,
  };
}
